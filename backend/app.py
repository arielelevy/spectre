import json
import os
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from shared.logging import configure_logging
import logging

from backend.services.redis_service import RedisService
from backend.services.clickhouse_service import ClickHouseService

# Initialize Logging
configure_logging("backend")
logger = logging.getLogger(__name__)

GITHUB_QUEUE_STREAM = os.getenv("GITHUB_INGEST_QUEUE", "job:queue")

app = FastAPI(title="Spectre Backend")

cors_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    logger.info("")
    logger.info(
        "======================================================================"
    )
    logger.info("🚀 Starting Spectre Backend")
    logger.info(
        "======================================================================"
    )
    logger.info("[STARTUP] Initializing services...")

    # Check Redis
    logger.info("- Redis: connecting...")
    try:
        redis_client = RedisService.get_instance().client
        info = redis_client.info()
        logger.info("- Redis: ✅ [OK] version=%s", info.get("redis_version", "unknown"))
    except Exception as e:
        logger.error("- Redis: ❗ [ERR] %s", e)
        logger.error("- Redis: shutdown required; exiting")
        os._exit(1)

    # Check ClickHouse
    logger.info("- ClickHouse: connecting...")
    try:
        ch_service = ClickHouseService.get_instance()
        if ch_service.ping():
            logger.info("- ClickHouse: ✅ [OK] ping")
        else:
            logger.warning("- ClickHouse: ⚠️ [WARN] ping failed")
    except Exception as e:
        logger.error("- ClickHouse: ❗ [ERR] %s", e)
        logger.error("- ClickHouse: shutdown required; exiting")
        os._exit(1)

    logger.info(
        "======================================================================"
    )
    logger.info("✅ Application setup completed")
    logger.info(
        "======================================================================"
    )


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Spectre Backend...")

    # Close Redis
    try:
        RedisService.get_instance().close()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.error(f"Error closing Redis: {e}")

    # Close ClickHouse
    try:
        ClickHouseService.get_instance().close()
        logger.info("ClickHouse connection closed")
    except Exception as e:
        logger.error(f"Error closing ClickHouse: {e}")

    logger.info("Shutdown complete.")


class GitHubPublicIngestRequest(BaseModel):
    window_minutes: int = 10


class Node(BaseModel):
    id: str
    type: str
    attrs: dict
    updated_at: str


class Edge(BaseModel):
    src: str
    dst: str
    type: str
    weight: float
    recency: str
    attrs: dict


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ingest/github/public")
def enqueue_github_public_ingest(request: GitHubPublicIngestRequest) -> dict:
    job_id = _enqueue_public_ingest(window_minutes=request.window_minutes)
    return {"status": "queued", "job_id": job_id, "stream": GITHUB_QUEUE_STREAM}


def _enqueue_public_ingest(window_minutes: int) -> str:
    client = RedisService.get_instance(pool_size=20).client
    payload = {
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "window_minutes": window_minutes,
    }
    job_id = client.xadd(GITHUB_QUEUE_STREAM, {"payload": json.dumps(payload)})
    logger.info("📨 Enqueued ingest job %s", job_id)
    return job_id


# --- Graph & Dashboard Endpoints ---


def _execute_ch(sql: str) -> dict:
    """Helper to execute ClickHouse query returning JSON."""
    service = ClickHouseService.get_instance()
    # Ensure we get JSON output
    full_sql = f"{sql} FORMAT JSON"
    try:
        result_text = service.query(full_sql)
        return json.loads(result_text)
    except Exception as e:
        sql_preview = " ".join(sql.split())
        if len(sql_preview) > 200:
            sql_preview = f"{sql_preview[:200]}..."
        logger.error(
            "ClickHouse query failed | sql=%s | error=%s",
            sql_preview,
            e,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e))


def _get_kpis() -> dict:
    sql_nodes = "SELECT count() as count FROM spectre.nodes"
    sql_edges = "SELECT count() as count FROM spectre.edges"
    sql_events = "SELECT count() as count FROM spectre.events"

    nodes_count = _execute_ch(sql_nodes)["data"][0]["count"]
    edges_count = _execute_ch(sql_edges)["data"][0]["count"]
    events_count = _execute_ch(sql_events)["data"][0]["count"]

    risk_score = min(99.9, round((events_count / max(nodes_count, 1)) * 100, 1))

    return {
        "nodes_count": nodes_count,
        "edges_count": edges_count,
        "events_count": events_count,
        "risk_level": "NOMINAL",
        "risk_score": risk_score,
    }


@app.get("/graph/search", response_model=List[Node])
def search_nodes(q: str = Query(..., min_length=2)):
    """Search for nodes by ID or attributes."""
    # Simple search by ID for now.
    # Note: ClickHouse SQL injection prevention needed for production.
    # Using parameterized queries is better but HTTP interface is simple string.
    # We sanitise input minimally here.
    sanitized_q = q.replace("'", "")
    sql = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id ILIKE '%{sanitized_q}%'
    LIMIT 20
    """
    data = _execute_ch(sql)
    nodes = []
    for row in data.get("data", []):
        nodes.append(
            Node(
                id=row["id"],
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )
    return nodes


@app.get("/graph/neighbors", response_model=dict)
def get_neighbors(node_id: str, limit: int = Query(400, ge=50, le=2000)):
    """Get 1st degree connections for a node."""
    sanitized_id = node_id.replace("'", "")

    # Get outgoing edges
    sql_edges = f"""
    SELECT src, dst, type, weight, toString(recency) as recency, attrs_json
    FROM spectre.edges
    WHERE src = '{sanitized_id}' OR dst = '{sanitized_id}'
    LIMIT {limit}
    """
    edges_data = _execute_ch(sql_edges)

    edges = []
    neighbor_ids = set()

    for row in edges_data.get("data", []):
        edges.append(
            Edge(
                src=row["src"],
                dst=row["dst"],
                type=row["type"],
                weight=row["weight"],
                recency=row["recency"],
                attrs=json.loads(row["attrs_json"]),
            )
        )
        neighbor_ids.add(row["src"])
        neighbor_ids.add(row["dst"])

    # Get neighbor nodes details
    nodes = []
    if neighbor_ids:
        ids_list = "'" + "','".join(neighbor_ids) + "'"
        sql_nodes = f"""
        SELECT id, type, attrs_json, toString(updated_at) as updated_at
        FROM spectre.nodes
        WHERE id IN ({ids_list})
        """
        nodes_data = _execute_ch(sql_nodes)
        for row in nodes_data.get("data", []):
            nodes.append(
                Node(
                    id=row["id"],
                    type=row["type"],
                    attrs=json.loads(row["attrs_json"]),
                    updated_at=row["updated_at"],
                )
            )

    return {"nodes": nodes, "edges": edges}


@app.get("/graph/expand", response_model=dict)
def expand_graph(
    node_id: str,
    depth: int = Query(3, ge=1, le=5),
    max_nodes: int = Query(800, ge=10, le=5000),
    max_edges: int = Query(2000, ge=100, le=10000),
):
    sanitized_id = node_id.replace("'", "")
    frontier = {sanitized_id}
    seen = {sanitized_id}
    edges: list[Edge] = []

    for _ in range(depth):
        if not frontier or len(seen) >= max_nodes or len(edges) >= max_edges:
            break
        ids_list = "'" + "','".join(frontier) + "'"
        sql_edges = f"""
        SELECT src, dst, type, weight, toString(recency) as recency, attrs_json
        FROM spectre.edges
        WHERE src IN ({ids_list}) OR dst IN ({ids_list})
        LIMIT {max_edges}
        """
        edges_data = _execute_ch(sql_edges)
        frontier = set()
        for row in edges_data.get("data", []):
            edge = Edge(
                src=row["src"],
                dst=row["dst"],
                type=row["type"],
                weight=row["weight"],
                recency=row["recency"],
                attrs=json.loads(row["attrs_json"]),
            )
            edges.append(edge)
            if edge.src not in seen and len(seen) < max_nodes:
                frontier.add(edge.src)
                seen.add(edge.src)
            if edge.dst not in seen and len(seen) < max_nodes:
                frontier.add(edge.dst)
                seen.add(edge.dst)
            if len(edges) >= max_edges:
                break

    if not seen:
        return {"nodes": [], "edges": []}

    ids_list = "'" + "','".join(seen) + "'"
    sql_nodes = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id IN ({ids_list})
    """
    nodes_data = _execute_ch(sql_nodes)
    nodes = []
    seen_nodes = set()
    for row in nodes_data.get("data", []):
        node_id = row["id"]
        if node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        nodes.append(
            Node(
                id=node_id,
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )

    return {"nodes": nodes, "edges": edges}


@app.get("/graph/top", response_model=dict)
def get_top_nodes(
    repo_limit: int = Query(12, ge=1, le=200),
    user_limit: int = Query(12, ge=1, le=200),
    edge_limit: int = Query(800, ge=100, le=5000),
):
    sql_repo = f"""
    SELECT n.id AS id, count() as degree FROM (
        SELECT src as id FROM spectre.edges
        UNION ALL
        SELECT dst as id FROM spectre.edges
    ) deg
    INNER JOIN spectre.nodes n ON n.id = deg.id
    WHERE n.type = 'Repo'
    GROUP BY n.id
    ORDER BY degree DESC
    LIMIT {repo_limit}
    """
    sql_user = f"""
    SELECT n.id AS id, count() as degree FROM (
        SELECT src as id FROM spectre.edges
        UNION ALL
        SELECT dst as id FROM spectre.edges
    ) deg
    INNER JOIN spectre.nodes n ON n.id = deg.id
    WHERE n.type = 'User'
    GROUP BY n.id
    ORDER BY degree DESC
    LIMIT {user_limit}
    """

    repo_data = _execute_ch(sql_repo)
    user_data = _execute_ch(sql_user)
    ids = [row["id"] for row in repo_data.get("data", [])]
    ids.extend(row["id"] for row in user_data.get("data", []))
    if not ids:
        return {"nodes": [], "edges": []}

    sanitized_ids = [value.replace("'", "") for value in ids]
    ids_list = "'" + "','".join(sanitized_ids) + "'"

    sql_nodes = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id IN ({ids_list})
    """
    nodes_data = _execute_ch(sql_nodes)
    nodes = []
    seen_nodes = set()
    for row in nodes_data.get("data", []):
        node_id = row["id"]
        if node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        nodes.append(
            Node(
                id=node_id,
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )

    sql_edges = f"""
    SELECT src, dst, type, weight, toString(recency) as recency, attrs_json
    FROM spectre.edges
    WHERE src IN ({ids_list}) AND dst IN ({ids_list})
    LIMIT {edge_limit}
    """
    edges_data = _execute_ch(sql_edges)
    edges = []
    for row in edges_data.get("data", []):
        edges.append(
            Edge(
                src=row["src"],
                dst=row["dst"],
                type=row["type"],
                weight=row["weight"],
                recency=row["recency"],
                attrs=json.loads(row["attrs_json"]),
            )
        )

    return {"nodes": nodes, "edges": edges}


@app.get("/graph/people", response_model=dict)
def get_people_graph(
    min_shared_repos: int = Query(2, ge=1, le=50),
    limit: int = Query(200, ge=10, le=2000),
    user_limit: int = Query(500, ge=50, le=5000),
):
    sql_pairs = f"""
    WITH top_users AS (
        SELECT id FROM (
            SELECT src as id, count() as degree
            FROM spectre.edges
            GROUP BY id
            ORDER BY degree DESC
            LIMIT {user_limit}
        )
    )
    SELECT
        e1.src AS user_a,
        e2.src AS user_b,
        countDistinct(e1.dst) AS shared_repos
    FROM spectre.edges e1
    JOIN spectre.edges e2
      ON e1.dst = e2.dst
    WHERE e1.src < e2.src
      AND e1.src IN top_users
      AND e2.src IN top_users
    GROUP BY user_a, user_b
    HAVING shared_repos >= {min_shared_repos}
    ORDER BY shared_repos DESC
    LIMIT {limit}
    """
    pairs_data = _execute_ch(sql_pairs)
    rows = pairs_data.get("data", [])
    if not rows:
        return {"nodes": [], "edges": []}

    user_ids = set()
    for row in rows:
        user_ids.add(row["user_a"])
        user_ids.add(row["user_b"])

    sanitized_ids = [value.replace("'", "") for value in user_ids]
    ids_list = "'" + "','".join(sanitized_ids) + "'"

    sql_nodes = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id IN ({ids_list})
    """
    nodes_data = _execute_ch(sql_nodes)
    nodes = []
    for row in nodes_data.get("data", []):
        nodes.append(
            Node(
                id=row["id"],
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )

    edges = []
    for row in rows:
        edges.append(
            Edge(
                src=row["user_a"],
                dst=row["user_b"],
                type="CO_INTERACTED",
                weight=row["shared_repos"],
                recency=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                attrs={"shared_repos": row["shared_repos"]},
            )
        )

    return {"nodes": nodes, "edges": edges}


@app.get("/graph/repo-users", response_model=dict)
def get_repo_user_graph(
    repo_limit: int = Query(20, ge=1, le=200),
    user_limit: int = Query(60, ge=1, le=500),
    edge_limit: int = Query(1500, ge=100, le=5000),
):
    sql_repo = f"""
    SELECT n.id AS id, count() as degree FROM (
        SELECT dst as id FROM spectre.edges
    ) deg
    INNER JOIN spectre.nodes n ON n.id = deg.id
    WHERE n.type = 'Repo'
    GROUP BY n.id
    ORDER BY degree DESC
    LIMIT {repo_limit}
    """
    sql_user = f"""
    SELECT n.id AS id, count() as degree FROM (
        SELECT src as id FROM spectre.edges
    ) deg
    INNER JOIN spectre.nodes n ON n.id = deg.id
    WHERE n.type = 'User'
    GROUP BY n.id
    ORDER BY degree DESC
    LIMIT {user_limit}
    """

    repo_data = _execute_ch(sql_repo)
    user_data = _execute_ch(sql_user)
    repo_ids = [row["id"] for row in repo_data.get("data", [])]
    user_ids = [row["id"] for row in user_data.get("data", [])]

    if not repo_ids or not user_ids:
        return {"nodes": [], "edges": []}

    sanitized_repo_ids = [value.replace("'", "") for value in repo_ids]
    sanitized_user_ids = [value.replace("'", "") for value in user_ids]
    repo_list = "'" + "','".join(sanitized_repo_ids) + "'"
    user_list = "'" + "','".join(sanitized_user_ids) + "'"

    sql_nodes = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id IN ({repo_list}) OR id IN ({user_list})
    """
    nodes_data = _execute_ch(sql_nodes)
    nodes = []
    seen_nodes = set()
    for row in nodes_data.get("data", []):
        node_id = row["id"]
        if node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        nodes.append(
            Node(
                id=node_id,
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )

    sql_edges = f"""
    SELECT src, dst, type, weight, toString(recency) as recency, attrs_json
    FROM spectre.edges
    WHERE src IN ({user_list}) AND dst IN ({repo_list})
    LIMIT {edge_limit}
    """
    edges_data = _execute_ch(sql_edges)
    edges = []
    for row in edges_data.get("data", []):
        edges.append(
            Edge(
                src=row["src"],
                dst=row["dst"],
                type=row["type"],
                weight=row["weight"],
                recency=row["recency"],
                attrs=json.loads(row["attrs_json"]),
            )
        )

    return {"nodes": nodes, "edges": edges}


@app.get("/graph/repos", response_model=dict)
def get_repo_graph(
    min_shared_users: int = Query(2, ge=1, le=50),
    limit: int = Query(200, ge=10, le=2000),
):
    sql_pairs = f"""
    SELECT
        e1.dst AS repo_a,
        e2.dst AS repo_b,
        countDistinct(e1.src) AS shared_users
    FROM spectre.edges e1
    JOIN spectre.edges e2
      ON e1.src = e2.src
    WHERE e1.dst < e2.dst
    GROUP BY repo_a, repo_b
    HAVING shared_users >= {min_shared_users}
    ORDER BY shared_users DESC
    LIMIT {limit}
    """
    pairs_data = _execute_ch(sql_pairs)
    rows = pairs_data.get("data", [])
    if not rows:
        return {"nodes": [], "edges": []}

    repo_ids = set()
    for row in rows:
        repo_ids.add(row["repo_a"])
        repo_ids.add(row["repo_b"])

    sanitized_ids = [value.replace("'", "") for value in repo_ids]
    ids_list = "'" + "','".join(sanitized_ids) + "'"

    sql_nodes = f"""
    SELECT id, type, attrs_json, toString(updated_at) as updated_at
    FROM spectre.nodes
    WHERE id IN ({ids_list})
    """
    nodes_data = _execute_ch(sql_nodes)
    nodes = []
    for row in nodes_data.get("data", []):
        nodes.append(
            Node(
                id=row["id"],
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"],
            )
        )

    edges = []
    for row in rows:
        edges.append(
            Edge(
                src=row["repo_a"],
                dst=row["repo_b"],
                type="CO_CONTRIBUTED",
                weight=row["shared_users"],
                recency=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                attrs={"shared_users": row["shared_users"]},
            )
        )

    return {"nodes": nodes, "edges": edges}


@app.get("/dashboard/kpis")
def get_dashboard_kpis():
    """Get high-level metrics."""
    return _get_kpis()


@app.websocket("/ws/kpis")
async def kpis_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = _get_kpis()
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return

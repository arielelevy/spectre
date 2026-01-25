import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
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

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Spectre Backend...")
    
    # Check Redis
    try:
        redis_client = RedisService.get_instance().client
        info = redis_client.info()
        logger.info(f"Redis connected: {info['redis_version']}")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")

    # Check ClickHouse
    try:
        ch_service = ClickHouseService.get_instance()
        if ch_service.ping():
            logger.info("ClickHouse connected and responding to ping")
        else:
            logger.warning("ClickHouse ping failed")
    except Exception as e:
        logger.error(f"Failed to connect to ClickHouse: {e}")

    logger.info("Startup complete. API is ready to accept requests.")


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
    client = RedisService.get_instance(pool_size=20).client
    payload = {
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "window_minutes": request.window_minutes,
    }
    job_id = client.xadd(GITHUB_QUEUE_STREAM, {"payload": json.dumps(payload)})
    return {"status": "queued", "job_id": job_id, "stream": GITHUB_QUEUE_STREAM}


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
        # In a real app, log error
        raise HTTPException(status_code=500, detail=str(e))

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
        nodes.append(Node(
            id=row["id"],
            type=row["type"],
            attrs=json.loads(row["attrs_json"]),
            updated_at=row["updated_at"]
        ))
    return nodes

@app.get("/graph/neighbors", response_model=dict)
def get_neighbors(node_id: str):
    """Get 1st degree connections for a node."""
    sanitized_id = node_id.replace("'", "")
    
    # Get outgoing edges
    sql_edges = f"""
    SELECT src, dst, type, weight, toString(recency) as recency, attrs_json
    FROM spectre.edges
    WHERE src = '{sanitized_id}' OR dst = '{sanitized_id}'
    LIMIT 100
    """
    edges_data = _execute_ch(sql_edges)
    
    edges = []
    neighbor_ids = set()
    
    for row in edges_data.get("data", []):
        edges.append(Edge(
            src=row["src"],
            dst=row["dst"],
            type=row["type"],
            weight=row["weight"],
            recency=row["recency"],
            attrs=json.loads(row["attrs_json"])
        ))
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
            nodes.append(Node(
                id=row["id"],
                type=row["type"],
                attrs=json.loads(row["attrs_json"]),
                updated_at=row["updated_at"]
            ))

    return {"nodes": nodes, "edges": edges}

@app.get("/dashboard/kpis")
def get_dashboard_kpis():
    """Get high-level metrics."""
    sql_nodes = "SELECT count() as count FROM spectre.nodes"
    sql_edges = "SELECT count() as count FROM spectre.edges"
    sql_events = "SELECT count() as count FROM spectre.events"
    
    # In production, run in parallel or single query with UNION/subselects
    nodes_count = _execute_ch(sql_nodes)["data"][0]["count"]
    edges_count = _execute_ch(sql_edges)["data"][0]["count"]
    events_count = _execute_ch(sql_events)["data"][0]["count"]
    
    return {
        "nodes_count": nodes_count,
        "edges_count": edges_count,
        "events_count": events_count,
        "risk_level": "NOMINAL" # Placeholder logic
    }

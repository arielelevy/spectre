"Persist GitHub events into ClickHouse with Graph Normalization."

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, List, Tuple
import uuid

from batch.services.clickhouse_service import ClickHouseService


@dataclass
class GitHubEvent:
    event_type: str
    payload: dict


@dataclass
class Node:
    id: str
    type: str
    attrs: dict
    updated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    )


@dataclass
class Edge:
    src: str
    dst: str
    type: str
    weight: float = 1.0
    recency: str = field(
        default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    )
    attrs: dict = field(default_factory=dict)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _normalize_event(event: GitHubEvent) -> Tuple[List[Node], List[Edge]]:
    nodes = []
    edges = []
    payload = event.payload

    # Extract common entities
    repo_name = payload.get("repo")
    owner = payload.get("owner")
    full_repo_name = None

    if isinstance(owner, dict):
        owner = owner.get("login") or owner.get("name")

    repo_payload = payload.get("repo")
    if isinstance(repo_payload, dict):
        repo_full_name = repo_payload.get("name")
        if repo_full_name and "/" in repo_full_name:
            owner, repo_name = repo_full_name.split("/", 1)
            full_repo_name = repo_full_name
        else:
            repo_name = repo_name or repo_payload.get("name")
            repo_owner = repo_payload.get("owner")
            if isinstance(repo_owner, dict):
                owner = owner or repo_owner.get("login") or repo_owner.get("name")
    if not full_repo_name and owner and repo_name:
        full_repo_name = f"{owner}/{repo_name}"

    if full_repo_name:
        nodes.append(
            Node(
                id=full_repo_name,
                type="Repo",
                attrs={"name": repo_name, "owner": owner},
            )
        )

        data = payload.get("data", {})
        actor_login = None

        # Try to find actor in different payload structures
        if "author" in data and isinstance(data["author"], dict):
            # Commit structure often has author nested
            actor_login = data["author"].get("login") or data["author"].get(
                "user", {}
            ).get("login")
        elif "user" in data:
            # PR/Issue structure
            actor_login = data["user"].get("login")
        elif "actor" in payload:
            # Public event structure
            actor_login = payload["actor"].get("login")

        if actor_login:
            nodes.append(
                Node(id=actor_login, type="User", attrs={"login": actor_login})
            )

            # Create Edge: User -> ACTED_ON -> Repo
            # Action type inference
            action_map = {
                "github.commit": "COMMITTED_TO",
                "github.issue": "OPENED_ISSUE_IN",
                "github.pull_request": "OPENED_PR_IN",
                "github.public_event": "INTERACTED_WITH",
                "github.repo_event": "INTERACTED_WITH",
            }
            edge_type = action_map.get(event.event_type, "INTERACTED_WITH")

            edges.append(
                Edge(
                    src=actor_login,
                    dst=full_repo_name,
                    type=edge_type,
                    weight=1.0,
                    attrs={"event_type": event.event_type},
                )
            )

    return nodes, edges


def write_events(events: Iterable[GitHubEvent]) -> int:
    event_rows = []
    node_rows = []
    edge_rows = []
    node_map: dict[tuple[str, str], Node] = {}
    edge_map: dict[tuple[str, str, str], Edge] = {}

    for event in events:
        # 1. Prepare Event Log (Always save Raw)
        payload_json = json.dumps(event.payload)
        # Unique ID for the event
        event_uuid = str(uuid.uuid4())

        actor_id = ""
        target_id = ""

        # 2. Try to Extract Graph (Best Effort)
        try:
            nodes, edges = _normalize_event(event)

            if nodes:
                # Simple heuristic: first User is actor, first Repo is target
                users = [n for n in nodes if n.type == "User"]
                repos = [n for n in nodes if n.type == "Repo"]
                if users:
                    actor_id = users[0].id
                if repos:
                    target_id = repos[0].id

            # Collect Nodes
            for node in nodes:
                node_map[(node.id, node.type)] = node

            # Collect Edges
            for edge in edges:
                edge_map[(edge.src, edge.dst, edge.type)] = edge

        except Exception as e:
            # If graph extraction fails, we LOG it but DO NOT STOP.
            # The raw event must still be saved.
            print(f"Error normalizing event {event.event_type}: {e}")

        # Add to event rows (now safe)
        escaped_payload = payload_json.replace("'", "''")
        event_rows.append(
            f"('{event_uuid}', '{_utc_now()}', '{actor_id}', '{event.event_type}', '{target_id}', '{escaped_payload}')"
        )

    client = ClickHouseService.get_instance()

    # 3. Execute Inserts (Batch)
    if event_rows:
        sql = (
            "INSERT INTO spectre.events (id, timestamp, actor_id, action_type, target_id, payload_json) VALUES "
            + ",".join(event_rows)
        )
        client.query(sql)

    if node_map:
        for node in node_map.values():
            attrs_json = json.dumps(node.attrs).replace("'", "''")
            node_rows.append(
                f"('{node.id}', '{node.type}', '{attrs_json}', '{node.updated_at}')"
            )
        sql = (
            "INSERT INTO spectre.nodes (id, type, attrs_json, updated_at) VALUES "
            + ",".join(node_rows)
        )
        client.query(sql)

    if edge_map:
        for edge in edge_map.values():
            attrs_json = json.dumps(edge.attrs).replace("'", "''")
            edge_rows.append(
                f"('{edge.src}', '{edge.dst}', '{edge.type}', {edge.weight}, '{edge.recency}', '{attrs_json}')"
            )
        sql = (
            "INSERT INTO spectre.edges (src, dst, type, weight, recency, attrs_json) VALUES "
            + ",".join(edge_rows)
        )
        client.query(sql)

    return len(event_rows)

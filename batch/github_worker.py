import logging
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import cast, Iterable, Tuple, Any

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import redis

from batch.services.github_service import fetch_public_events
from batch.github_clickhouse_writer import GitHubEvent, write_events
from batch.services.redis_service import RedisService

logger = logging.getLogger(__name__)

GITHUB_QUEUE_STREAM = os.getenv("GITHUB_INGEST_QUEUE", "job:queue")
GITHUB_QUEUE_GROUP = os.getenv("GITHUB_INGEST_GROUP", "github-ingest")
GITHUB_QUEUE_CONSUMER = os.getenv("GITHUB_INGEST_CONSUMER", "worker-1")
GITHUB_QUEUE_BLOCK_MS = int(os.getenv("GITHUB_INGEST_BLOCK_MS", "5000"))
GITHUB_QUEUE_IDLE_SLEEP = float(os.getenv("GITHUB_INGEST_IDLE_SLEEP", "1.0"))


def _redis_client() -> redis.Redis:
    return RedisService.get_instance(eager=True).client


def _ensure_group(client) -> None:
    try:
        client.xgroup_create(
            GITHUB_QUEUE_STREAM, GITHUB_QUEUE_GROUP, id="0", mkstream=True
        )
        logger.info(f"Created consumer group {GITHUB_QUEUE_GROUP} on stream {GITHUB_QUEUE_STREAM}")
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise
        logger.debug(f"Consumer group {GITHUB_QUEUE_GROUP} already exists")


def _schedule_next(client) -> str:
    payload = {
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "window_minutes": 10,
    }
    job_id = client.xadd(GITHUB_QUEUE_STREAM, {"payload": json.dumps(payload)})
    logger.info(f"Scheduled next job: {job_id}")
    return job_id


def _parse_payload(fields: dict) -> dict:
    raw = fields.get("payload", "{}")
    return json.loads(raw)


def run_worker() -> None:
    logger.info("Starting GitHub worker...")
    client = _redis_client()
    _ensure_group(client)

    while True:
        try:
            streams = (
                cast(
                    list,
                    client.xreadgroup(
                        GITHUB_QUEUE_GROUP,
                        GITHUB_QUEUE_CONSUMER,
                        {GITHUB_QUEUE_STREAM: ">"},
                        count=1,
                        block=GITHUB_QUEUE_BLOCK_MS,
                    ),
                )
                or []
            )

            if not streams:
                try:
                    if client.xlen(GITHUB_QUEUE_STREAM) == 0:
                        logger.info("Stream empty, seeding initial job")
                        _schedule_next(client)
                except redis.RedisError as e:
                    logger.error(f"Redis error checking stream length: {e}")
                time.sleep(GITHUB_QUEUE_IDLE_SLEEP)
                continue

            for _, messages in streams:
                for message_id, fields in messages:
                    logger.info(f"Processing message {message_id}")
                    try:
                        payload = _parse_payload(fields)
                        minutes = int(payload.get("window_minutes", 10))
                        
                        logger.info(f"Fetching public events for last {minutes} minutes")
                        public_events = fetch_public_events(minutes=minutes)
                        logger.info(f"Found {len(public_events)} events")
                        
                        event_records = [
                            GitHubEvent(event_type="github.public_event", payload=item)
                            for item in public_events
                        ]
                        
                        count = write_events(event_records)
                        logger.info(f"Persisted {count} events to ClickHouse")
                        
                        client.xack(GITHUB_QUEUE_STREAM, GITHUB_QUEUE_GROUP, message_id)
                        _schedule_next(client)
                    except Exception as e:
                        logger.error(f"Failed to process message {message_id}: {e}", exc_info=True)
                        # Decide if we want to ACK failed messages or use a dead-letter queue (DLQ)
                        # For now, we don't ACK so it gets retried (or stuck, beware)
                        time.sleep(1)

        except Exception as e:
            logger.error(f"Worker loop error: {e}", exc_info=True)
            time.sleep(5)



if __name__ == "__main__":
    run_worker()

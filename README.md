# Spectre Batch Processing

This component handles the ingestion of data from various sources (GitHub, Reddit, X) and its normalization into the Spectre data model in ClickHouse.

## Components

- `main.py`: Entry point for the batch workers.
- `github_worker.py`: Worker for ingesting GitHub public events and repository data.
- `reddit_worker.py`: Worker for ingesting Reddit posts from specific subreddits.
- `x_worker.py`: Worker for ingesting X (Twitter) tweets.
- `services/`: Client services for interacting with external APIs and internal databases (Redis, ClickHouse).
- `clickhouse_writer.py`: Handles the persistence and normalization of events into ClickHouse.

## Architecture

The batch system uses Redis Streams as a task queue. Workers listen to specific streams, fetch data from external sources, normalize it into `nodes`, `edges`, and `events`, and then persist it to ClickHouse.

## Local Development

To run a worker locally:

```bash
# GitHub Worker
python -m batch.main --source github

# Reddit Worker
python -m batch.main --source reddit
```

Make sure to have a `.env` file in the root directory with the necessary API tokens.

# Spectre 🛡️
> **Forensic Software Intelligence Platform**

Spectre is a high-performance MVP designed to correlate public software development activity into actionable knowledge graphs. 

**Core Capabilities:**
- **Fusion:** Real-time ingestion of GitHub (and upcoming Reddit) public event streams.
- **Analytics:** Sub-second OLAP queries over millions of event rows.
- **GenAI:** Agentic reasoning over graph nodes to detect patterns, anomalies, and forensic insights.

## Componentes

- Backend (FastAPI): API de busqueda, grafo y KPIs.
- Batch (Python): ingesta publica de GitHub y normalizacion a eventos/grafo.
- Redis: cola (Streams) y cache.
- ClickHouse: eventos, nodos y aristas del grafo.
- Frontend (React/Vite): dashboard y visualizacion.

## Estructura del repo

- `backend/`: API FastAPI.
- `batch/`: worker de ingesta GitHub y escritor ClickHouse.
- `shared/`: servicios compartidos (Redis, ClickHouse, logging).
- `frontend/`: UI React.
- `deploy/docker/`: compose y Dockerfiles por servicio.
- `PLAN.md`: arquitectura y modelo de datos.
- `DEPLOY_PLAN.md`: despliegue en Azure.

## Quick start (Docker)

1) Levanta Redis y ClickHouse

```bash
docker compose -f deploy/docker/redis/docker-compose.yml up -d
docker compose -f deploy/docker/clickhouse/docker-compose.yml up -d
```

2) Levanta backend y batch

```bash
docker compose -f deploy/docker/backend/docker-compose.yml --env-file .env up -d
docker compose -f deploy/docker/batch/docker-compose.yml --env-file .env up -d
```

3) Frontend

```bash
cd frontend
npm install
npm run dev
```

## Desarrollo local (sin Docker)

Backend:

```bash
python -m backend.main
```

Batch:

```bash
python -m batch.main
```

Frontend:

```bash
cd frontend
npm run dev
```

## Endpoints utiles

- `GET /health`
- `POST /ingest/github/public` (body: `{ "window_minutes": 10 }`)
- `GET /graph/search?q=<texto>`
- `GET /graph/neighbors?node_id=<id>`
- `GET /dashboard/kpis`

## Variables de entorno (sin valores)

- `REDIS_URL`
- `WORKER_CONCURRENCY`
- `CLICKHOUSE_HOST`
- `CLICKHOUSE_PORT`
- `CLICKHOUSE_USER`
- `CLICKHOUSE_PASSWORD`
- `CLICKHOUSE_DATABASE`
- `CLICKHOUSE_TIMEOUT_SECONDS`
- `GITHUB_TOKEN`

## Troubleshooting

- Si corres backend/batch en tu host (Windows/macOS/Linux), usa:
  `REDIS_URL=redis://localhost:6379/0`
- Si corres dentro de Docker, usa el nombre del servicio:
  `REDIS_URL=redis://spectre-redis:6379/0`
- ClickHouse 404 suele indicar `CLICKHOUSE_HOST` o credenciales incorrectas.
- El batch no debe auto-agendar jobs; solo procesa lo que el backend encola.

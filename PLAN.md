# Proyecto Forense en AKS (ClickHouse + GenAI)

## Objetivo
MVP de investigacion forense de software usando datos publicos de GitHub para fusion, analitica y GenAI con trazabilidad completa.

## Stack
- Azure AKS
- ClickHouse en contenedor (Helm)
- ADLS Gen2 (evidencia cruda)
- Azure OpenAI (embeddings + chatbot investigativo)
- Azure AI Foundry (orquestacion y despliegue GenAI)
- API REST/GraphQL (subgrafos y timelines)
- Frontend: React + Cytoscape/Vis.js (Visualizacion de grafo)

## Ingesta y Normalizacion
El objetivo es transformar datos crudos de GitHub/Reddit/X en un formato estandar "Evento" para analisis unificado.

### 1. Ingesta Multi-Fuente
- **GitHub:** Commits, Issues, PRs (Actividad de codigo).
- **Reddit/X:** Discusiones, posts, tendencias (Contexto social).

### 2. Normalizacion Atomica
Cada interaccion se transforma en un evento canonico:
- **Actor:** ¿Quien ejecuto la accion? (Usuario, Bot, Org)
- **Accion:** ¿Que hizo? (Commit, Comment, Fork, Mention)
- **Objetivo:** ¿Sobre que/quien? (Repo, Usuario, URL, CVE)

### 3. Limpieza Semantica
- Extraccion de entidades nombradas (NER) en textos libres antes de guardar.
- Identificacion de tecnologias o CVEs mencionados en comentarios/commits.

## Modelo de datos (ClickHouse)
Esquema unificado para grafo, eventos y vectores.

```sql
-- Nodos: Entidades unicas (Usuarios, Repos, URLs)
CREATE TABLE IF NOT EXISTS nodes (
  id String,
  type LowCardinality(String), -- 'User', 'Repo', 'Subreddit', 'Domain', 'Tweet'
  attrs_json String,
  updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (type, id);

-- Aristas: Relaciones dirigidas con peso y temporalidad
CREATE TABLE IF NOT EXISTS edges (
  src String,
  dst String,
  type LowCardinality(String), -- 'AUTHORED', 'MENTIONED', 'FORKED', 'POSTED', 'LINKS_TO'
  weight Float32 DEFAULT 1.0,
  recency DateTime DEFAULT now(),
  attrs_json String
) ENGINE = ReplacingMergeTree(recency)
ORDER BY (type, src, dst);

-- Eventos: Log inmutable de actividad
CREATE TABLE IF NOT EXISTS events (
  id String,
  timestamp DateTime,
  actor_id String,
  action_type LowCardinality(String),
  target_id String,
  payload_json String
) ENGINE = MergeTree()
ORDER BY (timestamp, action_type);

-- Embeddings: Vectores para busqueda semantica
CREATE TABLE IF NOT EXISTS embeddings (
  id String,
  entity_id String,
  content String,
  embedding Array(Float32),
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (entity_id, created_at);
```

## Graph RAG (ClickHouse Native)
- **Motor de Grafo:** ClickHouse (aprovechando su potencia analitica para relaciones).
- **Estrategia:** Normalizacion atomica (Actor-Accion-Objetivo) y vistas materializadas para pre-calcular caminos.

### Modelo de Grafo en ClickHouse
No usamos una DB de grafos tradicional, sino un esquema relacional optimizado para "Links".

#### Tablas Core
- `nodes` (id, type, attrs_json, updated_at)
- `edges` (src, dst, type, weight Float32, recency DateTime, attrs_json)
  - *Weight*: Frecuencia de interaccion.
  - *Recency*: Fecha de ultima interaccion.

#### Pre-procesamiento (Vistas Materializadas)
ClickHouse calcula conexiones de 2do y 3er grado en tiempo real al ingerir:
- `mv_2nd_degree`: Calcula `A -> B -> C` uniendo edges consigo mismo.
- `mv_influence_rank`: Agregacion continua de `weight` entrante/saliente para detectar nodos "Hub".

### Flujo de Descubrimiento (GraphRAG)
1. **Input:** Pregunta en lenguaje natural (ej: "¿Quien conecta el repo X con el foro Y?").
2. **Retrieval (SQL):**
   - Busqueda de sub-grafo: `SELECT * FROM edges WHERE src IN (subquery) OR dst IN (subquery)`.
   - Deteccion de caminos: Consultas sobre `mv_2nd_degree` para encontrar puentes invisibles.
3. **Synthesis:** LLM recibe la lista de relaciones y nodos enriquecidos para generar la narrativa.

### Consultas Analiticas (Ejemplos)
```sql
-- Encontrar "Puentes" (Usuarios activos en comunidades dispares)
SELECT actor_id, countDistinct(community_id) as reach
FROM normalized_events
GROUP BY actor_id
HAVING reach > 2
ORDER BY reach DESC;
```

## Casos de uso demo
- Deteccion de cambios sospechosos
- Correlacion de commits con issues criticos
- Autores con patrones anomalos
- Timeline forense con evidencia vinculada

## Infraestructura y Despliegue
> **Nota:** El detalle de la infraestructura en la nube (Azure AKS, Spot Instances, Static Web Apps) se ha movido a `DEPLOY_PLAN.md` para mantener este documento enfocado en arquitectura y desarrollo.

## Desarrollo Local (Docker Compose)
Entorno actual para iteración rápida:

- **Orquestación:** `docker-compose.yml` (pendiente de crear).
- **ClickHouse:** Imagen `clickhouse/clickhouse-server:latest`.
- **Redis:** Imagen `redis:alpine` para colas y cache.
- **Backend/Batch:** Dockerfiles locales montando volumenes de código ("hot-reload").
- **Frontend:** Vite dev server (`npm run dev`).
- **Persistencia:** Volumenes locales `./data/clickhouse` y `./data/redis`.

### Comandos de Desarrollo
1.  **Iniciar todo:** `docker-compose up -d`
2.  **Logs:** `docker-compose logs -f backend`
3.  **Frontend:** `cd frontend && npm run dev`


## Stack Tecnológico
- **Backend:** Python (FastAPI).
- **Ingesta/Batch:** Python (Workers) + Redis Streams.
- **Datos:** ClickHouse (Grafo/Eventos) + Redis (Cache/Colas).
- **Frontend:** React + Vite + Tailwind + Recharts.

## Roadmap de Implementación (MVP)

### Fase 1: Fundamentos (En Progreso)
- [x] Definición de Esquema ClickHouse (`nodes`, `edges`, `events`).
- [x] Lógica de Ingesta Segura (Raw + Graph Extraction).
- [x] API Básica (Search, Neighbors, KPIs).
- [ ] Configuración `docker-compose` local.

### Fase 2: Conexión de Datos
- [ ] Worker funcional ingiriendo de API pública de GitHub.
- [ ] Visualización de Grafo en Frontend conectada a API.
- [ ] Dashboard de KPIs con datos reales.

### Fase 3: Inteligencia
- [ ] Implementación de GraphRAG (Búsqueda semántica + relaciones).
- [ ] Agentes de Chatbot Forense.

### Fase 4: Producción
- [ ] Migración a Azure AKS (Ver `DEPLOY_PLAN.md`).
- [ ] Seguridad y Hardening.


## Frontend (MVP completo)

### Vistas principales
- **Dashboard:** KPIs, riesgo por entidad, alertas, actividad reciente
  - *KPIs:* commits sospechosos, repos en riesgo, autores anómalos
  - *Alertas:* reglas activas, severidad, estado (abierta/en curso/cerrada)
  - *Actividad:* último commit, issues críticos, revisiones recientes
- **Investigacion:** buscador, filtros, tabla de eventos, panel de evidencia
  - *Buscador:* repos, autores, commits, issues
  - *Filtros:* rango temporal, severidad, entidad, tag de caso
  - *Evidencia:* diff, metadata, enlaces externos, trazabilidad
- **Grafo:** relaciones autor-commit-archivo-issue
  - *Controles:* zoom, filtros por tipo, expansión por entidad
- **Timeline forense:** eventos correlacionados por caso
  - *Carriles:* code, issues, seguridad, revisiones

### Funcionalidades clave
- **Chatbot investigativo:** respuestas con trazabilidad
  - *Citado de evidencia:* enlaces a eventos/commits/archivos
  - *Preguntas frecuentes:* “quién”, “qué cambió”, “por qué es sospechoso”
- **Reportes:** exportable PDF/JSON con evidencia
  - *Plantillas:* resumen ejecutivo, hallazgos, recomendaciones


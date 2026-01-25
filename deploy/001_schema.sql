CREATE DATABASE IF NOT EXISTS spectre;

-- Nodos: Entidades unicas (Usuarios, Repos, URLs)
CREATE TABLE IF NOT EXISTS spectre.nodes (
  id String,
  type LowCardinality(String), -- 'User', 'Repo', 'Subreddit', 'Domain', 'Tweet'
  attrs_json String,
  updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (type, id);

-- Aristas: Relaciones dirigidas con peso y temporalidad
CREATE TABLE IF NOT EXISTS spectre.edges (
  src String,
  dst String,
  type LowCardinality(String), -- 'AUTHORED', 'MENTIONED', 'FORKED', 'POSTED', 'LINKS_TO'
  weight Float32 DEFAULT 1.0,
  recency DateTime DEFAULT now(),
  attrs_json String
) ENGINE = ReplacingMergeTree(recency)
ORDER BY (type, src, dst);

-- Eventos: Log inmutable de actividad
CREATE TABLE IF NOT EXISTS spectre.events (
  id String,
  timestamp DateTime,
  actor_id String,
  action_type LowCardinality(String),
  target_id String,
  payload_json String
) ENGINE = MergeTree()
ORDER BY (timestamp, action_type);

-- Embeddings: Vectores para busqueda semantica
CREATE TABLE IF NOT EXISTS spectre.embeddings (
  id String,
  entity_id String,
  content String,
  embedding Array(Float32),
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (entity_id, created_at);

-- Materialized View for 2nd Degree Connections (Example)
-- This computes A -> B -> C relationships automatically
-- CREATE MATERIALIZED VIEW IF NOT EXISTS spectre.mv_2nd_degree
-- ENGINE = AggregatingMergeTree() ORDER BY (src, dst)
-- AS SELECT
--    e1.src as src,
--    e2.dst as dst,
--    uniq(e1.dst) as intermediate_nodes
-- FROM spectre.edges AS e1
-- JOIN spectre.edges AS e2 ON e1.dst = e2.src
-- GROUP BY e1.src, e2.dst;
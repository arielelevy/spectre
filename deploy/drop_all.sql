-- Drop all tables in the spectre database
DROP TABLE IF EXISTS spectre.nodes;
DROP TABLE IF EXISTS spectre.edges;
DROP TABLE IF EXISTS spectre.events;
DROP TABLE IF EXISTS spectre.embeddings;

-- Drop the database itself
DROP DATABASE IF EXISTS spectre;

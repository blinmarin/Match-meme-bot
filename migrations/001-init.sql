CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS media (
  id          SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  image_data  BYTEA,
  embedding   vector(384)
);

CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);

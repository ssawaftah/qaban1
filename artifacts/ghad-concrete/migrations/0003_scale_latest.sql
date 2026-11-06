CREATE TABLE IF NOT EXISTS scale_latest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weight_kg REAL NOT NULL,
  received_at TEXT NOT NULL
);

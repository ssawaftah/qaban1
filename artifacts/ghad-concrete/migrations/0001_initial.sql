CREATE TABLE IF NOT EXISTS mixers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
  driver_name TEXT NOT NULL,
  tare_weight_kg REAL NOT NULL CHECK (tare_weight_kg > 0),
  tare_weighed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_date TEXT NOT NULL,
  mixer_id INTEGER,
  vehicle_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  gross_weight_kg REAL NOT NULL CHECK (gross_weight_kg > 0),
  tare_weight_kg REAL NOT NULL CHECK (tare_weight_kg > 0),
  concrete_weight_kg REAL NOT NULL CHECK (concrete_weight_kg > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mixer_id) REFERENCES mixers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS operations_date_idx ON operations(operation_date);
CREATE INDEX IF NOT EXISTS operations_mixer_idx ON operations(mixer_id);
CREATE INDEX IF NOT EXISTS operations_customer_idx ON operations(customer_name);

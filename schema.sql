CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  temperature REAL,
  humidity REAL,
  pressure REAL,
  voltage REAL,
  published INTEGER DEFAULT 0,
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_readings_ts ON sensor_readings (ts DESC);
CREATE INDEX IF NOT EXISTS idx_readings_published ON sensor_readings (published);

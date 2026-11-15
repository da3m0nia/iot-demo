DROP TABLE IF EXISTS sensor_readings;
DROP TABLE IF EXISTS devices;

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT,
  firmware TEXT
);

CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  metrics TEXT NOT NULL,
  published INTEGER DEFAULT 0,
  published_at INTEGER,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_readings_device_ts ON sensor_readings (device_id, ts DESC);
CREATE INDEX idx_readings_published ON sensor_readings (published);

INSERT INTO devices (id, name, type, location, firmware) VALUES
  ('panel-01', 'Main Electrical Panel', 'panel', 'Building A - Floor 1', 'v2.1.0'),
  ('motor-01', 'Conveyor Motor', 'motor', 'Production Line 1', 'v1.8.3'),
  ('env-01', 'Environmental Sensor', 'environment', 'Warehouse', 'v3.0.1');

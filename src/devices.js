/**
 * Device data generators — simulates realistic industrial sensors.
 * Each generator maintains its own state so values evolve naturally
 * (e.g., cumulative energy, RPM with inertia, vibration with sine + noise).
 */

const state = {
  'panel-01': { energyKwh: 1250.5, lastTs: null },
  'motor-01': { rpm: 1450, vibX: 0.5, vibY: 0.4, vibZ: 0.3, lastTs: null },
  'env-01': { lastTs: null },
};

function noise(scale = 1) {
  return (Math.random() - 0.5) * 2 * scale;
}

/**
 * Electrical panel: 3-phase voltages, current, active power,
 * cumulative energy, power factor, panel temperature.
 */
function generatePanelData(ts) {
  const s = state['panel-01'];
  const baseVoltage = 230;
  const voltageL1 = +(baseVoltage + noise(5)).toFixed(1);
  const voltageL2 = +(baseVoltage + noise(5)).toFixed(1);
  const voltageL3 = +(baseVoltage + noise(5)).toFixed(1);

  const current = +(12 + noise(3)).toFixed(2);
  const pf = +(0.88 + noise(0.04)).toFixed(2);
  const power = +(Math.sqrt(3) * 400 * current * pf / 1000).toFixed(2); // kW

  // Cumulative energy: power * time delta in hours
  let deltaHours = 1 / 3600;
  if (s.lastTs) deltaHours = (ts - s.lastTs) / 3600000;
  s.lastTs = ts;
  s.energyKwh += power * deltaHours;

  return {
    voltage_l1: voltageL1,
    voltage_l2: voltageL2,
    voltage_l3: voltageL3,
    current: current,
    active_power_kw: power,
    energy_kwh: +s.energyKwh.toFixed(3),
    power_factor: pf,
    panel_temp_c: +(28 + noise(2)).toFixed(1),
  };
}

/**
 * Motor: RPM with inertia, 3-axis vibration (sine + noise),
 * winding temperature, motor current.
 */
function generateMotorData(ts) {
  const s = state['motor-01'];
  s.rpm += noise(15);
  s.rpm = Math.max(1200, Math.min(1700, s.rpm));

  const t = ts / 1000;
  s.vibX = +(0.4 + Math.sin(t * 0.5) * 0.1 + Math.abs(noise(0.05))).toFixed(3);
  s.vibY = +(0.35 + Math.cos(t * 0.7) * 0.08 + Math.abs(noise(0.05))).toFixed(3);
  s.vibZ = +(0.3 + Math.sin(t * 0.3) * 0.06 + Math.abs(noise(0.04))).toFixed(3);

  return {
    rpm: Math.round(s.rpm),
    vibration_x: s.vibX,
    vibration_y: s.vibY,
    vibration_z: s.vibZ,
    winding_temp_c: +(65 + noise(5)).toFixed(1),
    motor_current_a: +(8 + noise(1.5)).toFixed(2),
  };
}

/**
 * Environment: temperature and humidity with inertia,
 * atmospheric pressure, CO2 concentration.
 */
function generateEnvData(ts) {
  const s = state['env-01'];
  if (!s.temp) s.temp = 22;
  if (!s.hum) s.hum = 45;
  s.temp += noise(0.3);
  s.hum += noise(0.5);
  s.temp = Math.max(18, Math.min(30, s.temp));
  s.hum = Math.max(30, Math.min(70, s.hum));

  return {
    temperature_c: +s.temp.toFixed(2),
    humidity_pct: +s.hum.toFixed(2),
    pressure_hpa: +(1013 + noise(3)).toFixed(1),
    co2_ppm: Math.round(500 + Math.random() * 200),
  };
}

const generators = {
  'panel-01': generatePanelData,
  'motor-01': generateMotorData,
  'env-01': generateEnvData,
};

/** Returns a full reading object for the given device. */
export function generateReading(deviceId) {
  const ts = Date.now();
  const gen = generators[deviceId];
  if (!gen) throw new Error(`Unknown device: ${deviceId}`);
  return {
    deviceId,
    ts,
    metrics: gen(ts),
  };
}

export const DEVICE_IDS = Object.keys(generators);

import { DASHBOARD_HTML } from './ui.js';

const TB_BASE_URL = 'https://eu.thingsboard.cloud';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // داشبورد UI
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(DASHBOARD_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    // آمار کلی برای UI
    if (request.method === 'GET' && url.pathname === '/stats') {
      const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM sensor_readings').first();
      const pub = await env.DB.prepare('SELECT COUNT(*) AS c FROM sensor_readings WHERE published = 1').first();
      const last = await env.DB.prepare('SELECT * FROM sensor_readings ORDER BY ts DESC LIMIT 1').first();
      return Response.json({
        total: total.c,
        published: pub.c,
        unpublished: total.c - pub.c,
        lastReading: last || null,
      });
    }

    if (request.method === 'GET' && url.pathname === '/readings') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
      const { results } = await env.DB.prepare(
        `SELECT * FROM sensor_readings ORDER BY ts DESC LIMIT ${limit}`
      ).all();
      return Response.json({ count: results.length, readings: results });
    }

    if (request.method === 'GET' && url.pathname === '/debug') {
      const t = env.TB_ACCESS_TOKEN || '';
      return Response.json({
        hasTokenInEnv: !!t,
        tokenLengthInEnv: t.length,
        tokenPreviewInEnv: t ? t.slice(0, 3) + '***' + t.slice(-3) : null,
        tbBaseUrl: TB_BASE_URL,
      });
    }

    if (request.method === 'POST' && url.pathname === '/simulate') {
      const reading = generateFakeReading();
      try {
        const result = await env.DB.prepare(
          'INSERT INTO sensor_readings (device_id, ts, temperature, humidity, pressure, voltage, published) VALUES (?, ?, ?, ?, ?, ?, 0)'
        ).bind(
          reading.deviceId, reading.ts, reading.temperature,
          reading.humidity, reading.pressure, reading.voltage
        ).run();

        reading.id = result.meta.last_row_id;

        let tb = { ok: true };
        try {
          await publishToThingsBoard(reading, env);
          await markPublished(reading.id, env);
        } catch (err) {
          console.error('ThingsBoard publish failed:', err);
          tb = { ok: false, error: err.message };
        }
        return Response.json({ status: 'ok', reading, thingsboard: tb });
      } catch (err) {
        return Response.json({ status: 'error', message: err.message }, { status: 500 });
      }
    }

    if (request.method === 'POST' && url.pathname === '/resend') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM sensor_readings WHERE published = 0 ORDER BY ts ASC LIMIT 10'
      ).all();
      const outcomes = [];
      for (const row of results) {
        try {
          await publishToThingsBoard({
            deviceId: row.device_id, ts: row.ts, temperature: row.temperature,
            humidity: row.humidity, pressure: row.pressure, voltage: row.voltage
          }, env);
          await markPublished(row.id, env);
          outcomes.push({ id: row.id, status: 'sent' });
        } catch (err) {
          outcomes.push({ id: row.id, status: 'failed', message: err.message });
        }
      }
      return Response.json({ attempted: results.length, outcomes });
    }

    return new Response('Not found', { status: 404 });
  },
};

function generateFakeReading() {
  return {
    deviceId: 'sensor-01',
    ts: Date.now(),
    temperature: +(20 + Math.random() * 10).toFixed(2),
    humidity: +(40 + Math.random() * 20).toFixed(2),
    pressure: +(1000 + Math.random() * 50).toFixed(2),
    voltage: +(220 + Math.random() * 10).toFixed(2),
  };
}

async function markPublished(id, env) {
  await env.DB.prepare(
    'UPDATE sensor_readings SET published = 1, published_at = ? WHERE id = ?'
  ).bind(Date.now(), id).run();
}

async function publishToThingsBoard(reading, env) {
  const token = env.TB_ACCESS_TOKEN;
  if (!token) throw new Error('TB_ACCESS_TOKEN is not set');
  const payload = JSON.stringify({
    temperature: reading.temperature,
    humidity: reading.humidity,
    pressure: reading.pressure,
    voltage: reading.voltage,
    ts: reading.ts,
  });
  const res = await fetch(`${TB_BASE_URL}/api/v1/${token}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ThingsBoard REST failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

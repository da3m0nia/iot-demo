/**
 * IoT Gateway Worker — Cloudflare Workers + D1 + ThingsBoard (EU region)
 *
 * Multi-device architecture: panel-01, motor-01, env-01.
 * Each device has its own ThingsBoard access token stored as a Secret.
 *
 * Free-plan friendly design:
 *   - One subrequest per /simulate call (sequential, not Promise.all)
 *   - JSON metrics column instead of wide schema (fewer writes)
 *   - Cron-free: sending is client-triggered from the dashboard
 *
 * Endpoints:
 *   GET  /                       → dashboard UI
 *   GET  /devices                → list registered devices
 *   GET  /stats?device=ID        → counters + last reading
 *   GET  /readings?device=ID     → last N readings (metrics decoded)
 *   POST /simulate?device=ID     → generate, persist, publish to ThingsBoard
 *   POST /resend?device=ID       → retry unpublished rows
 */

import { DASHBOARD_HTML } from './ui.js';
import { generateReading } from './devices.js';

const TB_BASE_URL = 'https://eu.thingsboard.cloud';

// Mapping from device ID → Cloudflare Secret name holding its TB token
const TOKEN_SECRETS = {
  'panel-01': 'TB_TOKEN_PANEL',
  'motor-01': 'TB_TOKEN_MOTOR',
  'env-01': 'TB_TOKEN_ENV',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── UI ────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(DASHBOARD_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    // ─── Device list ───────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/devices') {
      const { results } = await env.DB.prepare('SELECT * FROM devices').all();
      return Response.json({ devices: results });
    }

    // ─── Per-device stats ──────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/stats') {
      const deviceId = url.searchParams.get('device');
      if (!deviceId) return Response.json({ error: 'device required' }, { status: 400 });

      const total = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM sensor_readings WHERE device_id = ?'
      ).bind(deviceId).first();

      const pub = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM sensor_readings WHERE device_id = ? AND published = 1'
      ).bind(deviceId).first();

      const last = await env.DB.prepare(
        'SELECT * FROM sensor_readings WHERE device_id = ? ORDER BY ts DESC LIMIT 1'
      ).bind(deviceId).first();

      return Response.json({
        deviceId,
        total: total.c,
        published: pub.c,
        unpublished: total.c - pub.c,
        lastReading: last ? { ts: last.ts, metrics: JSON.parse(last.metrics) } : null,
      });
    }

    // ─── Readings history ──────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/readings') {
      const deviceId = url.searchParams.get('device');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

      const query = deviceId
        ? `SELECT * FROM sensor_readings WHERE device_id = ? ORDER BY ts DESC LIMIT ${limit}`
        : `SELECT * FROM sensor_readings ORDER BY ts DESC LIMIT ${limit}`;
      const params = deviceId ? [deviceId] : [];

      const { results } = await env.DB.prepare(query).bind(...params).all();
      const parsed = results.map(r => ({ ...r, metrics: JSON.parse(r.metrics) }));
      return Response.json({ count: parsed.length, readings: parsed });
    }

    // ─── Generate + persist + publish ──────────────────────────────
    if (request.method === 'POST' && url.pathname === '/simulate') {
      const deviceId = url.searchParams.get('device') || 'env-01';
      const reading = generateReading(deviceId);

      try {
        const result = await env.DB.prepare(
          'INSERT INTO sensor_readings (device_id, ts, metrics, published) VALUES (?, ?, ?, 0)'
        ).bind(reading.deviceId, reading.ts, JSON.stringify(reading.metrics)).run();

        reading.id = result.meta.last_row_id;

        // Publish directly (not waitUntil) so Cloudflare doesn't cancel
        // the request before the upstream fetch completes.
        let tb = { ok: true };
        try {
          await publishToThingsBoard(reading, env);
          await markPublished(reading.id, env);
        } catch (err) {
          console.error(`TB publish failed for ${deviceId}:`, err);
          tb = { ok: false, error: err.message };
        }

        return Response.json({ status: 'ok', reading, thingsboard: tb });
      } catch (err) {
        return Response.json({ status: 'error', message: err.message }, { status: 500 });
      }
    }

    // ─── Retry unpublished rows (Store-and-Forward) ────────────────
    if (request.method === 'POST' && url.pathname === '/resend') {
      const deviceId = url.searchParams.get('device');

      const query = deviceId
        ? 'SELECT * FROM sensor_readings WHERE published = 0 AND device_id = ? ORDER BY ts ASC LIMIT 10'
        : 'SELECT * FROM sensor_readings WHERE published = 0 ORDER BY ts ASC LIMIT 10';
      const params = deviceId ? [deviceId] : [];

      const { results } = await env.DB.prepare(query).bind(...params).all();
      const outcomes = [];

      for (const row of results) {
        try {
          const reading = {
            deviceId: row.device_id,
            ts: row.ts,
            metrics: JSON.parse(row.metrics),
          };
          await publishToThingsBoard(reading, env);
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

/** Marks a reading row as successfully published. */
async function markPublished(id, env) {
  await env.DB.prepare(
    'UPDATE sensor_readings SET published = 1, published_at = ? WHERE id = ?'
  ).bind(Date.now(), id).run();
}

/**
 * Publishes a reading to ThingsBoard via REST API.
 * The device's access token is looked up from Cloudflare Secrets
 * (never hard-coded) based on the device ID.
 */
async function publishToThingsBoard(reading, env) {
  const secretName = TOKEN_SECRETS[reading.deviceId];
  if (!secretName) throw new Error(`No token mapping for ${reading.deviceId}`);

  const token = env[secretName];
  if (!token) throw new Error(`Secret ${secretName} not set`);

  const res = await fetch(`${TB_BASE_URL}/api/v1/${token}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading.metrics),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TB REST ${res.status}: ${text.slice(0, 150)}`);
  }
}

/**
 * IoT Demo Worker — نسخهٔ دیباگ
 */

// ⚠️⚠️⚠️ فقط برای تست موقت! بعد از تست پاک کن! ⚠️⚠️⚠️
// توکن رو اینجا بذار، deploy کن، تست کن، بعد خالی کن و دوباره deploy
const TB_TOKEN_OVERRIDE = ''; // ← توکن رو بین کوتیشن‌ها بذار

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ─── دیباگ: چک وضعیت secretها ───
    if (request.method === 'GET' && url.pathname === '/debug') {
      const t = env.TB_ACCESS_TOKEN || '';
      const u = env.TB_MQTT_URL || '';
      return Response.json({
        hasTokenInEnv: !!t,
        tokenLengthInEnv: t.length,
        tokenPreviewInEnv: t ? `${t.slice(0, 3)}***${t.slice(-3)}` : null,
        hasMqttUrlInEnv: !!u,
        mqttUrlInEnv: u || null,
        hasOverrideInCode: !!TB_TOKEN_OVERRIDE,
        overrideLength: TB_TOKEN_OVERRIDE.length,
        overridePreview: TB_TOKEN_OVERRIDE
          ? `${TB_TOKEN_OVERRIDE.slice(0, 3)}***${TB_TOKEN_OVERRIDE.slice(-3)}`
          : null,
        effectiveSource: TB_TOKEN_OVERRIDE ? 'code-override' : (t ? 'env-secret' : 'none'),
      });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(INFO_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/readings') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM sensor_readings ORDER BY ts DESC LIMIT 20'
      ).all();
      return Response.json({ count: results.length, readings: results });
    }

    if (request.method === 'POST' && url.pathname === '/simulate') {
      const reading = generateFakeReading();
      try {
        const result = await env.DB.prepare(
          `INSERT INTO sensor_readings
             (device_id, ts, temperature, humidity, pressure, voltage, published)
           VALUES (?, ?, ?, ?, ?, ?, 0)`
        )
          .bind(
            reading.deviceId,
            reading.ts,
            reading.temperature,
            reading.humidity,
            reading.pressure,
            reading.voltage
          )
          .run();

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
        return Response.json(
          { status: 'error', message: err.message },
          { status: 500 }
        );
      }
    }

    if (request.method === 'POST' && url.pathname === '/resend') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM sensor_readings WHERE published = 0 ORDER BY ts ASC LIMIT 10'
      ).all();
      const outcomes = [];
      for (const row of results) {
        try {
          await publishToThingsBoard(
            {
              deviceId: row.device_id,
              ts: row.ts,
              temperature: row.temperature,
              humidity: row.humidity,
              pressure: row.pressure,
              voltage: row.voltage,
            },
            env
          );
          await markPublished(row.id, env);
          outcomes.push({ id: row.id, status: 'sent' });
        } catch (err) {
          outcomes.push({ id: row.id, status: 'failed', message: err.message });
        }
      }
      return Response.json({ attempted: results.length, outcomes });
    }

    return new Response('Not found. See GET / for usage.', { status: 404 });
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
  )
    .bind(Date.now(), id)
    .run();
}

async function publishToThingsBoard(reading, env) {
  // اولویت: override در کد → secret در env
  const token = TB_TOKEN_OVERRIDE || env.TB_ACCESS_TOKEN;
  if (!token) throw new Error('No token (neither override nor env)');

  const payload = JSON.stringify({
    temperature: reading.temperature,
    humidity: reading.humidity,
    pressure: reading.pressure,
    voltage: reading.voltage,
    ts: reading.ts,
  });

  const url = `https://thingsboard.cloud/api/v1/${token}/telemetry`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `ThingsBoard REST failed: ${response.status} ${text.slice(0, 200)}`
    );
  }
}

const INFO_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>IoT Demo — Debug</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px">
  <h1>IoT Demo — نسخهٔ دیباگ</h1>
  <p>برای دیدن وضعیت توکن و secretها:</p>
  <a href="/debug">→ /debug</a>
  <p>برای دیدن داده‌های D1:</p>
  <a href="/readings">→ /readings</a>
</body>
</html>`;

/**
 * IoT Demo Worker — Cloudflare Workers + D1 + ThingsBoard (EU)
 *
 * Endpoints:
 *   GET  /          → صفحهٔ راهنما
 *   GET  /readings  → ۲۰ رکورد آخر از D1
 *   GET  /debug     → وضعیت توکن و secretها (برای عیب‌یابی)
 *   POST /simulate  → تولید دادهٔ فیک، ذخیره در D1، ارسال به ThingsBoard
 *   POST /resend    → تلاش مجدد برای ارسال رکوردهای published=0
 *
 * نکتهٔ مهم:
 *   توکن ThingsBoard مخصوص منطقه است. توکن صادرشده برای
 *   eu.thingsboard.cloud فقط روی همان منطقه کار می‌کند و روی
 *   thingsboard.cloud (آمریکا) یا demo.thingsboard.io معتبر نیست.
 */

const TB_BASE_URL = 'https://eu.thingsboard.cloud';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/debug') {
      const t = env.TB_ACCESS_TOKEN || '';
      return Response.json({
        hasTokenInEnv: !!t,
        tokenLengthInEnv: t.length,
        tokenPreviewInEnv: t ? `${t.slice(0, 3)}***${t.slice(-3)}` : null,
        tbBaseUrl: TB_BASE_URL,
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

/* ------------------------------------------------------------------ */
/*  Fake sensor data                                                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  D1 helper                                                          */
/* ------------------------------------------------------------------ */

async function markPublished(id, env) {
  await env.DB.prepare(
    'UPDATE sensor_readings SET published = 1, published_at = ? WHERE id = ?'
  )
    .bind(Date.now(), id)
    .run();
}

/* ------------------------------------------------------------------ */
/*  ThingsBoard REST API — منطقهٔ اروپا                                */
/* ------------------------------------------------------------------ */

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

  const url = `${TB_BASE_URL}/api/v1/${token}/telemetry`;

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

/* ------------------------------------------------------------------ */
/*  Simple info page                                                   */
/* ------------------------------------------------------------------ */

const INFO_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>IoT Demo — Workers + D1 + ThingsBoard</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.7; color:#222; }
    code { background:#f3f3f3; padding:2px 6px; border-radius:4px; }
    pre { background:#f6f8fa; padding:12px; border-radius:6px; overflow:auto; }
    a.btn { display:inline-block; background:#2563eb; color:#fff; padding:8px 14px; border-radius:6px; text-decoration:none; margin:4px 0; }
  </style>
</head>
<body>
  <h1>IoT Demo — Workers + D1 + ThingsBoard (EU)</h1>
  <p>یک Worker روی Cloudflare که دادهٔ فیک سنسور تولید می‌کند، در <b>D1</b> ذخیره می‌کند و به <b>ThingsBoard (EU)</b> می‌فرستد.</p>

  <h2>Endpoint ها</h2>
  <pre>
POST /simulate     → تولید و ارسال یک رکورد جدید
GET  /readings     → ۲۰ رکورد آخر از D1
POST /resend       → ارسال مجدد رکوردهای published = 0
GET  /debug        → وضعیت توکن
  </pre>

  <h2>تست سریع</h2>
  <pre>curl -X POST https://YOUR-WORKER.workers.dev/simulate</pre>

  <p><a class="btn" href="/readings">دیدن داده‌ها در D1</a></p>
</body>
</html>`;

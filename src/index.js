/**
 * IoT Demo Worker — Cloudflare Workers + D1 + MQTT over WebSocket → ThingsBoard
 *
 * Endpoints:
 *   GET  /          → صفحهٔ راهنما
 *   GET  /readings  → ۲۰ رکورد آخر از D1
 *   POST /simulate  → تولید دادهٔ فیک، ذخیره در D1، ارسال به ThingsBoard (await مستقیم)
 *   POST /resend    → تلاش مجدد برای ارسال رکوردهای published=0
 *
 * نکات مهم:
 *   - در Workers، اتصال خروجی WebSocket باید با fetch() و هدر Upgrade انجام شود
 *     (new WebSocket() برای اتصال خروجی پشتیبانی نمی‌شود).
 *   - به‌جای ctx.waitUntil از await مستقیم استفاده می‌کنیم تا ارسال MQTT
 *     قبل از پایان درخواست لغو نشود.
 *   - پیام‌های WebSocket در Workers ممکن است Blob باشند؛ باید به ArrayBuffer تبدیل شوند.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

        // ارسال MQTT به‌صورت مستقیم (await) تا Worker تا پایان صبر کند
        let mqtt = { ok: true };
        try {
          await publishAndMark(reading, env);
        } catch (err) {
          console.error('MQTT publish failed:', err);
          mqtt = { ok: false, error: err.message };
        }

        return Response.json({ status: 'ok', reading, mqtt });
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
/*  D1 helpers                                                         */
/* ------------------------------------------------------------------ */

async function markPublished(id, env) {
  await env.DB.prepare(
    'UPDATE sensor_readings SET published = 1, published_at = ? WHERE id = ?'
  )
    .bind(Date.now(), id)
    .run();
}

async function publishAndMark(reading, env) {
  await publishToThingsBoard(reading, env);
  if (reading.id) await markPublished(reading.id, env);
}

/* ------------------------------------------------------------------ */
/*  MQTT over WebSocket → ThingsBoard (via fetch upgrade)              */
/* ------------------------------------------------------------------ */

async function publishToThingsBoard(reading, env) {
  const token = env.TB_ACCESS_TOKEN;
  if (!token) throw new Error('TB_ACCESS_TOKEN is not set');

  const rawUrl = env.TB_MQTT_URL || 'wss://mqtt.thingsboard.cloud/mqtt';
  // در Workers اتصال خروجی WebSocket با fetch انجام می‌شود، پس
  // طرح wss:// باید به https:// تبدیل شود.
  const wsUrl = rawUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');

  const topic = 'v1/devices/me/telemetry';
  const payload = JSON.stringify({
    temperature: reading.temperature,
    humidity: reading.humidity,
    pressure: reading.pressure,
    voltage: reading.voltage,
    ts: reading.ts,
  });

  // 1) ارتقای اتصال به WebSocket با fetch
  const response = await fetch(wsUrl, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Protocol': 'mqtt',
    },
  });

  if (response.status !== 101) {
    throw new Error(`WebSocket upgrade failed: ${response.status}`);
  }

  const ws = response.webSocket;
  if (!ws) throw new Error('No webSocket in fetch response');
  ws.accept();

  // 2) گفت‌وگوی MQTT داخل یک Promise
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(arg);
    };

    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      finish(reject, new Error('MQTT timeout'));
    }, 8000);

    ws.addEventListener('open', () => {
      try {
        ws.send(buildConnectPacket(token));
      } catch (err) {
        finish(reject, err);
      }
    });

    ws.addEventListener('message', async (event) => {
      try {
        // در Workers پیام ممکن است Blob باشد
        let raw = event.data;
        if (raw instanceof Blob) {
          raw = await raw.arrayBuffer();
        }
        const data = new Uint8Array(raw);
        const packetType = data[0] >> 4;

        if (packetType === 2 /* CONNACK */) {
          const returnCode = data.length >= 4 ? data[3] : 0xff;
          if (returnCode !== 0x00) {
            try { ws.close(); } catch (_) {}
            finish(reject, new Error(`CONNACK rejected, code=${returnCode}`));
            return;
          }

          try {
            ws.send(buildPublishPacket(topic, payload));
          } catch (err) {
            finish(reject, err);
            return;
          }

          // QoS 0 → بدون ack؛ کمی صبر تا ارسال شود
          setTimeout(() => {
            try { ws.send(buildDisconnectPacket()); } catch (_) {}
            try { ws.close(); } catch (_) {}
            finish(resolve);
          }, 400);
        }
      } catch (err) {
        finish(reject, err);
      }
    });

    ws.addEventListener('error', (event) => {
      finish(
        reject,
        new Error('WebSocket error: ' + (event?.message || 'unknown'))
      );
    });

    ws.addEventListener('close', () => {
      finish(resolve);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  MQTT 3.1.1 packet builders (QoS 0)                                 */
/* ------------------------------------------------------------------ */

function buildConnectPacket(accessToken) {
  const protocolName = encodeString('MQTT');
  const protocolLevel = 4;      // MQTT 3.1.1
  // 0x82 = username flag (0x80) + clean session (0x02)
  const connectFlags = 0x82;
  const keepAlive = 60;

  const variableHeader = new Uint8Array([
    ...protocolName,
    protocolLevel,
    connectFlags,
    (keepAlive >> 8) & 0xff,
    keepAlive & 0xff,
  ]);

  const clientId = encodeString(accessToken);
  const username = encodeString(accessToken); // ThingsBoard: username = Access Token
  const payload = new Uint8Array([...clientId, ...username]);

  const remaining = variableHeader.length + payload.length;
  const fixedHeader = new Uint8Array([
    0x10,
    ...encodeRemainingLength(remaining),
  ]);

  return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]);
}

function buildPublishPacket(topic, payloadStr) {
  const topicBytes = encodeString(topic);
  const payloadBytes = new TextEncoder().encode(payloadStr);
  const remaining = topicBytes.length + payloadBytes.length;
  const fixedHeader = new Uint8Array([
    0x30, // PUBLISH, QoS 0
    ...encodeRemainingLength(remaining),
  ]);
  return new Uint8Array([...fixedHeader, ...topicBytes, ...payloadBytes]);
}

function buildDisconnectPacket() {
  return new Uint8Array([0xe0, 0x00]);
}

function encodeString(str) {
  const bytes = new TextEncoder().encode(str);
  return new Uint8Array([
    (bytes.length >> 8) & 0xff,
    bytes.length & 0xff,
    ...bytes,
  ]);
}

function encodeRemainingLength(length) {
  const bytes = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    bytes.push(digit);
  } while (length > 0);
  return bytes;
}

/* ------------------------------------------------------------------ */
/*  Simple info page                                                   */
/* ------------------------------------------------------------------ */

const INFO_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>IoT Demo — Workers + D1 + MQTT</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.7; color:#222; }
    code { background:#f3f3f3; padding:2px 6px; border-radius:4px; }
    pre { background:#f6f8fa; padding:12px; border-radius:6px; overflow:auto; }
    a.btn { display:inline-block; background:#2563eb; color:#fff; padding:8px 14px; border-radius:6px; text-decoration:none; margin:4px 0; }
  </style>
</head>
<body>
  <h1>IoT Demo — Workers + D1 + MQTT</h1>
  <p>یک Worker روی Cloudflare که دادهٔ فیک سنسور تولید می‌کند، در <b>D1</b> ذخیره می‌کند و با <b>MQTT over WebSocket</b> به <b>ThingsBoard</b> می‌فرستد.</p>

  <h2>Endpoint ها</h2>
  <pre>
POST /simulate     → تولید و ارسال یک رکورد جدید
GET  /readings     → ۲۰ رکورد آخر از D1
POST /resend       → ارسال مجدد رکوردهای published = 0
  </pre>

  <h2>تست سریع</h2>
  <pre>curl -X POST https://YOUR-WORKER.workers.dev/simulate</pre>

  <p><a class="btn" href="/readings">دیدن داده‌ها در D1</a></p>

  <p style="color:#666;font-size:.9em">نمونهٔ پروژه برای مصاحبهٔ IoT — ترکیب Edge، D1 و MQTT.</p>
</body>
</html>`;

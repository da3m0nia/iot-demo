<div align="center">

# 🏭 Industrial IoT Gateway

### Cloudflare Workers · D1 · ThingsBoard (EU)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-F38020?style=flat&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![ThingsBoard](https://img.shields.io/badge/ThingsBoard-EU-3b82f6?style=flat)](https://eu.thingsboard.cloud/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee?style=flat)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?style=flat&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

**A multi-device IoT gateway running entirely on Cloudflare's edge.**  
Simulates three industrial devices, persists readings in D1 (SQLite), and publishes telemetry to ThingsBoard via REST API — with a real-time browser dashboard, Store-and-Forward retry, and a design optimized for Cloudflare's Free plan.

[Features](#-features) · [Architecture](#-architecture) · [Quick Start](#-quick-start) · [Local Development](#-local-development) · [API Reference](#-api-reference) · [Interview Notes](#-interview-talking-points)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Simulated Devices](#-simulated-devices)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start (Production)](#-quick-start-production)
- [Local Development](#-local-development)
- [Testing](#-testing)
- [API Reference](#-api-reference)
- [Design Decisions](#-design-decisions)
- [Security](#-security)
- [Cloudflare Free Plan Notes](#-cloudflare-free-plan-notes)
- [Troubleshooting](#-troubleshooting)
- [Interview Talking Points](#-interview-talking-points)
- [License](#-license)

---

## 🎯 Overview

This project is a **lightweight IoT gateway** built entirely on Cloudflare's serverless platform. It demonstrates the complete data path from **device simulation** → **edge processing** → **persistence** → **cloud platform (ThingsBoard)** — all within the Cloudflare Free plan limits.

**What makes it production-grade:**

- **Store-and-Forward resilience** — readings survive ThingsBoard outages
- **Multi-device isolation** — each device has its own access token
- **Free-plan conscious** — sequential publishing, no Cron triggers, no wasted CPU
- **Real-time dashboard** — start/stop sending, live charts, activity log
- **Realistic sensor physics** — correlated values, cumulative counters, inertia

---

## 🏭 Simulated Devices

| Device ID | Type | Sensors | Use Case |
|-----------|------|---------|----------|
| **`panel-01`** | Electrical Panel | Voltage L1/L2/L3, current, active power, cumulative energy, power factor, panel temp | Electrical distribution monitoring |
| **`motor-01`** | Electric Motor | RPM, 3-axis vibration (X/Y/Z), winding temp, motor current | Predictive maintenance |
| **`env-01`** | Environment | Temperature, humidity, atmospheric pressure, CO₂ | Environmental monitoring |

Each device uses a **separate ThingsBoard access token**, stored as Cloudflare Secrets (`TB_TOKEN_PANEL`, `TB_TOKEN_MOTOR`, `TB_TOKEN_ENV`).

**Sensor realism** — values are physically correlated, not pure `Math.random()`:

- ⚡ **Power** = `√3 × V × I × PF`
- 🔋 **Energy** accumulates over time (kWh counter)
- ⚙️ **RPM** changes with inertia (bounded noise)
- 📳 **Vibration** = sine wave + noise (realistic mechanical signature)
- 🌡️ **Temperature/humidity** follow inertia (no jumps)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎛️ **Multi-Device** | Three independent devices, each with its own token and sensor set |
| 📊 **Live Dashboard** | Real-time charts, sensor cards, activity log — no build step |
| 🔁 **Store-and-Forward** | Failed publishes retried via `/resend`, data never lost |
| 🎯 **Auto-Send Control** | Adjustable interval (1–30s) and batch size (1–10) from UI |
| 🔒 **Token Isolation** | Per-device tokens in Cloudflare Secrets |
| 💰 **Free-Plan Optimized** | Sequential publishing, no subrequest bursts, no Cron |
| 🧪 **Testable API** | Every endpoint callable via `curl` |
| 🌍 **REST → ThingsBoard** | Works around Workers' WebSocket/MQTT port restrictions |
| 📱 **Responsive UI** | Works on desktop and mobile |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker (Edge)                    │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  panel-01    │    │  motor-01    │    │   env-01     │       │
│  │  (simulated) │    │  (simulated) │    │  (simulated) │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             ▼                                   │
│                    ┌────────────────┐                           │
│                    │  Device Layer  │  (devices.js)             │
│                    │  State + Gen   │                           │
│                    └────────┬───────┘                           │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              ▼              ▼              ▼                    │
│      ┌──────────────┐  ┌────────┐  ┌──────────────┐             │
│      │  POST        │  │   D1   │  │  ThingsBoard │             │
│      │  /simulate   │  │ (SQLite│  │  (EU) REST   │             │
│      │              │  │   )    │  │              │             │
│      └──────────────┘  └────────┘  └──────────────┘             │
│                             │              ▲                    │
│                             │              │                    │
│                       published=0   ┌──────┴───────┐            │
│                       on failure    │  /resend     │            │
│                                     │  (retry)     │            │
│                                     └──────────────┘            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  GET /  →  Dashboard UI (HTML + Chart.js)            │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Dashboard (or `curl`) calls `POST /simulate?device=ID`
2. Worker generates a reading via `devices.js`
3. Reading saved to D1 with `published=0`
4. Worker publishes to ThingsBoard (REST, sequential)
5. On success: `published=1` set. On failure: stays `0` for `/resend`
6. Dashboard polls `/stats` every 3s to refresh counters

---

## 🧰 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | **Cloudflare Workers** | Serverless, globally distributed, free tier |
| Database | **Cloudflare D1** | SQLite at the edge, zero config |
| Target | **ThingsBoard (EU)** | Open-source IoT platform, REST API |
| UI | **Vanilla JS + Chart.js** | No build step, zero Worker CPU cost |
| Protocol | **REST** (not MQTT) | Workers block outbound WebSocket/1883 |
| Language | **JavaScript (ES2022)** | Native to Workers |

---

## 📁 Project Structure

```
iot-demo/
├── src/
│   ├── index.js          # Worker entry — routing, D1, ThingsBoard publish
│   ├── devices.js        # Device definitions + realistic sensor generators
│   └── ui.js             # Dashboard HTML (embedded, no build step)
├── schema.sql            # D1 tables + seed devices
├── wrangler.toml         # Worker config + D1 binding
├── package.json          # Scripts + devDependencies
├── .dev.vars.example     # Local dev template (copy → .dev.vars)
├── .gitignore
└── README.md
```

---

## ✅ Prerequisites

- **Node.js 18+** — [download](https://nodejs.org/)
- **Cloudflare account** — [sign up](https://dash.cloudflare.com/sign-up)
- **ThingsBoard account (EU region)** — [sign up](https://eu.thingsboard.cloud/signup)
- **`wrangler` CLI** — installed via npm (included in `devDependencies`)

> ⚠️ **Region matters**: This project targets **`eu.thingsboard.cloud`**. Tokens from `thingsboard.cloud` (US) or `demo.thingsboard.io` **will not work**. If you're on a different region, change `TB_BASE_URL` in `src/index.js`.

---

## 🚀 Quick Start (Production)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/iot-demo.git
cd iot-demo
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
npx wrangler whoami   # verify authentication
```

### 3. Create D1 database

```bash
npx wrangler d1 create iot-demo-db
```

Copy the `database_id` from output into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "iot-demo-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
```

### 4. Apply schema

```bash
npm run db:init
```

This creates `devices` and `sensor_readings` tables, and seeds the three devices.

### 5. Create ThingsBoard devices

For **each** of `panel-01`, `motor-01`, `env-01`:

1. Open **https://eu.thingsboard.cloud**
2. Navigate to **Devices → + Add new device**
3. Name it exactly (e.g. `panel-01`) → **Add**
4. Click the row → **Manage credentials** (pencil icon)
5. Copy the **Access token**

### 6. Store tokens as Cloudflare Secrets

```bash
npx wrangler secret put TB_TOKEN_PANEL
# paste panel-01 token when prompted

npx wrangler secret put TB_TOKEN_MOTOR
# paste motor-01 token when prompted

npx wrangler secret put TB_TOKEN_ENV
# paste env-01 token when prompted
```

Verify:

```bash
npx wrangler secret list
```

Expected output:

```
TB_TOKEN_PANEL
TB_TOKEN_MOTOR
TB_TOKEN_ENV
```

### 7. Deploy

```bash
npm run deploy
```

You'll get a URL like `https://iot-demo.YOUR_SUBDOMAIN.workers.dev`.

### 8. Open the dashboard

Navigate to your Worker URL in a browser. You'll see the **Industrial IoT Dashboard**.

---

## 💻 Local Development

Local dev uses **Miniflare** (built into Wrangler) to emulate Workers + D1 on your machine — no network deploys required.

### 1. Create local env file

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and paste **real tokens** (these are only for local testing, never committed):

```dotenv
TB_TOKEN_PANEL=your_panel_token_here
TB_TOKEN_MOTOR=your_motor_token_here
TB_TOKEN_ENV=your_env_token_here
```

> ⚠️ `.dev.vars` is git-ignored. Never commit it.

### 2. Initialize local D1

```bash
npm run db:init:local
```

This creates a local SQLite file under `.wrangler/state/` with the schema and seed data.

### 3. Start dev server

```bash
npm run dev
```

Wrangler starts at `http://localhost:8787`. You'll see:

```
⎔ Starting local server...
[wrangler:info] Ready on http://localhost:8787
```

### 4. Test locally

**Open dashboard:**
```bash
start http://localhost:8787
# or: open http://localhost:8787 (macOS)
```

**Send a reading via curl (PowerShell):**
```powershell
curl.exe -X POST "http://localhost:8787/simulate?device=panel-01"
```

**Check stats:**
```powershell
curl.exe "http://localhost:8787/stats?device=panel-01"
```

**Expected response:**
```json
{
  "deviceId": "panel-01",
  "total": 1,
  "published": 1,
  "unpublished": 0,
  "lastReading": {
    "ts": 1794767792593,
    "metrics": {
      "voltage_l1": 231.4,
      "voltage_l2": 229.8,
      "voltage_l3": 230.2,
      "current": 12.43,
      "active_power_kw": 7.61,
      "energy_kwh": 1250.502,
      "power_factor": 0.89,
      "panel_temp_c": 28.1
    }
  }
}
```

### 5. Reset local database (if needed)

```bash
rm -rf .wrangler/state
npm run db:init:local
```

### 6. Switch to production

When done with local dev:

```bash
npm run deploy
```

---

## 🧪 Testing

### Test all three devices (PowerShell)

```powershell
$BASE = "https://iot-demo.YOUR_SUBDOMAIN.workers.dev"

# Panel
curl.exe -X POST "$BASE/simulate?device=panel-01"

# Motor
curl.exe -X POST "$BASE/simulate?device=motor-01"

# Environment
curl.exe -X POST "$BASE/simulate?device=env-01"

# All stats
curl.exe "$BASE/stats?device=panel-01"
curl.exe "$BASE/stats?device=motor-01"
curl.exe "$BASE/stats?device=env-01"
```

### Bash version

```bash
BASE="https://iot-demo.YOUR_SUBDOMAIN.workers.dev"

for device in panel-01 motor-01 env-01; do
  echo "→ $device"
  curl -s -X POST "$BASE/simulate?device=$device"
  echo
done

curl -s "$BASE/stats?device=panel-01" | jq
```

### Test the Store-and-Forward flow

**Step 1** — Break ThingsBoard publishing (temporarily unset a token):

```bash
npx wrangler secret delete TB_TOKEN_MOTOR
```

**Step 2** — Send a reading. It should fail gracefully:

```powershell
curl.exe -X POST "$BASE/simulate?device=motor-01"
```

Expected: `"thingsboard": {"ok": false, "error": "Secret TB_TOKEN_MOTOR not set"}`  
The reading is **still stored** in D1 with `published=0`.

**Step 3** — Restore the token:

```bash
npx wrangler secret put TB_TOKEN_MOTOR
```

**Step 4** — Retry failed readings:

```powershell
curl.exe -X POST "$BASE/resend?device=motor-01"
```

Expected: `{"attempted": 1, "outcomes": [{"id": 1, "status": "sent"}]}`

This demonstrates **Store-and-Forward** — the same pattern used in SCADA/RTU systems.

### Load test (batch of 20)

```powershell
for ($i = 1; $i -le 20; $i++) {
  curl.exe -s -X POST "$BASE/simulate?device=panel-01" | Out-Null
  Write-Host "[$i/20] sent"
  Start-Sleep 2
}
```

### Live log tailing

```bash
npx wrangler tail
```

In another terminal, trigger sends. Watch errors and warnings in real time.

---

## 📡 API Reference

| Method | Path | Query Params | Description |
|--------|------|--------------|-------------|
| `GET` | `/` | — | Dashboard UI |
| `GET` | `/devices` | — | List registered devices |
| `GET` | `/stats` | `?device=ID` | Counters + last reading |
| `GET` | `/readings` | `?device=ID&limit=N` | Last N readings (metrics decoded) |
| `POST` | `/simulate` | `?device=ID` | Generate + persist + publish |
| `POST` | `/resend` | `?device=ID` | Retry unpublished rows |

### Example: `/simulate`

```bash
curl -X POST "https://<worker>/simulate?device=panel-01"
```

```json
{
  "status": "ok",
  "reading": {
    "deviceId": "panel-01",
    "ts": 1794767792593,
    "metrics": {
      "voltage_l1": 231.4,
      "voltage_l2": 229.8,
      "voltage_l3": 230.2,
      "current": 12.43,
      "active_power_kw": 7.61,
      "energy_kwh": 1250.502,
      "power_factor": 0.89,
      "panel_temp_c": 28.1
    },
    "id": 15
  },
  "thingsboard": { "ok": true }
}
```

---

## 🎨 Design Decisions

### Why REST instead of MQTT?

Cloudflare Workers restrict outbound WebSocket upgrades to external brokers (returns **522**) and block standard MQTT ports (1883/8883). Two options were considered:

1. **MQTT over WebSocket with manual packet building** — failed with `522`
2. **MQTT over TCP with `cloudflare:sockets`** — works but adds complexity for a demo
3. **REST API** ✅ — simple, reliable, one subrequest

In real-world deployments where the gateway runs on a **server** or **edge device** (not Workers), `mqtt.js` is the natural choice.

### Why a JSON `metrics` column?

Each device has a different sensor set. Using a `metrics TEXT` column with JSON:
- ✅ Zero schema changes when adding sensors
- ✅ D1-friendly (no complex migrations)
- ❌ Can't easily index individual metrics (acceptable for a demo)

### Why sequential publishing?

Workers Free plan limits **subrequests per invocation to 50** and **CPU time to 10ms**. `Promise.all` for batch publishing would risk both limits. Sequential keeps usage flat.

### Why client-side auto-send?

Cloudflare **Cron Triggers** count as extra invocations and can't be toggled interactively. Client-side `setInterval`:
- ✅ Free (runs in browser)
- ✅ User-controllable (start/stop)
- ✅ Perfect for demos and interviews

---

## 🔒 Security

| Practice | Implementation |
|----------|----------------|
| **Secrets, not code** | Tokens in `wrangler secret`, never in `src/` |
| **Per-device isolation** | 3 separate secrets — compromising one doesn't affect others |
| **Local dev safety** | `.dev.vars` git-ignored |
| **Token rotation** | Easy: `wrangler secret put TB_TOKEN_*` with new value |
| **No hard-coded URLs** | `TB_BASE_URL` is a single constant, easily changed |

**If a token leaks:**

1. Go to **ThingsBoard → Device → Manage credentials → Regenerate**
2. Update the secret: `npx wrangler secret put TB_TOKEN_DEVICE`
3. Redeploy (not required — secrets apply immediately)

---

## 💰 Cloudflare Free Plan Notes

| Limit | Free Tier | This Project |
|-------|-----------|--------------|
| Worker requests | 100,000 / day | ~1 per `/simulate` call |
| D1 writes | 100,000 / day | ~1 insert per reading |
| D1 reads | 5,000,000 / day | ~3 reads per `/stats` poll |
| Subrequests per invocation | 50 | 1 (sequential) |
| CPU time per invocation | 10ms | Well under (JSON + fetch) |
| Outbound WebSocket | ❌ blocked | N/A (REST only) |

**Safe usage example:** Sending every 3 seconds, 24/7, for **one device**:
- Requests: `86400/3 = 28,800` / day ✅ (28% of limit)
- D1 writes: `28,800` / day ✅ (28% of limit)

For three devices at 3s intervals, you're at **84% of limits** — still safe for demo purposes. For real deployments, increase interval or use Durable Objects for queuing.

---

## 🛠️ Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Wrong ThingsBoard region | Verify `TB_BASE_URL` matches your account's region (`eu.thingsboard.cloud` vs `thingsboard.cloud`) |
| `401 Unauthorized` | Wrong/invalid token | Regenerate token in ThingsBoard, re-store with `wrangler secret put` |
| `Secret TB_TOKEN_* not set` | Missing secret | `npx wrangler secret put TB_TOKEN_PANEL` |
| `WebSocket upgrade failed: 522` | (old MQTT code) Workers block WebSocket | Use REST (this repo already does) |
| `D1_ERROR: no such table` | Schema not applied | `npm run db:init` (prod) or `npm run db:init:local` (dev) |
| `Worker name missing` | Wrong directory | `cd iot-demo` before running `wrangler` commands |
| Empty dashboard after deploy | D1 has no data | Send a reading: `curl -X POST "<worker>/simulate?device=panel-01"` |
| Chart shows one point only | Only one reading in DB | Send more readings or use Auto-Send from UI |

**Enable verbose logging:**

```bash
npx wrangler tail --status error
```

---

## 🎤 Interview Talking Points

### 1. Architecture in 30 seconds

> "It's a serverless IoT gateway running on Cloudflare Workers. It simulates three industrial devices — an electrical panel, a motor, and an environmental sensor — persists every reading in D1 (SQLite at the edge), and publishes to ThingsBoard. Failed publishes are stored with a `published=0` flag and retried via a `/resend` endpoint — the Store-and-Forward pattern used in SCADA and RTUs."

### 2. Why not MQTT?

> "Cloudflare Workers has two relevant limitations: outbound WebSocket upgrades to external brokers fail with a 522, and standard MQTT ports are blocked. I tried MQTT over WebSocket first, hit the 522 error, and moved to REST for reliability. In a real deployment where the gateway runs on a server or edge device, `mqtt.js` would be the natural choice — which is exactly the stack I'd use if this were running on a Raspberry Pi at a factory."

### 3. Security

> "Each device has its own access token stored as a Cloudflare Secret. If one token leaks, only one device is compromised — not the whole fleet. Tokens are never in code, never in git, and I can rotate any one of them without touching the others. That's the pattern I'd use in production."

### 4. Free-plan awareness

> "The design is deliberately Free-plan compatible. Sequential publishing avoids subrequest bursts (50/invocation limit). Client-side auto-send avoids the cost of Cron Triggers. And I use a JSON metrics column so adding sensors doesn't require schema migrations."

### 5. Debugging story (tell this one — it lands well)

> "I hit three real bugs during development:
> 1. **`MQTT timeout`** — Workers don't support `new WebSocket()` for outbound connections; I migrated to REST.
> 2. **`522 WebSocket upgrade failed`** — Cloudflare blocks WebSocket to external brokers; confirmed by switching to REST.
> 3. **`401 Unauthorized`** — My token was from the EU region, but the code was hitting the US region. A `?debug` endpoint showing token length and preview helped me isolate it in under 2 minutes."

### 6. If asked about scale

> "For scale, I'd swap D1 for Durable Objects to serialize writes per device, and use Cloudflare Queues to decouple persistence from publishing. Right now the design is optimized for a demo — one request per reading, sequential — which is fine up to a few thousand readings per day."

### 7. If asked about alarms / rules

> "ThingsBoard supports Rule Chains natively. I'd add a rule that fires an alarm if `panel_temp_c > 45` or `vibration_x > 1.0` — those are the real-world thresholds for panel and motor. For this demo I kept it simple, but the data model is ready for it."

---

## 📜 License

MIT © 2026 — Free to use, fork, and adapt.

---

<div align="center">

**Built with ❤️ for the IoT interview on the line.**

*Star this repo if it helped you land the job.*

</div>

/**
 * Industrial IoT Dashboard — single-page app served by the Worker.
 * English LTR UI with device tabs, live sensor cards, chart, activity log.
 * Uses Chart.js from CDN (browser-side, no build step, no Worker CPU cost).
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IoT Gateway — Industrial Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #070b14; --card: #0f1a2e; --border: #1e293b; --border-2: #2d3b52;
      --text: #e2e8f0; --text-2: #cbd5e1; --muted: #64748b;
      --cyan: #22d3ee; --green: #10b981; --yellow: #f59e0b;
      --red: #ef4444; --purple: #a78bfa; --blue: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: radial-gradient(ellipse at top, #0f1a2e 0%, #070b14 60%);
      color: var(--text); line-height: 1.6; min-height: 100vh; padding: 20px;
    }
    .container { max-width: 1500px; margin: 0 auto; }

    /* ─── Header ─────────────────────────────────────────────── */
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.08));
      border: 1px solid var(--border); border-radius: 16px; margin-bottom: 20px;
      flex-wrap: wrap; gap: 12px;
    }
    .header-left h1 {
      font-size: 20px; font-weight: 700;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .header-left p { font-size: 12px; color: var(--muted); }
    .header-right { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .status-pill {
      display: flex; align-items: center; gap: 8px; padding: 6px 14px;
      background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);
      border-radius: 999px; font-size: 12px; color: var(--green);
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
    .btn-link { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--text); text-decoration: none; font-size: 12px; transition: .2s; }
    .btn-link:hover { border-color: var(--cyan); color: var(--cyan); }

    /* ─── Device tabs ────────────────────────────────────────── */
    .device-tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .device-tab {
      padding: 10px 20px; background: var(--card); border: 1px solid var(--border);
      border-radius: 10px; cursor: pointer; transition: .2s; font-family: inherit;
      color: var(--text-2); font-size: 13px; display: flex; align-items: center; gap: 8px;
    }
    .device-tab:hover { border-color: var(--border-2); }
    .device-tab.active { border-color: var(--cyan); background: rgba(34,211,238,0.08); color: var(--cyan); }
    .device-tab .icon { font-size: 18px; }

    /* ─── Stat cards ─────────────────────────────────────────── */
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 12px; margin-bottom: 20px; }
    .stat-card { padding: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; position: relative; overflow: hidden; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; }
    .stat-card.total::before { background: var(--cyan); }
    .stat-card.sent::before  { background: var(--green); }
    .stat-card.pending::before { background: var(--yellow); }
    .stat-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
    .stat-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stat-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

    /* ─── Layout grid ────────────────────────────────────────── */
    .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; margin-bottom: 16px; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }

    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .panel-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .panel-title::before { content: ''; width: 3px; height: 14px; background: var(--cyan); border-radius: 2px; }

    /* ─── Controls ───────────────────────────────────────────── */
    .control-group { margin-bottom: 14px; }
    .control-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-2); margin-bottom: 6px; }
    .control-value { color: var(--cyan); font-weight: 600; font-variant-numeric: tabular-nums; }
    input[type=range] { width: 100%; height: 5px; border-radius: 3px; background: var(--border); outline: none; appearance: none; cursor: pointer; }
    input[type=range]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--cyan); cursor: pointer; box-shadow: 0 0 8px rgba(34,211,238,.5); }

    .btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 10px 14px; border: none; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: .2s; margin-bottom: 8px; }
    .btn:last-child { margin-bottom: 0; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn-primary { background: linear-gradient(135deg, var(--cyan), var(--blue)); color: #0a101f; }
    .btn-success { background: linear-gradient(135deg, var(--green), #059669); color: white; }
    .btn-warning { background: linear-gradient(135deg, var(--yellow), #d97706); color: #0a101f; }
    .btn-danger  { background: linear-gradient(135deg, var(--red), #dc2626); color: white; }
    .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(34,211,238,.25); }

    /* ─── Chart ──────────────────────────────────────────────── */
    .chart-container { position: relative; height: 300px; }

    /* ─── Sensor cards ───────────────────────────────────────── */
    .sensor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 10px; }
    .sensor-card { padding: 12px; background: rgba(15,26,46,0.6); border: 1px solid var(--border); border-radius: 10px; text-align: center; }
    .sensor-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
    .sensor-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--cyan); }
    .sensor-unit { font-size: 11px; color: var(--muted); }

    /* ─── Activity log ───────────────────────────────────────── */
    .log-list { max-height: 200px; overflow-y: auto; }
    .log-list::-webkit-scrollbar { width: 6px; }
    .log-list::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
    .log-item { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .log-time { color: var(--muted); font-family: monospace; font-size: 11px; min-width: 65px; }
    .log-status { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
    .log-status.ok { background: rgba(16,185,129,.15); color: var(--green); }
    .log-status.fail { background: rgba(239,68,68,.15); color: var(--red); }
    .log-content { flex: 1; color: var(--text-2); font-family: monospace; font-size: 11px; }
    .empty-log { text-align: center; padding: 30px; color: var(--muted); font-size: 12px; }

    /* ─── Toast ──────────────────────────────────────────────── */
    .toast {
      position: fixed; bottom: 20px; left: 20px; padding: 10px 18px;
      background: var(--card); border: 1px solid var(--border); border-radius: 8px;
      font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.5);
      opacity: 0; transform: translateY(16px); transition: .3s; z-index: 100;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.success { border-left: 3px solid var(--green); }
    .toast.error   { border-left: 3px solid var(--red); }
    .toast.info    { border-left: 3px solid var(--cyan); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>🏭 Industrial IoT Gateway</h1>
        <p>Cloudflare Workers + D1 + ThingsBoard (EU)</p>
      </div>
      <div class="header-right">
        <div class="status-pill"><span class="status-dot"></span><span id="conn-status">Connected</span></div>
        <a href="https://eu.thingsboard.cloud" target="_blank" class="btn-link">ThingsBoard ↗</a>
        <a href="/readings" target="_blank" class="btn-link">API ↗</a>
      </div>
    </div>

    <div class="device-tabs" id="device-tabs">
      <button class="device-tab active" data-device="panel-01"><span class="icon">⚡</span> Electrical Panel</button>
      <button class="device-tab" data-device="motor-01"><span class="icon">⚙️</span> Motor</button>
      <button class="device-tab" data-device="env-01"><span class="icon">🌿</span> Environment</button>
    </div>

    <div class="stats">
      <div class="stat-card total"><div class="stat-label">📊 Total Records</div><div class="stat-value" id="stat-total">0</div><div class="stat-sub">in D1</div></div>
      <div class="stat-card sent"><div class="stat-label">✅ Published</div><div class="stat-value" id="stat-sent" style="color:var(--green)">0</div><div class="stat-sub">to ThingsBoard</div></div>
      <div class="stat-card pending"><div class="stat-label">⏳ Pending</div><div class="stat-value" id="stat-pending" style="color:var(--yellow)">0</div><div class="stat-sub">awaiting publish</div></div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">⚙️ Control Panel</div>
        <div class="control-group">
          <div class="control-label"><span>Send Interval</span><span class="control-value"><span id="interval-val">3</span> s</span></div>
          <input type="range" id="interval" min="1" max="30" value="3" />
        </div>
        <div class="control-group">
          <div class="control-label"><span>Batch Size</span><span class="control-value"><span id="batch-val">1</span> record(s)</span></div>
          <input type="range" id="batch" min="1" max="10" value="1" />
        </div>
        <button class="btn btn-success" id="btn-start"><span id="btn-start-icon">▶</span><span id="btn-start-text">Start Auto-Send</span></button>
        <button class="btn btn-primary" id="btn-single">📤 Send One Reading</button>
        <button class="btn btn-warning" id="btn-resend">🔄 Retry Pending</button>
      </div>

      <div class="panel">
        <div class="panel-title">📡 Live Sensor Values</div>
        <div class="sensor-grid" id="sensor-grid"></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-title">📈 Trend (last 30 points)</div>
      <div class="chart-container"><canvas id="chart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-title">📋 Activity Log</div>
      <div class="log-list" id="log-list"><div class="empty-log">No activity yet. Click "Send One Reading" to begin.</div></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var $ = function (id) { return document.getElementById(id); };
    var currentDevice = 'panel-01';
    var sending = false;
    var intervalId = null;
    var chartData = { labels: [], datasets: [] };
    var chart = null;

    // Metadata per device — determines sensor cards and chart series
    var DEVICE_META = {
      'panel-01': {
        metrics: [
          { key: 'voltage_l1', label: 'Voltage L1', unit: 'V', color: '#f59e0b' },
          { key: 'voltage_l2', label: 'Voltage L2', unit: 'V', color: '#f97316' },
          { key: 'voltage_l3', label: 'Voltage L3', unit: 'V', color: '#eab308' },
          { key: 'current', label: 'Current', unit: 'A', color: '#22d3ee' },
          { key: 'active_power_kw', label: 'Active Power', unit: 'kW', color: '#a78bfa' },
          { key: 'energy_kwh', label: 'Energy', unit: 'kWh', color: '#f472b6' },
          { key: 'panel_temp_c', label: 'Panel Temp', unit: '°C', color: '#ef4444' }
        ]
      },
      'motor-01': {
        metrics: [
          { key: 'rpm', label: 'RPM', unit: 'rpm', color: '#22d3ee' },
          { key: 'vibration_x', label: 'Vibration X', unit: 'mm/s', color: '#f59e0b' },
          { key: 'vibration_y', label: 'Vibration Y', unit: 'mm/s', color: '#f97316' },
          { key: 'vibration_z', label: 'Vibration Z', unit: 'mm/s', color: '#eab308' },
          { key: 'winding_temp_c', label: 'Winding Temp', unit: '°C', color: '#ef4444' },
          { key: 'motor_current_a', label: 'Motor Current', unit: 'A', color: '#a78bfa' }
        ]
      },
      'env-01': {
        metrics: [
          { key: 'temperature_c', label: 'Temperature', unit: '°C', color: '#ef4444' },
          { key: 'humidity_pct', label: 'Humidity', unit: '%', color: '#22d3ee' },
          { key: 'pressure_hpa', label: 'Pressure', unit: 'hPa', color: '#a78bfa' },
          { key: 'co2_ppm', label: 'CO₂', unit: 'ppm', color: '#10b981' }
        ]
      }
    };

    /** Rebuilds sensor cards for the active device. */
    function buildSensorCards(deviceId) {
      var meta = DEVICE_META[deviceId];
      var grid = $('sensor-grid');
      grid.innerHTML = '';
      meta.metrics.forEach(function (m) {
        var card = document.createElement('div');
        card.className = 'sensor-card';
        card.innerHTML =
          '<div class="sensor-label">' + m.label + '</div>' +
          '<div class="sensor-value" id="sv-' + m.key + '">—</div>' +
          '<div class="sensor-unit">' + m.unit + '</div>';
        grid.appendChild(card);
      });
    }

    /** Rebuilds the chart with the first 3 metrics of the active device. */
    function buildChart(deviceId) {
      if (chart) chart.destroy();
      var meta = DEVICE_META[deviceId];
      chartData = {
        labels: [],
        datasets: meta.metrics.slice(0, 3).map(function (m) {
          return {
            label: m.label + ' (' + m.unit + ')',
            data: [],
            borderColor: m.color,
            backgroundColor: m.color + '15',
            tension: 0.4, fill: true, pointRadius: 2, borderWidth: 2
          };
        })
      };

      chart = new Chart($('chart').getContext('2d'), {
        type: 'line',
        data: chartData,
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: { legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } } } },
          scales: {
            x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(30,41,59,0.5)' } },
            y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(30,41,59,0.5)' } }
          }
        }
      });
    }

    /** Small toast notification helper. */
    function toast(msg, type) {
      var t = $('toast'); t.textContent = msg;
      t.className = 'toast show ' + (type || 'info');
      clearTimeout(t._t);
      t._t = setTimeout(function () { t.className = 'toast'; }, 3000);
    }

    /** Appends a row to the activity log (max 30 entries). */
    function addLog(ok, deviceId, id, metrics, error) {
      var list = $('log-list');
      var empty = list.querySelector('.empty-log');
      if (empty) empty.remove();
      var now = new Date().toLocaleTimeString('en-US', { hour12: false });
      var item = document.createElement('div');
      item.className = 'log-item';
      var summary = ok
        ? Object.keys(metrics).slice(0, 3).map(function (k) { return k + '=' + metrics[k]; }).join(' • ')
        : error;
      item.innerHTML =
        '<span class="log-time">' + now + '</span>' +
        '<span class="log-status ' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'OK' : 'FAIL') + '</span>' +
        '<span class="log-content">' + deviceId + ' → ' + summary + '</span>';
      list.insertBefore(item, list.firstChild);
      while (list.children.length > 30) list.removeChild(list.lastChild);
    }

    /** Updates the sensor cards with the latest metrics. */
    function updateLiveSensors(metrics) {
      var meta = DEVICE_META[currentDevice];
      meta.metrics.forEach(function (m) {
        var el = $('sv-' + m.key);
        if (el && metrics[m.key] !== undefined) el.textContent = metrics[m.key];
      });
    }

    /** Pushes a new data point to the chart (keeps last 30). */
    function pushChart(metrics) {
      var label = new Date().toLocaleTimeString('en-US', { hour12: false });
      chartData.labels.push(label);
      var meta = DEVICE_META[currentDevice];
      meta.metrics.slice(0, 3).forEach(function (m, i) {
        chartData.datasets[i].data.push(metrics[m.key]);
      });
      if (chartData.labels.length > 30) {
        chartData.labels.shift();
        chartData.datasets.forEach(function (d) { d.data.shift(); });
      }
      chart.update();
    }

    /** Fetches /stats for the active device and updates counters + last reading. */
    async function refreshStats() {
      try {
        var r = await fetch('/stats?device=' + currentDevice);
        var d = await r.json();
        $('stat-total').textContent = d.total;
        $('stat-sent').textContent = d.published;
        $('stat-pending').textContent = d.unpublished;
        $('conn-status').textContent = 'Connected';
        if (d.lastReading && d.lastReading.metrics) updateLiveSensors(d.lastReading.metrics);
      } catch (e) {
        $('conn-status').textContent = 'Disconnected';
      }
    }

    /** Calls /simulate for the active device and logs the result. */
    async function sendOne() {
      try {
        var r = await fetch('/simulate?device=' + currentDevice, { method: 'POST' });
        var data = await r.json();
        var rd = data.reading;
        if (data.thingsboard && data.thingsboard.ok) {
          addLog(true, currentDevice, rd.id, rd.metrics);
          pushChart(rd.metrics);
          updateLiveSensors(rd.metrics);
        } else {
          addLog(false, currentDevice, rd.id, null, (data.thingsboard && data.thingsboard.error) || 'Unknown');
        }
        return data;
      } catch (e) {
        addLog(false, currentDevice, '—', null, e.message);
        return null;
      }
    }

    /** Starts periodic sending based on interval and batch sliders. */
    async function startSending() {
      sending = true;
      $('btn-start').className = 'btn btn-danger';
      $('btn-start-icon').textContent = '⏸';
      $('btn-start-text').textContent = 'Stop Sending';
      $('btn-single').disabled = true;
      var interval = parseInt($('interval').value) * 1000;
      var batch = parseInt($('batch').value);
      var tick = async function () {
        if (!sending) return;
        for (var i = 0; i < batch; i++) {
          if (!sending) return;
          await sendOne();
        }
        refreshStats();
      };
      await tick();
      intervalId = setInterval(tick, interval);
      toast('Auto-send started', 'success');
    }

    /** Stops periodic sending. */
    function stopSending() {
      sending = false;
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      $('btn-start').className = 'btn btn-success';
      $('btn-start-icon').textContent = '▶';
      $('btn-start-text').textContent = 'Start Auto-Send';
      $('btn-single').disabled = false;
      toast('Auto-send stopped', 'info');
    }

    /** Switches the active device and rebuilds UI sections. */
    function switchDevice(deviceId) {
      currentDevice = deviceId;
      document.querySelectorAll('.device-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.device === deviceId);
      });
      buildSensorCards(deviceId);
      buildChart(deviceId);
      loadInitialData(deviceId);
      refreshStats();
    }

    /** Loads the last 30 readings for a device to seed the chart. */
    async function loadInitialData(deviceId) {
      try {
        var r = await fetch('/readings?device=' + deviceId + '&limit=30');
        var d = await r.json();
        var arr = d.readings.slice().reverse();
        var meta = DEVICE_META[deviceId];
        arr.forEach(function (rd) {
          var label = new Date(rd.ts).toLocaleTimeString('en-US', { hour12: false });
          chartData.labels.push(label);
          meta.metrics.slice(0, 3).forEach(function (m, i) {
            chartData.datasets[i].data.push(rd.metrics[m.key]);
          });
        });
        if (chart) chart.update();
        if (arr.length > 0) updateLiveSensors(arr[arr.length - 1].metrics);
      } catch (e) {}
    }

    // ─── Wire up event listeners ─────────────────────────────────
    document.querySelectorAll('.device-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchDevice(tab.dataset.device); });
    });

    $('interval').addEventListener('input', function (e) { $('interval-val').textContent = e.target.value; });
    $('batch').addEventListener('input', function (e) { $('batch-val').textContent = e.target.value; });
    $('btn-start').addEventListener('click', function () { sending ? stopSending() : startSending(); });

    $('btn-single').addEventListener('click', async function () {
      var b = $('btn-single'); b.disabled = true;
      await sendOne(); await refreshStats();
      b.disabled = false;
    });

    $('btn-resend').addEventListener('click', async function () {
      var b = $('btn-resend'); b.disabled = true;
      b.textContent = 'Sending...';
      try {
        var r = await fetch('/resend?device=' + currentDevice, { method: 'POST' });
        var d = await r.json();
        toast(d.attempted + ' record(s) checked', 'success');
        await refreshStats();
      } catch (e) { toast('Error: ' + e.message, 'error'); }
      finally { b.disabled = false; b.textContent = '🔄 Retry Pending'; }
    });

    // ─── Boot ────────────────────────────────────────────────────
    buildSensorCards('panel-01');
    buildChart('panel-01');
    loadInitialData('panel-01');
    setInterval(refreshStats, 3000);
    refreshStats();
  </script>
</body>
</html>`;

export const DASHBOARD_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IoT Gateway — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #070b14; --bg-2: #0a101f; --card: #0f1a2e; --card-hover: #142441;
      --border: #1e293b; --border-2: #2d3b52; --text: #e2e8f0; --text-2: #cbd5e1;
      --muted: #64748b; --cyan: #22d3ee; --green: #10b981; --yellow: #f59e0b;
      --red: #ef4444; --purple: #a78bfa; --blue: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Vazirmatn', system-ui, sans-serif;
      background: radial-gradient(ellipse at top, #0f1a2e 0%, #070b14 60%);
      color: var(--text); line-height: 1.6; min-height: 100vh; padding: 24px;
    }
    .container { max-width: 1400px; margin: 0 auto; }

    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px;
      background: linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.08));
      border: 1px solid var(--border); border-radius: 16px; margin-bottom: 20px;
    }
    .header-left h1 {
      font-size: 22px; font-weight: 700;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; margin-bottom: 4px;
    }
    .header-left p { font-size: 13px; color: var(--muted); }
    .header-right { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .status-pill {
      display: flex; align-items: center; gap: 8px; padding: 8px 16px;
      background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3);
      border-radius: 999px; font-size: 13px; color: var(--green);
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--green);
      box-shadow: 0 0 10px var(--green); animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
    .btn-link {
      padding: 8px 16px; background: var(--card); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text); text-decoration: none;
      font-size: 13px; transition: all .2s;
    }
    .btn-link:hover { background: var(--card-hover); border-color: var(--cyan); color: var(--cyan); }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 16px; margin-bottom: 20px; }
    .stat-card {
      padding: 20px; background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; position: relative; overflow: hidden;
    }
    .stat-card::before {
      content: ''; position: absolute; top: 0; right: 0; width: 3px; height: 100%;
    }
    .stat-card.total::before { background: var(--cyan); }
    .stat-card.sent::before  { background: var(--green); }
    .stat-card.pending::before { background: var(--yellow); }
    .stat-card.temp::before  { background: var(--purple); }
    .stat-label { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .stat-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }

    .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; margin-bottom: 20px; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }

    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
    .panel-title {
      font-size: 15px; font-weight: 600; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .panel-title::before {
      content: ''; width: 4px; height: 16px; background: var(--cyan); border-radius: 2px;
    }

    .control-group { margin-bottom: 16px; }
    .control-label {
      display: flex; justify-content: space-between; font-size: 13px;
      color: var(--text-2); margin-bottom: 8px;
    }
    .control-value { color: var(--cyan); font-weight: 600; font-variant-numeric: tabular-nums; }
    input[type=range] {
      width: 100%; height: 6px; border-radius: 3px; background: var(--border);
      outline: none; appearance: none; cursor: pointer;
    }
    input[type=range]::-webkit-slider-thumb {
      appearance: none; width: 18px; height: 18px; border-radius: 50%;
      background: var(--cyan); cursor: pointer; box-shadow: 0 0 10px rgba(34,211,238,.5);
    }

    .btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 12px 16px; border: none; border-radius: 10px;
      font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: all .2s; margin-bottom: 10px;
    }
    .btn:last-child { margin-bottom: 0; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn-primary { background: linear-gradient(135deg, var(--cyan), var(--blue)); color: #0a101f; }
    .btn-success { background: linear-gradient(135deg, var(--green), #059669); color: white; }
    .btn-warning { background: linear-gradient(135deg, var(--yellow), #d97706); color: #0a101f; }
    .btn-danger  { background: linear-gradient(135deg, var(--red), #dc2626); color: white; }
    .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(34,211,238,.3); }

    .chart-container { position: relative; height: 340px; }

    .log-list { max-height: 240px; overflow-y: auto; padding: 4px; }
    .log-list::-webkit-scrollbar { width: 8px; }
    .log-list::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 4px; }
    .log-item {
      display: flex; align-items: center; gap: 12px; padding: 8px 12px;
      border-radius: 8px; font-size: 13px; border-bottom: 1px solid var(--border);
    }
    .log-time { color: var(--muted); font-family: 'Courier New', monospace; font-size: 12px; min-width: 70px; }
    .log-status { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .log-status.ok { background: rgba(16,185,129,.15); color: var(--green); }
    .log-status.fail { background: rgba(239,68,68,.15); color: var(--red); }
    .log-content { flex: 1; color: var(--text-2); font-family: 'Courier New', monospace; font-size: 12px; }
    .empty-log { text-align: center; padding: 40px 20px; color: var(--muted); font-size: 13px; }

    .toast {
      position: fixed; bottom: 24px; left: 24px; padding: 12px 20px;
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
      opacity: 0; transform: translateY(20px); transition: all .3s; z-index: 100;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.success { border-right: 3px solid var(--green); }
    .toast.error   { border-right: 3px solid var(--red); }
    .toast.info    { border-right: 3px solid var(--cyan); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>🌐 IoT Gateway Dashboard</h1>
        <p>Cloudflare Workers + D1 + ThingsBoard (EU)</p>
      </div>
      <div class="header-right">
        <div class="status-pill"><span class="status-dot"></span><span id="conn-status">متصل</span></div>
        <a href="https://eu.thingsboard.cloud" target="_blank" class="btn-link">ThingsBoard ↗</a>
        <a href="/readings" target="_blank" class="btn-link">API ↗</a>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card total">
        <div class="stat-label">📊 کل رکوردها</div>
        <div class="stat-value" id="stat-total">0</div>
        <div class="stat-sub">در D1 ذخیره شده</div>
      </div>
      <div class="stat-card sent">
        <div class="stat-label">✅ ارسال موفق</div>
        <div class="stat-value" id="stat-sent" style="color:var(--green)">0</div>
        <div class="stat-sub">به ThingsBoard رسیده</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-label">⏳ در انتظار</div>
        <div class="stat-value" id="stat-pending" style="color:var(--yellow)">0</div>
        <div class="stat-sub">منتظر ارسال مجدد</div>
      </div>
      <div class="stat-card temp">
        <div class="stat-label">🌡 دما (آخرین)</div>
        <div class="stat-value" id="stat-temp" style="color:var(--purple)">—</div>
        <div class="stat-sub" id="stat-temp-sub">داده‌ای نیست</div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">⚙️ پنل کنترل</div>
        <div class="control-group">
          <div class="control-label">
            <span>فاصله بین ارسال‌ها</span>
            <span class="control-value"><span id="interval-val">3</span> ثانیه</span>
          </div>
          <input type="range" id="interval" min="1" max="30" value="3" />
        </div>
        <div class="control-group">
          <div class="control-label">
            <span>تعداد در هر نوبت</span>
            <span class="control-value"><span id="batch-val">1</span> داده</span>
          </div>
          <input type="range" id="batch" min="1" max="10" value="1" />
        </div>
        <button class="btn btn-success" id="btn-start">
          <span id="btn-start-icon">▶</span>
          <span id="btn-start-text">شروع ارسال خودکار</span>
        </button>
        <button class="btn btn-primary" id="btn-single">📤 ارسال یک داده</button>
        <button class="btn btn-warning" id="btn-resend">🔄 ارسال مجدد Pending ها</button>
      </div>

      <div class="panel">
        <div class="panel-title">📈 نمودار زنده (۳۰ نقطهٔ آخر)</div>
        <div class="chart-container"><canvas id="chart"></canvas></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">📋 لاگ فعالیت</div>
      <div class="log-list" id="log-list">
        <div class="empty-log">هنوز فعالیتی ثبت نشده. دکمهٔ «ارسال یک داده» را بزنید.</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var $ = function (id) { return document.getElementById(id); };
    var sending = false;
    var intervalId = null;
    var chartData = { labels: [], temp: [], hum: [] };

    var chart = new Chart($('chart').getContext('2d'), {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [
          { label: 'دما (°C)', data: chartData.temp,
            borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)',
            tension: 0.4, fill: true, pointRadius: 2, borderWidth: 2 },
          { label: 'رطوبت (%)', data: chartData.hum,
            borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.1)',
            tension: 0.4, fill: true, pointRadius: 2, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { labels: { color: '#cbd5e1', font: { family: 'Vazirmatn', size: 12 } } } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(30,41,59,0.5)' } },
          y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(30,41,59,0.5)' } }
        }
      }
    });

    function toast(msg, type) {
      var t = $('toast'); t.textContent = msg;
      t.className = 'toast show ' + (type || 'info');
      clearTimeout(t._t);
      t._t = setTimeout(function () { t.className = 'toast'; }, 3000);
    }

    function addLog(ok, id, temp, hum, pressure, voltage, error) {
      var list = $('log-list');
      var empty = list.querySelector('.empty-log');
      if (empty) empty.remove();
      var now = new Date().toLocaleTimeString('fa-IR', { hour12: false });
      var item = document.createElement('div');
      item.className = 'log-item';
      if (ok) {
        item.innerHTML =
          '<span class="log-time">' + now + '</span>' +
          '<span class="log-status ok">OK</span>' +
          '<span class="log-content">id=' + id + ' • temp=' + temp + '°C • hum=' + hum + '% • press=' + pressure + ' • volt=' + voltage + 'V</span>';
      } else {
        item.innerHTML =
          '<span class="log-time">' + now + '</span>' +
          '<span class="log-status fail">FAIL</span>' +
          '<span class="log-content" style="color:#fca5a5">' + error + '</span>';
      }
      list.insertBefore(item, list.firstChild);
      while (list.children.length > 30) list.removeChild(list.lastChild);
    }

    function pushChart(temp, hum) {
      var label = new Date().toLocaleTimeString('fa-IR', { hour12: false });
      chartData.labels.push(label);
      chartData.temp.push(temp);
      chartData.hum.push(hum);
      if (chartData.labels.length > 30) {
        chartData.labels.shift(); chartData.temp.shift(); chartData.hum.shift();
      }
      chart.update();
    }

    async function refreshStats() {
      try {
        var r = await fetch('/stats');
        var d = await r.json();
        $('stat-total').textContent = d.total;
        $('stat-sent').textContent = d.published;
        $('stat-pending').textContent = d.unpublished;
        if (d.lastReading) {
          $('stat-temp').textContent = d.lastReading.temperature + '°';
          var dt = new Date(d.lastReading.ts);
          $('stat-temp-sub').textContent = dt.toLocaleTimeString('fa-IR', { hour12: false });
        }
        $('conn-status').textContent = 'متصل';
      } catch (e) {
        $('conn-status').textContent = 'قطع';
      }
    }

    async function sendOne() {
      try {
        var r = await fetch('/simulate', { method: 'POST' });
        var data = await r.json();
        var rd = data.reading;
        if (data.thingsboard && data.thingsboard.ok) {
          addLog(true, rd.id, rd.temperature, rd.humidity, rd.pressure, rd.voltage);
          pushChart(rd.temperature, rd.humidity);
        } else {
          addLog(false, rd.id, 0, 0, 0, 0, (data.thingsboard && data.thingsboard.error) || 'Unknown error');
        }
        return data;
      } catch (e) {
        addLog(false, '—', 0, 0, 0, 0, e.message);
        return null;
      }
    }

    async function startSending() {
      sending = true;
      $('btn-start').className = 'btn btn-danger';
      $('btn-start-icon').textContent = '⏸';
      $('btn-start-text').textContent = 'توقف ارسال';
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
      toast('ارسال خودکار شروع شد', 'success');
    }

    function stopSending() {
      sending = false;
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      $('btn-start').className = 'btn btn-success';
      $('btn-start-icon').textContent = '▶';
      $('btn-start-text').textContent = 'شروع ارسال خودکار';
      $('btn-single').disabled = false;
      toast('ارسال متوقف شد', 'info');
    }

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
      b.textContent = 'در حال ارسال...';
      try {
        var r = await fetch('/resend', { method: 'POST' });
        var d = await r.json();
        toast(d.attempted + ' رکورد بررسی شد', 'success');
        await refreshStats();
      } catch (e) { toast('خطا: ' + e.message, 'error'); }
      finally { b.disabled = false; b.textContent = '🔄 ارسال مجدد Pending ها'; }
    });

    setInterval(refreshStats, 2000);
    refreshStats();

    (async function loadInitial() {
      try {
        var r = await fetch('/readings?limit=30');
        var d = await r.json();
        var arr = d.readings.slice().reverse();
        for (var i = 0; i < arr.length; i++) {
          var rd = arr[i];
          var label = new Date(rd.ts).toLocaleTimeString('fa-IR', { hour12: false });
          chartData.labels.push(label);
          chartData.temp.push(rd.temperature);
          chartData.hum.push(rd.humidity);
        }
        chart.update();
      } catch (e) {}
    })();
  </script>
</body>
</html>`;

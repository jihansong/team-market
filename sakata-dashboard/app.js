// Dashboard wiring — data fetch, detection, render.

const SYMBOLS = [
  { key: 'KOSPI',  csv: 'data/kospi.csv',  label: 'KOSPI'  },
  { key: 'KOSDAQ', csv: 'data/kosdaq.csv', label: 'KOSDAQ' },
];

const PATTERN_META = [
  { key: 'samsan',    label: '三山 (삼산)',  desc: '세 봉우리 — 약세 반전' },
  { key: 'samcheon',  label: '三川 (삼천)',  desc: '세 골짜기 — 강세 반전' },
  { key: 'samgong',   label: '三空 (삼공)',  desc: '3연속 갭 — 추세 소진' },
  { key: 'sambyeong', label: '三兵 (삼병)',  desc: '직/적 삼병 — 추세 지속' },
  { key: 'sambeop',   label: '三法 (삼법)',  desc: '큰 추세 + 작은 봉정 + 재돌파' },
];

const PATTERN_COLOR = {
  samsan:    '#f85149',
  samcheon:  '#3fb950',
  samgong:   '#d29922',
  sambyeong: '#58a6ff',
  sambeop:   '#a371f7',
};

const PATTERN_SYMBOL = {
  samsan:    'square',
  samcheon:  'square',
  samgong:   'circle',
  sambyeong: 'diamond',
  sambeop:   'star',
};

async function fetchCandles(csvPath, years) {
  const res = await fetch(csvPath, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`CSV 로드 실패 (${res.status})`);
  const text = await res.text();
  const all = parseStooqCsv(text);
  if (!years) return all;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return all.filter(c => c.date >= cutoffStr);
}

function parseStooqCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('빈 데이터 (티커 또는 기간 확인)');
  const header = lines[0].split(',').map(s => s.trim().toLowerCase());
  const idx = {
    date:  header.indexOf('date'),
    open:  header.indexOf('open'),
    high:  header.indexOf('high'),
    low:   header.indexOf('low'),
    close: header.indexOf('close'),
  };
  if (Object.values(idx).some(v => v < 0)) throw new Error('CSV 헤더 오류');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const open  = parseFloat(cols[idx.open]);
    const high  = parseFloat(cols[idx.high]);
    const low   = parseFloat(cols[idx.low]);
    const close = parseFloat(cols[idx.close]);
    if ([open, high, low, close].some(v => !Number.isFinite(v))) continue;
    out.push({ date: cols[idx.date], open, high, low, close });
  }
  return out;
}

function filterByAsOf(candles, asOfStr) {
  if (!asOfStr) return candles;
  return candles.filter(c => c.date <= asOfStr);
}

function pct(x) {
  const sign = x >= 0 ? '+' : '';
  return `${sign}${(x * 100).toFixed(2)}%`;
}

function fmtNum(x) {
  return x == null ? '—' : x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function renderStageCard(key, candles, events, stage) {
  const card = document.getElementById(`card-${key}`);
  const last = candles[candles.length - 1];
  const ret20 = candles.length >= 21
    ? last.close / candles[candles.length - 21].close - 1 : null;
  const ret60 = candles.length >= 61
    ? last.close / candles[candles.length - 61].close - 1 : null;

  const label = card.querySelector('[data-field="stage"]');
  label.textContent = stage.stage;
  label.className = `stage-label ${stage.tone}`;

  card.querySelector('[data-field="note"]').textContent = stage.note;
  card.querySelector('[data-field="date"]').textContent = last.date;

  const r20 = card.querySelector('[data-field="ret20"]');
  const r60 = card.querySelector('[data-field="ret60"]');
  if (ret20 != null) {
    r20.textContent = pct(ret20);
    r20.style.color = ret20 >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (ret60 != null) {
    r60.textContent = pct(ret60);
    r60.style.color = ret60 >= 0 ? 'var(--green)' : 'var(--red)';
  }

  const ul = card.querySelector('[data-field="patterns"]');
  ul.innerHTML = '';
  const recencyBars = 5;
  const lastIdx = candles.length - 1;
  for (const p of PATTERN_META) {
    const recent = events[p.key].filter(e => e.index >= lastIdx - recencyBars);
    const detected = recent.length > 0;
    const li = document.createElement('li');
    li.className = detected ? 'detected' : 'not-detected';
    const recentDate = detected ? recent[recent.length - 1].date : '';
    li.innerHTML = `
      <span class="check">${detected ? '✓' : ''}</span>
      <span class="pname">${p.label}</span>
      <span class="pdesc">${p.desc}</span>
      <span class="pdate">${recentDate}</span>
    `;
    ul.appendChild(li);
  }
}

function buildChart(divId, key, candles, events, levels) {
  const x = candles.map(c => c.date);
  const candlestick = {
    type: 'candlestick',
    x,
    open: candles.map(c => c.open),
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    name: key,
    increasing: { line: { color: '#3fb950' } },
    decreasing: { line: { color: '#f85149' } },
    showlegend: true,
  };

  const traces = [candlestick];

  for (const p of PATTERN_META) {
    const ev = events[p.key];
    if (!ev.length) continue;
    traces.push({
      type: 'scatter', mode: 'markers',
      x: ev.map(e => e.date),
      y: ev.map(e => {
        const c = candles[e.index];
        return e.direction === 'up' ? c.low * 0.985 : c.high * 1.015;
      }),
      marker: {
        symbol: PATTERN_SYMBOL[p.key],
        color: PATTERN_COLOR[p.key],
        size: 9,
        line: { color: '#0d1117', width: 1 },
      },
      name: `${p.label} (${ev.length})`,
      hovertemplate: ev.map(e => `${e.date}<br>${e.info}`).join('<br>'),
      text: ev.map(e => e.info),
    });
  }

  const lastDate = x[x.length - 1];
  const firstDate = x[0];
  const dashMap = {
    'solid': 'solid', 'dot-short': 'dot', 'dot-mid': 'dot',
    'dot-long': 'dash', 'dot-final': 'longdash',
  };
  const shapes = levels.map(L => ({
    type: 'line', xref: 'x', yref: 'y',
    x0: firstDate, x1: lastDate, y0: L.value, y1: L.value,
    line: { color: L.color, width: 1.2, dash: dashMap[L.style] || 'dot' },
  }));

  const isMobile = window.innerWidth < 720;

  // On mobile we hide the right-side annotations to give the chart full width.
  const annotations = isMobile ? [] : levels.map(L => ({
    xref: 'paper', x: 1, xanchor: 'left',
    yref: 'y', y: L.value, yanchor: 'middle',
    text: `${L.name} · ${fmtNum(L.value)} (${pct(L.diff)})`,
    showarrow: false,
    font: { size: 10, color: L.color },
    bgcolor: 'rgba(13,17,23,0.6)',
  }));

  // Default zoom: last ~1 year (mobile) / ~2 years (desktop). User can drag/zoom to see more.
  const defaultDays = isMobile ? 365 : 365 * 2;
  const lastDateObj = new Date(lastDate);
  const zoomStart = new Date(lastDateObj);
  zoomStart.setDate(zoomStart.getDate() - defaultDays);
  const zoomStartStr = zoomStart < new Date(firstDate)
    ? firstDate : zoomStart.toISOString().slice(0, 10);

  // Zoomed Y-range so candles fill the panel.
  const visibleCandles = candles.filter(c => c.date >= zoomStartStr);
  const yMin = Math.min(...visibleCandles.map(c => c.low)) * 0.97;
  const yMax = Math.max(...visibleCandles.map(c => c.high)) * 1.03;

  const layout = {
    paper_bgcolor: '#161b22',
    plot_bgcolor: '#0d1117',
    font: { color: '#e6edf3', size: 11 },
    margin: isMobile
      ? { l: 48, r: 12, t: 8, b: 36 }
      : { l: 50, r: 220, t: 10, b: 40 },
    xaxis: {
      rangeslider: { visible: false },
      gridcolor: '#2a3340',
      type: 'date',
      range: [zoomStartStr, lastDate],
      tickangle: 0,
      tickfont: { size: isMobile ? 9 : 11 },
    },
    yaxis: {
      gridcolor: '#2a3340',
      range: [yMin, yMax],
      tickfont: { size: isMobile ? 9 : 11 },
    },
    legend: {
      orientation: 'h', y: 1.08, x: 0,
      bgcolor: 'rgba(0,0,0,0)',
      font: { size: isMobile ? 9 : 11 },
    },
    shapes,
    annotations,
    dragmode: 'pan',
  };

  Plotly.newPlot(divId, traces, layout, {
    responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ['select2d', 'lasso2d'],
  });
}

function renderLevelsTable(tableId, levels, lastClose) {
  const t = document.getElementById(tableId);
  const dashLabel = { 'solid': '실선', 'dot-short': '점선(단기)',
    'dot-mid': '점선(중기)', 'dot-long': '점선(장기)', 'dot-final': '점선(최종)' };
  const rows = levels.map(L => {
    const diffClass = L.diff >= 0 ? 'pos' : 'neg';
    return `<tr>
      <td><span class="swatch ${L.style === 'solid' ? '' : 'dash'}" style="color:${L.color};background:${L.style === 'solid' ? L.color : 'transparent'}"></span></td>
      <td>${dashLabel[L.style] || '점선'}</td>
      <td>${L.name}</td>
      <td>${fmtNum(L.value)}</td>
      <td class="${diffClass}">${pct(L.diff)}</td>
      <td>${L.meaning}</td>
    </tr>`;
  }).join('');
  t.innerHTML = `
    <thead><tr>
      <th>색상</th><th>선 종류</th><th>레벨</th><th>가격</th>
      <th>현재가 대비</th><th>해석</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

async function run() {
  const status = document.getElementById('status');
  const years = parseInt(document.getElementById('years').value, 10);
  const asOf = document.getElementById('asof-date').value;

  for (const sym of SYMBOLS) {
    try {
      status.textContent = `${sym.label} 데이터 로딩…`;
      status.className = 'status';
      let candles = await fetchCandles(sym.csv, years);
      candles = filterByAsOf(candles, asOf);
      if (candles.length < 60) throw new Error('데이터가 60일 미만 (조회기간 늘리세요)');

      const events = Sakata.detectAll(candles);
      const stage = Sakata.classifyStage(candles, events);
      const levels = Sakata.technicalLevels(candles);
      const last = candles[candles.length - 1];

      renderStageCard(sym.key, candles, events, stage);
      buildChart(`chart-${sym.key}`, sym.key, candles, events, levels);
      renderLevelsTable(`levels-${sym.key}`, levels, last.close);
    } catch (err) {
      console.error(err);
      status.textContent = `${sym.label} 로드 실패: ${err.message}`;
      status.className = 'status error';
      const card = document.getElementById(`card-${sym.key}`);
      card.querySelector('[data-field="note"]').textContent =
        '데이터 로드 실패 — 네트워크 또는 CORS 차단 가능성. 브라우저 콘솔 확인.';
    }
  }
  status.textContent = '완료';
  status.className = 'status';
}

function init() {
  document.getElementById('refresh-btn').addEventListener('click', run);
  document.getElementById('years').addEventListener('change', run);
  document.getElementById('asof-date').addEventListener('change', run);
  run();
}

document.addEventListener('DOMContentLoaded', init);

/* Chart.js wrappers — house dark theme */
(function (g) {
  const GRID = '#2d333b', TXT = '#8b949e';
  const charts = {};

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  /* combo: spend bars + ROAS line + NC-CPA line over daily series */
  function trend(canvasId, series, opts = {}) {
    destroy(canvasId);
    const el = document.getElementById(canvasId);
    if (!el) return;
    const labels = series.map(s => s.date.slice(5));
    charts[canvasId] = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Spend', data: series.map(s => s.spend), backgroundColor: 'rgba(212,160,23,.35)', borderColor: '#d4a017', borderWidth: 1, yAxisID: 'y', order: 3 },
          { type: 'line', label: 'ROAS', data: series.map(s => s.roas), borderColor: '#58a6ff', backgroundColor: '#58a6ff', yAxisID: 'y1', tension: .3, spanGaps: true, pointRadius: 2, order: 1 },
          { type: 'line', label: 'NC-CPA', data: series.map(s => s.ncCpa), borderColor: '#f85149', backgroundColor: '#f85149', yAxisID: 'y2', tension: .3, spanGaps: true, pointRadius: 2, borderDash: [4, 3], order: 2, hidden: !!opts.hideNcCpa },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: TXT, boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.dataset.label === 'ROAS' ? (c.parsed.y == null ? '—' : c.parsed.y.toFixed(2)) : fmtMoney(c.parsed.y)}` } } },
        scales: {
          x: { ticks: { color: TXT, font: { size: 10 } }, grid: { color: GRID } },
          y: { position: 'left', ticks: { color: '#d4a017', font: { size: 10 }, callback: v => '$' + short(v) }, grid: { color: GRID } },
          y1: { position: 'right', ticks: { color: '#58a6ff', font: { size: 10 } }, grid: { drawOnChartArea: false }, beginAtZero: true },
          y2: { position: 'right', display: !opts.hideNcCpa, ticks: { color: '#f85149', font: { size: 10 }, callback: v => '$' + short(v) }, grid: { drawOnChartArea: false }, beginAtZero: true },
        },
      },
    });
    requestAnimationFrame(() => { const c = charts[canvasId]; if (c) c.resize(); });
  }

  function fmtMoney(v) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function short(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v); }

  g.MobyCharts = { trend, destroy };
})(globalThis);

/* Aggregation, derived metrics, kill-list logic */
(function (g) {
  const M = () => Object.fromEntries(g.MobyData.METRICS.map(k => [k, 0]));

  function groupBy(rows, keyFn) {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (k == null) continue;
      let e = map.get(k);
      if (!e) { e = { key: k, rows: [], ...M() }; map.set(k, e); }
      e.rows.push(r);
      for (const m of g.MobyData.METRICS) e[m] += r[m] || 0;
    }
    for (const e of map.values()) derive(e);
    return [...map.values()];
  }

  function derive(e) {
    const dv = (a, b) => (b > 0 ? a / b : null);
    e.roas = dv(e.revenue, e.spend);
    e.cpa = dv(e.spend, e.orders);
    e.ncCpa = dv(e.spend, e.ncOrders);
    e.ncRoas = dv(e.ncRevenue, e.spend);
    e.ncPct = dv(e.ncOrders, e.orders) != null ? (e.ncOrders / e.orders) * 100 : null;
    e.cvr = dv(e.orders, e.users) != null ? (e.orders / e.users) * 100 : null;
    e.aov = dv(e.revenue, e.orders);
    e.ctr = dv(e.clicks, e.impressions) != null ? (e.clicks / e.impressions) * 100 : null;
    e.cpm = dv(e.spend, e.impressions) != null ? (e.spend / e.impressions) * 1000 : null;
    e.platRoas = dv(e.platformRevenue, e.spend);
    e.hookRate = dv(e.vHook, e.vTot) != null ? (e.vHook / e.vTot) * 100 : null;
    return e;
  }

  function series(rows, dates) {
    const byDate = new Map(dates.map(d => [d, { date: d, ...M() }]));
    for (const r of rows) {
      const e = byDate.get(r.date); if (!e) continue;
      for (const m of g.MobyData.METRICS) e[m] += r[m] || 0;
    }
    return [...byDate.values()].sort((a, b) => a.date < b.date ? -1 : 1).map(derive);
  }

  /* ---- goals (localStorage, per-funnel override of default) ---- */
  const GKEY = 'almoby_goals';
  const DEFAULT_GOALS = { minSpend: 100, roas: 1.5, ncPct: 60 };
  function getGoals() {
    try { return { default: { ...DEFAULT_GOALS }, ...(JSON.parse(localStorage.getItem(GKEY)) || {}) }; }
    catch { return { default: { ...DEFAULT_GOALS } }; }
  }
  function saveGoals(goals) { localStorage.setItem(GKEY, JSON.stringify(goals)); }
  function goalsFor(funnel, goals) {
    const d = { ...DEFAULT_GOALS, ...(goals.default || {}) };
    return { ...d, ...((funnel && goals[funnel]) || {}) };
  }

  /* ---- kill analysis: ads in Testing campaigns, over spend threshold, under benchmark ---- */
  function killList(adRows, dates, goals) {
    const placement = g.MobyData.state.placement;
    const byAd = groupBy(adRows, r => r.adName);
    const out = [];
    for (const ad of byAd) {
      const places = placement.get(ad.key) || [];
      const testing = places.filter(p => p.campaignParsed.isTesting);
      if (!testing.length) continue;
      const active = testing.some(p => p.ad.status === 'ACTIVE' && p.adset.status === 'ACTIVE' && p.campaign.status === 'ACTIVE');
      const parsed = ad.rows[0].parsed;
      const gl = goalsFor(parsed.funnel, goals);
      const overSpend = ad.spend >= gl.minSpend;
      const roasBad = gl.roas > 0 && (ad.roas == null || ad.roas < gl.roas);
      const ncBad = gl.ncPct > 0 && ad.ncPct != null && ad.ncPct < gl.ncPct;
      const flagged = overSpend && (roasBad || ncBad);
      // days-under tracker: consecutive most-recent days with spend>0 AND day-ROAS under goal
      const s = series(ad.rows, dates);
      let daysUnder = 0;
      for (let i = s.length - 1; i >= 0; i--) {
        const day = s[i];
        if (day.spend <= 0) { if (daysUnder > 0) break; else continue; }
        if (day.roas == null || day.roas < gl.roas) daysUnder++; else break;
      }
      out.push({ ...ad, parsed, places: testing, active, goal: gl, flagged, overSpend, roasBad, ncBad, daysUnder,
        reasons: flagged ? [roasBad ? `ROAS ${fmt(ad.roas)} < ${gl.roas}` : null, ncBad ? `NC% ${ad.ncPct.toFixed(0)} < ${gl.ncPct}` : null].filter(Boolean) : [] });
    }
    return out.sort((a, b) => (b.flagged - a.flagged) || (b.daysUnder - a.daysUnder) || (b.spend - a.spend));
    function fmt(v) { return v == null ? '—' : v.toFixed(2); }
  }

  g.MobyAgg = { groupBy, derive, series, getGoals, saveGoals, goalsFor, killList };
})(globalThis);

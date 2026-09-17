/* Data layer — loads JSON snapshots written by scripts/fetch.mjs.
   Falls back to data-demo/ (DEMO badge) when live data is absent.
   Adapter note: swap loadDay/loadCampaigns for direct MCP fetch() if Moby ever enables CORS. */
(function (g) {
  const state = { base: 'data', demo: false, meta: null, days: {}, campaigns: null, placement: null };

  async function fetchJson(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  async function init() {
    // source priority: local plain data/ -> hosted encrypted enc/ (needs unlock) -> demo
    try { state.meta = await fetchJson('data/meta.json'); state.base = 'data'; state.mode = 'plain'; }
    catch {
      try { await fetchJson('enc/salt.json'); state.mode = 'enc'; return state; } // meta comes after unlock()
      catch { state.meta = await fetchJson('data-demo/meta.json'); state.base = 'data-demo'; state.demo = true; state.mode = 'plain'; }
    }
    try { state.campaigns = await fetchJson(`${state.base}/campaigns.json`); }
    catch { state.campaigns = { campaigns: [] }; }
    buildPlacement();
    return state;
  }

  async function unlock(pass) {
    await MobyCrypto.unlock(pass); // throws on wrong passphrase
    state.meta = await MobyCrypto.fetchDecrypt('enc/meta.bin');
    try { state.campaigns = await MobyCrypto.fetchDecrypt('enc/campaigns.bin'); }
    catch { state.campaigns = { campaigns: [] }; }
    buildPlacement();
    return state;
  }

  function buildPlacement() {
    const map = new Map(); // adName -> [{campaign, adset, ad}]
    for (const c of state.campaigns.campaigns || []) {
      const cp = g.MobyParser.parseCampaignName(c.name);
      for (const a of c.adsets || []) {
        for (const ad of a.ads || []) {
          if (!map.has(ad.name)) map.set(ad.name, []);
          map.get(ad.name).push({ campaign: c, adset: a, ad, campaignParsed: cp });
        }
      }
    }
    state.placement = map;
  }

  async function loadRange(start, end) {
    const days = (state.meta.days || []).filter(d => d >= start && d <= end);
    const missing = days.filter(d => !state.days[d]);
    await Promise.all(missing.map(async d => {
      try {
        state.days[d] = state.mode === 'enc'
          ? await MobyCrypto.fetchDecrypt(`enc/days/${d}.bin`)
          : await fetchJson(`${state.base}/days/${d}.json`);
      } catch { state.days[d] = { date: d, creatives: [] }; }
    }));
    return days.map(d => state.days[d]);
  }

  /* Flatten day files into ad-day rows (one row per ad × lander × day) */
  function adDayRows(dayFiles) {
    const rows = [];
    for (const df of dayFiles) {
      for (const c of df.creatives || []) {
        const meta = { thumb: c.thumb, thumbBig: c.thumbBig, fb: c.fb, ig: c.ig };
        if ((c.landers || []).length) {
          for (const l of c.landers) {
            rows.push({ date: df.date, adName: l.adName, lander: normLander(l.lander), ...pick(l), ...meta, parsed: g.MobyParser.parseAdName(l.adName) });
          }
        } else {
          const p = g.MobyParser.parseAdName(c.name);
          rows.push({ date: df.date, adName: c.name, lander: p.lander || null, ...pick(c), ...meta, parsed: p });
        }
      }
    }
    return rows;
  }

  function normLander(url) {
    if (!url) return null;
    try { const u = new URL(url); return (u.pathname.replace(/\/$/, '') || '/').toLowerCase(); }
    catch { return String(url).toLowerCase(); }
  }

  const METRICS = ['spend','revenue','orders','ncOrders','ncRevenue','retOrders','retRevenue','platformOrders','platformRevenue','users','newVisitors','recurringVisitors','impressions','clicks','outboundClicks','vHook','vRet','vTot'];
  function pick(x) { const o = {}; for (const k of METRICS) o[k] = x[k] || 0; return o; }

  g.MobyData = { init, unlock, loadRange, adDayRows, state, METRICS };
})(globalThis);

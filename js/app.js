/* App state + rendering — three tabs: Landers / Persona-Concept / Testing */
(function (g) {
  const $ = s => document.querySelector(s);
  const S = { tab: 'landers', funnel: 'ALL', start: null, end: null, grouping: 'concept',
              rows: [], dates: [], sel: new Set(), sort: { key: 'spend', dir: -1 }, flaggedOnly: false, includePaused: false };

  const money = v => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');
  const int = v => v == null ? '—' : Math.round(v).toLocaleString('en-US');
  const r2 = v => v == null ? '—' : v.toFixed(2);
  const p1 = v => v == null ? '—' : v.toFixed(1) + '%';
  const goalRoas = () => (MobyAgg.getGoals().default || {}).roas || 1.5;
  const cls = (v, goodAbove, badBelow) => v == null ? 'dim' : v >= goodAbove ? 'good' : v < badBelow ? 'bad' : '';
  const clsRoas = v => cls(v, goalRoas(), goalRoas() * 0.66);

  async function boot() {
    await MobyData.init();
    const days = MobyData.state.meta.days || [];
    if (!days.length) { $('#content').innerHTML = '<div class="empty">No data. Run: node scripts/fetch.mjs backfill 28</div>'; return; }
    S.end = days[days.length - 1];
    S.start = days[Math.max(0, days.length - 14)];
    if (MobyData.state.demo) $('#demoBadge').style.display = 'inline';
    $('#refreshInfo').textContent = `data through ${S.end} · refreshed ${new Date(MobyData.state.meta.lastRefresh).toLocaleString()} · ${MobyData.state.meta.model}/${MobyData.state.meta.window}`;
    $('#dateStart').value = S.start; $('#dateEnd').value = S.end;
    $('#dateStart').min = days[0]; $('#dateEnd').max = days[days.length - 1];
    buildFunnelChips();
    wire();
    await reload();
  }

  function buildFunnelChips() {
    const funnels = new Set(['ALL']);
    // funnels present in data discovered after first load; seed from parser list
    MobyParser.FUNNELS.forEach(f => funnels.add(f));
    $('#funnels').innerHTML = [...funnels].map(f => `<button class="chip ${f === S.funnel ? 'on' : ''}" data-f="${f}">${f === 'ALL' ? 'All Funnels' : f}</button>`).join('');
    $('#funnels').onclick = e => { const f = e.target.dataset.f; if (!f) return; S.funnel = f; S.sel.clear(); buildFunnelChips(); render(); };
  }

  function wire() {
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => { S.tab = t.dataset.tab; S.sel.clear(); document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t)); render(); });
    $('#dateStart').onchange = e => { S.start = e.target.value; reload(); };
    $('#dateEnd').onchange = e => { S.end = e.target.value; reload(); };
    document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
      const days = MobyData.state.meta.days; const n = +b.dataset.preset;
      S.end = days[days.length - 1]; S.start = days[Math.max(0, days.length - n)];
      $('#dateStart').value = S.start; $('#dateEnd').value = S.end; reload();
    });
    $('#overlay').onclick = closeDrawer;
    $('#downloadBtn').onclick = downloadNote;
  }

  async function reload() {
    const files = await MobyData.loadRange(S.start, S.end);
    S.dates = files.map(f => f.date).sort();
    S.rows = MobyData.adDayRows(files);
    render();
  }

  const byFunnel = rows => S.funnel === 'ALL' ? rows : rows.filter(r => r.parsed.funnel === S.funnel);

  function render() {
    S.sortApplied = false;
    if (S.tab === 'landers') renderLanders();
    else if (S.tab === 'concepts') renderConcepts();
    else renderTesting();
  }

  /* ---------- shared helpers ---------- */
  function kpis(groups) {
    const t = { spend: 0, revenue: 0, orders: 0, ncOrders: 0, ncRevenue: 0, users: 0, impressions: 0, clicks: 0, vHook: 0, vTot: 0, outboundClicks: 0, newVisitors: 0, recurringVisitors: 0, retOrders: 0, retRevenue: 0, platformOrders: 0, platformRevenue: 0, vRet: 0 };
    for (const x of groups) for (const k of Object.keys(t)) t[k] += x[k] || 0;
    MobyAgg.derive(t);
    return `<div class="kpis">
      ${kpi('Spend', money(t.spend))}${kpi('Revenue', money(t.revenue))}${kpi('ROAS', r2(t.roas), clsRoas(t.roas))}
      ${kpi('Orders', int(t.orders))}${kpi('NC Orders', int(t.ncOrders))}${kpi('NC%', p1(t.ncPct))}
      ${kpi('NC-CPA', money(t.ncCpa))}${kpi('CVR', p1(t.cvr))}</div>`;
  }
  const kpi = (l, v, c = '') => `<div class="kpi"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`;

  function sortGroups(groups) {
    const { key, dir } = S.sort;
    return [...groups].sort((a, b) => ((a[key] ?? -Infinity) < (b[key] ?? -Infinity) ? 1 : -1) * -dir);
  }
  function th(label, key, left) { return `<th class="${left ? 'l' : ''}" data-sort="${key}">${label}${S.sort.key === key ? `<span class="arr"> ${S.sort.dir < 0 ? '▼' : '▲'}</span>` : ''}</th>`; }
  function wireSort(tableId, rerender) {
    document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(h => h.onclick = () => {
      const k = h.dataset.sort;
      S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : -1 };
      rerender();
    });
  }
  function hygiene(rows) {
    const unk = rows.filter(r => r.parsed.conformity !== 'canonical');
    const unkSpend = unk.reduce((s, r) => s + r.spend, 0);
    const totSpend = rows.reduce((s, r) => s + r.spend, 0) || 1;
    return `<div class="hygiene">naming hygiene: ${unk.length ? `${new Set(unk.map(r => r.adName)).size} non-canonical ads (${money(unkSpend)} · ${(unkSpend / totSpend * 100).toFixed(1)}% of spend) shown as (unknown)` : 'all ads canonical ✅'}</div>`;
  }

  /* ---------- TAB 1: Landing Pages ---------- */
  function landerGroups(rows) { return MobyAgg.groupBy(rows.filter(r => r.lander), r => landerKey(r.lander)); }
  function landerKey(l) { const seg = (l || '').split('/').filter(Boolean); return (seg[seg.length - 1] || 'home').toUpperCase(); }

  function renderLanders() {
    const rows = byFunnel(S.rows);
    const groups = landerGroups(rows);
    const selGroups = S.sel.size ? groups.filter(x => S.sel.has(x.key)) : groups;
    const chartRows = selGroups.flatMap(x => x.rows);
    $('#content').innerHTML = `
      ${kpis(groups)}
      <div class="chartbox"><h3>${S.sel.size ? [...S.sel].join(' + ') : 'All landers'} — daily spend / ROAS / NC-CPA</h3><div class="chartwrap"><canvas id="mainChart"></canvas></div></div>
      <div class="toolbar">${S.sel.size ? `<button class="btn" id="clearSel">Clear selection (${S.sel.size})</button>` : '<span class="dim">tick landers to graph a group · click a row to drill in</span>'}<span class="spacer"></span></div>
      <table id="mainTable"><thead><tr><th class="checkcell"></th>${th('Lander', 'key', 1)}${th('Spend', 'spend')}${th('Rev', 'revenue')}${th('ROAS', 'roas')}${th('Orders', 'orders')}${th('NC Ord', 'ncOrders')}${th('NC%', 'ncPct')}${th('NC-CPA', 'ncCpa')}${th('CVR', 'cvr')}${th('Users', 'users')}</tr></thead>
      <tbody>${sortGroups(groups).map(x => `
        <tr class="rowlink" data-k="${x.key}">
          <td class="checkcell"><input type="checkbox" data-sel="${x.key}" ${S.sel.has(x.key) ? 'checked' : ''}></td>
          <td class="l"><b>${x.key}</b><div class="sub">${x.rows[0].lander || ''}</div></td>
          <td>${money(x.spend)}</td><td>${money(x.revenue)}</td><td class="${clsRoas(x.roas)}">${r2(x.roas)}</td>
          <td>${int(x.orders)}</td><td>${int(x.ncOrders)}</td><td>${p1(x.ncPct)}</td><td>${money(x.ncCpa)}</td><td>${p1(x.cvr)}</td><td>${int(x.users)}</td>
        </tr>`).join('')}</tbody></table>
      ${hygiene(rows)}`;
    MobyCharts.trend('mainChart', MobyAgg.series(chartRows, S.dates));
    wireSort('mainTable', renderLanders);
    document.querySelectorAll('[data-sel]').forEach(c => c.onclick = e => { e.stopPropagation(); c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); renderLanders(); });
    const clear = $('#clearSel'); if (clear) clear.onclick = () => { S.sel.clear(); renderLanders(); };
    document.querySelectorAll('#mainTable tbody tr').forEach(tr => tr.onclick = () => openLanderDrawer(tr.dataset.k, groups));
  }

  function openLanderDrawer(key, groups) {
    const grp = groups.find(x => x.key === key); if (!grp) return;
    const ads = MobyAgg.groupBy(grp.rows, r => r.adName);
    openDrawer(`
      <h2>${key} <span class="dim">· ${S.start} → ${S.end} · ${S.funnel}</span></h2>
      <div class="sub">${grp.rows[0].lander || ''}</div>
      <div class="drawersec"><h3>Daily trend</h3><div class="chartwrap" style="height:200px"><canvas id="drawerChart"></canvas></div></div>
      <div class="drawersec"><h3>Ads driving this lander (${ads.length})</h3>
      <table><thead><tr><th class="l">Ad</th><th>Spend</th><th>ROAS</th><th>NC Ord</th><th>NC-CPA</th></tr></thead>
      <tbody>${sortGroups(ads).slice(0, 40).map((a, i) => `
        <tr class="rowlink" data-ad="${enc(a.key)}">
          <td class="l"><div class="namecell">${a.rows[0].thumb ? `<img class="thumb" src="${a.rows[0].thumb}" loading="lazy">` : ''}<div><div class="nm">${a.rows[0].parsed.adId || a.key.slice(0, 48)}</div><div class="sub">${a.rows[0].parsed.concept || ''} / ${a.rows[0].parsed.angle || ''} · ${a.rows[0].parsed.creator || ''}</div></div></div></td>
          <td>${money(a.spend)}</td><td class="${clsRoas(a.roas)}">${r2(a.roas)}</td><td>${int(a.ncOrders)}</td><td>${money(a.ncCpa)}</td>
        </tr>`).join('')}</tbody></table></div>`);
    MobyCharts.trend('drawerChart', MobyAgg.series(grp.rows, S.dates));
    document.querySelectorAll('#drawer [data-ad]').forEach(tr => tr.onclick = () => openAdDrawer(dec(tr.dataset.ad)));
  }

  /* ---------- TAB 2: Persona / Concept ---------- */
  const DIMS = { concept: 'Concept', angle: 'Angle', format: 'Format', creator: 'Creator', fanPage: 'Fan Page', mediaType: 'Media Type', hook: 'Script/Hook' };
  function renderConcepts() {
    const rows = byFunnel(S.rows);
    const groups = MobyAgg.groupBy(rows, r => r.parsed[S.grouping] || '(unknown)');
    const selGroups = S.sel.size ? groups.filter(x => S.sel.has(x.key)) : groups;
    $('#content').innerHTML = `
      ${kpis(groups)}
      <div class="chartbox"><h3>${S.sel.size ? [...S.sel].join(' + ') : 'All ' + DIMS[S.grouping] + 's'} — daily spend / ROAS / NC-CPA</h3><div class="chartwrap"><canvas id="mainChart"></canvas></div></div>
      <div class="toolbar">
        <label class="dim">Group by</label>
        <select id="dimSel">${Object.entries(DIMS).map(([k, v]) => `<option value="${k}" ${k === S.grouping ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${S.sel.size ? `<button class="btn" id="clearSel">Clear selection (${S.sel.size})</button>` : '<span class="dim">tick to graph a group · click a row for the ads inside</span>'}
        <span class="spacer"></span></div>
      <table id="mainTable"><thead><tr><th class="checkcell"></th>${th(DIMS[S.grouping], 'key', 1)}${th('Ads', 'nAds')}${th('Spend', 'spend')}${th('Rev', 'revenue')}${th('ROAS', 'roas')}${th('NC Ord', 'ncOrders')}${th('NC%', 'ncPct')}${th('NC-CPA', 'ncCpa')}${th('CTR', 'ctr')}${th('Hook', 'hookRate')}</tr></thead>
      <tbody>${sortGroups(groups.map(x => ({ ...x, nAds: new Set(x.rows.map(r => r.adName)).size }))).map(x => `
        <tr class="rowlink" data-k="${enc(x.key)}">
          <td class="checkcell"><input type="checkbox" data-sel="${enc(x.key)}" ${S.sel.has(x.key) ? 'checked' : ''}></td>
          <td class="l"><b>${x.key}</b></td><td>${x.nAds}</td>
          <td>${money(x.spend)}</td><td>${money(x.revenue)}</td><td class="${clsRoas(x.roas)}">${r2(x.roas)}</td>
          <td>${int(x.ncOrders)}</td><td>${p1(x.ncPct)}</td><td>${money(x.ncCpa)}</td><td>${p1(x.ctr)}</td><td>${p1(x.hookRate)}</td>
        </tr>`).join('')}</tbody></table>
      ${hygiene(rows)}`;
    MobyCharts.trend('mainChart', MobyAgg.series(selGroups.flatMap(x => x.rows), S.dates));
    $('#dimSel').onchange = e => { S.grouping = e.target.value; S.sel.clear(); renderConcepts(); };
    wireSort('mainTable', renderConcepts);
    document.querySelectorAll('[data-sel]').forEach(c => c.onclick = e => { e.stopPropagation(); const k = dec(c.dataset.sel); c.checked ? S.sel.add(k) : S.sel.delete(k); renderConcepts(); });
    const clear = $('#clearSel'); if (clear) clear.onclick = () => { S.sel.clear(); renderConcepts(); };
    document.querySelectorAll('#mainTable tbody tr').forEach(tr => tr.onclick = () => openGroupDrawer(dec(tr.dataset.k)));
  }

  function openGroupDrawer(key) {
    const rows = byFunnel(S.rows).filter(r => (r.parsed[S.grouping] || '(unknown)') === key);
    const ads = MobyAgg.groupBy(rows, r => r.adName);
    openDrawer(`
      <h2>${DIMS[S.grouping]}: ${key} <span class="dim">· ${S.funnel}</span></h2>
      <div class="drawersec"><h3>Daily trend</h3><div class="chartwrap" style="height:200px"><canvas id="drawerChart"></canvas></div></div>
      <div class="drawersec"><h3>Ads (${ads.length})</h3>
      <table><thead><tr><th class="l">Ad</th><th>Spend</th><th>ROAS</th><th>NC-CPA</th><th>Lander</th></tr></thead>
      <tbody>${sortGroups(ads).slice(0, 40).map(a => `
        <tr class="rowlink" data-ad="${enc(a.key)}">
          <td class="l"><div class="namecell">${a.rows[0].thumb ? `<img class="thumb" src="${a.rows[0].thumb}" loading="lazy">` : ''}<div><div class="nm">${a.rows[0].parsed.adId || a.key.slice(0, 48)}</div><div class="sub">${a.rows[0].parsed.angle || ''} · ${a.rows[0].parsed.creator || ''}</div></div></div></td>
          <td>${money(a.spend)}</td><td class="${clsRoas(a.roas)}">${r2(a.roas)}</td><td>${money(a.ncCpa)}</td><td class="dim">${a.rows[0].parsed.lander || '—'}</td>
        </tr>`).join('')}</tbody></table></div>`);
    MobyCharts.trend('drawerChart', MobyAgg.series(rows, S.dates));
    document.querySelectorAll('#drawer [data-ad]').forEach(tr => tr.onclick = () => openAdDrawer(dec(tr.dataset.ad)));
  }

  /* ---------- TAB 3: Testing Ads ---------- */
  function renderTesting() {
    const rows = byFunnel(S.rows);
    const goals = MobyAgg.getGoals();
    let kills = MobyAgg.killList(rows, S.dates, goals);
    if (!S.includePaused) kills = kills.filter(k => k.active);
    const shown = S.flaggedOnly ? kills.filter(k => k.flagged) : kills;
    const flaggedN = kills.filter(k => k.flagged).length;
    $('#content').innerHTML = `
      <div class="goals"><h3>Benchmarks (per funnel — blank = use default)</h3><div id="goalGrid" class="goalgrid">
        <span></span><span class="gh">Min spend $</span><span class="gh">Target ROAS</span><span class="gh">Target NC%</span>
        ${['default', ...MobyParser.FUNNELS.filter(f => f !== 'ALL')].map(f => {
          const gv = goals[f] || {};
          return `<span class="gh" style="text-transform:none">${f}</span>
            <input data-g="${f}.minSpend" value="${gv.minSpend ?? (f === 'default' ? 100 : '')}" placeholder="—">
            <input data-g="${f}.roas" value="${gv.roas ?? (f === 'default' ? 1.5 : '')}" placeholder="—">
            <input data-g="${f}.ncPct" value="${gv.ncPct ?? (f === 'default' ? 60 : '')}" placeholder="—">`;
        }).join('')}</div>
        <div style="margin-top:8px"><button class="btn primary" id="saveGoals">Save benchmarks</button></div></div>
      <div class="toolbar">
        <span><b class="${flaggedN ? 'bad' : 'good'}">${flaggedN}</b> flagged of ${kills.length} testing ads</span>
        <label><input type="checkbox" id="flagOnly" ${S.flaggedOnly ? 'checked' : ''}> flagged only</label>
        <label><input type="checkbox" id="incPaused" ${S.includePaused ? 'checked' : ''}> include paused</label>
        <span class="spacer"></span></div>
      <table id="mainTable"><thead><tr>${th('Ad', 'key', 1)}${th('Status', 'active')}${th('Spend', 'spend')}${th('ROAS', 'roas')}${th('NC%', 'ncPct')}${th('NC-CPA', 'ncCpa')}${th('Days under', 'daysUnder')}<th class="l">Verdict</th></tr></thead>
      <tbody>${shown.map(k => `
        <tr class="rowlink" data-ad="${enc(k.key)}">
          <td class="l"><div class="namecell">${k.rows[0].thumb ? `<img class="thumb" src="${k.rows[0].thumb}" loading="lazy">` : ''}<div><div class="nm">${k.parsed.adId || k.key.slice(0, 44)}</div><div class="sub">${k.parsed.funnel || '?'} · ${k.parsed.concept || '?'} / ${k.parsed.angle || '?'} · ${k.parsed.creator || ''}</div></div></div></td>
          <td>${k.active ? '<span class="tag ok">ACTIVE</span>' : '<span class="tag paused">PAUSED</span>'}</td>
          <td>${money(k.spend)}</td><td class="${cls(k.roas, k.goal.roas, k.goal.roas)}">${r2(k.roas)}</td>
          <td class="${k.ncBad ? 'bad' : ''}">${p1(k.ncPct)}</td><td>${money(k.ncCpa)}</td>
          <td class="${k.daysUnder >= 3 ? 'bad' : k.daysUnder >= 1 ? 'warn' : ''}">${k.daysUnder}d</td>
          <td class="l">${k.flagged ? `<span class="tag kill">KILL${k.daysUnder >= 3 ? ' 🔥' : ''}</span>${k.reasons.map(x => `<span class="tag">${x}</span>`).join('')}` : k.overSpend ? '<span class="tag ok">passing</span>' : '<span class="tag">under threshold</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="empty">No testing-campaign ads in range/filter.</td></tr>'}</tbody></table>
      <div class="hygiene">testing = ad currently parked in a campaign whose name contains "Testing" · days-under counts consecutive spending days with day-ROAS below target</div>`;
    $('#saveGoals').onclick = () => {
      const next = {};
      document.querySelectorAll('[data-g]').forEach(inp => {
        const [f, k] = inp.dataset.g.split('.');
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { next[f] = next[f] || {}; next[f][k] = v; }
      });
      MobyAgg.saveGoals(next); renderTesting();
    };
    $('#flagOnly').onchange = e => { S.flaggedOnly = e.target.checked; renderTesting(); };
    $('#incPaused').onchange = e => { S.includePaused = e.target.checked; renderTesting(); };
    wireSort('mainTable', renderTesting);
    document.querySelectorAll('#mainTable tbody tr[data-ad]').forEach(tr => tr.onclick = () => openAdDrawer(dec(tr.dataset.ad)));
  }

  /* ---------- Ad drawer (shared) ---------- */
  function openAdDrawer(adName) {
    const rows = S.rows.filter(r => r.adName === adName);
    if (!rows.length) return;
    const ad = MobyAgg.groupBy(rows, () => adName)[0];
    const p = rows[0].parsed;
    const places = (MobyData.state.placement.get(adName) || []);
    const cw = MobyData.state.campaigns;
    const landers = MobyAgg.groupBy(rows.filter(r => r.lander), r => landerKey(r.lander));
    openDrawer(`
      <h2>${p.adId || adName.slice(0, 60)}</h2>
      <div class="sub" style="margin-bottom:8px">${adName}</div>
      <div>${['funnel', 'concept', 'angle', 'hook', 'format', 'mediaType', 'strategist', 'editor', 'creator', 'lander', 'fanPage', 'launchDate'].filter(k => p[k]).map(k => `<span class="tag">${k}: ${p[k]}</span>`).join('')}</div>
      <div class="drawersec" style="display:flex;gap:16px;align-items:flex-start">
        ${rows[0].thumbBig ? `<img class="bigthumb" src="${rows[0].thumbBig}">` : ''}
        <div>
          <div class="kpi" style="margin-bottom:8px"><div class="l">Window totals</div><div class="v">${money(ad.spend)} · ROAS ${r2(ad.roas)}</div>
          <div class="d dim">${int(ad.orders)} orders · ${int(ad.ncOrders)} NC (${p1(ad.ncPct)}) · NC-CPA ${money(ad.ncCpa)} · Hook ${p1(ad.hookRate)}</div></div>
          ${rows[0].fb ? `<a href="${rows[0].fb}" target="_blank">FB post ↗</a> · ` : ''}${rows[0].ig ? `<a href="${rows[0].ig}" target="_blank">IG post ↗</a>` : ''}
        </div></div>
      <div class="drawersec"><h3>Daily trend</h3><div class="chartwrap" style="height:200px"><canvas id="drawerChart"></canvas></div></div>
      ${landers.length ? `<div class="drawersec"><h3>Landers this ad drives</h3>
        <table><thead><tr><th class="l">Lander</th><th>Spend</th><th>ROAS</th><th>NC Ord</th></tr></thead><tbody>
        ${landers.map(l => `<tr><td class="l">${l.key}</td><td>${money(l.spend)}</td><td>${r2(l.roas)}</td><td>${int(l.ncOrders)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="drawersec"><h3>Parked in (campaign → ad set) <span class="dim">· window ${cw.startDate || ''} → ${cw.endDate || ''}</span></h3>
      ${places.length ? places.map(pl => {
        const ca = MobyAgg.derive({ ...sum(pl.campaign) }); const aa = MobyAgg.derive({ ...sum(pl.adset) });
        return `<div style="margin-bottom:10px;padding:10px;background:var(--bg3);border-radius:8px">
          <div><b>${pl.campaign.name}</b> <span class="tag ${pl.campaign.status === 'ACTIVE' ? 'ok' : 'paused'}">${pl.campaign.status}</span>${pl.campaign.budget ? `<span class="tag">${pl.campaign.budgetType || ''} ${money(pl.campaign.budget)}</span>` : ''}</div>
          <div class="sub">campaign: ${money(ca.spend)} · ROAS ${r2(ca.roas)} · ${int(ca.ncOrders)} NC · NC-CPA ${money(ca.ncCpa)}</div>
          <div style="margin-top:6px">↳ ${pl.adset.name} <span class="tag ${pl.adset.status === 'ACTIVE' ? 'ok' : 'paused'}">${pl.adset.status}</span>${pl.adset.budget ? `<span class="tag">${money(pl.adset.budget)}</span>` : ''}</div>
          <div class="sub">ad set: ${money(aa.spend)} · ROAS ${r2(aa.roas)} · ${int(aa.ncOrders)} NC · NC-CPA ${money(aa.ncCpa)}</div>
          <div style="margin-top:4px"><span class="tag ${pl.ad.status === 'ACTIVE' ? 'ok' : 'paused'}">this ad: ${pl.ad.status}</span></div>
        </div>`;
      }).join('') : '<div class="dim">not found in campaign window (older ad or outside 28d campaign pull)</div>'}</div>`);
    MobyCharts.trend('drawerChart', MobyAgg.series(rows, S.dates));
    function sum(node) {
      const t = {}; const ads = node.adsets ? node.adsets.flatMap(a => a.ads) : node.ads || [];
      for (const k of MobyData.METRICS) t[k] = ads.reduce((s, a) => s + (a[k] || 0), 0);
      return t;
    }
  }

  function landerKey(l) { const seg = (l || '').split('/').filter(Boolean); return (seg[seg.length - 1] || 'home').toUpperCase(); }

  /* ---------- drawer + notes ---------- */
  function openDrawer(html) {
    $('#drawer').innerHTML = `<button class="close" onclick="document.getElementById('overlay').click()">✕ close</button>` + html;
    $('#overlay').style.display = 'block';
    $('#drawer').classList.add('open');
    $('#drawer').scrollTop = 0;
  }
  function closeDrawer() { $('#overlay').style.display = 'none'; $('#drawer').classList.remove('open'); MobyCharts.destroy('drawerChart'); }

  async function downloadNote() {
    const ctx = { start: S.start, end: S.end, funnel: S.funnel, window: MobyData.state.meta.window, demo: MobyData.state.demo };
    // previous period of equal length for deltas
    const days = MobyData.state.meta.days;
    const len = S.dates.length;
    const startIdx = days.indexOf(S.dates[0]);
    let prevRows = null;
    if (startIdx > 0) {
      const prevDays = days.slice(Math.max(0, startIdx - len), startIdx);
      if (prevDays.length) {
        const files = await MobyData.loadRange(prevDays[0], prevDays[prevDays.length - 1]);
        prevRows = MobyData.adDayRows(files);
      }
    }
    const rows = byFunnel(S.rows), pRows = prevRows ? byFunnel(prevRows) : null;
    let text, name;
    if (S.tab === 'landers') { text = MobyNotes.landerNote(landerGroups(rows), pRows && landerGroups(pRows), ctx); name = `lander-pulse_${S.start}_${S.end}.txt`; }
    else if (S.tab === 'concepts') { text = MobyNotes.conceptNote(MobyAgg.groupBy(rows, r => r.parsed[S.grouping] || '(unknown)'), pRows && MobyAgg.groupBy(pRows, r => r.parsed[S.grouping] || '(unknown)'), ctx, DIMS[S.grouping]); name = `${S.grouping}-pulse_${S.start}_${S.end}.txt`; }
    else { text = MobyNotes.killNote(MobyAgg.killList(rows, S.dates, MobyAgg.getGoals()), ctx); name = `kill-list_${S.start}_${S.end}.txt`; }
    MobyNotes.deliver(text, name);
    const b = $('#downloadBtn'); const old = b.textContent; b.textContent = '✓ copied + downloaded'; setTimeout(() => b.textContent = old, 1800);
  }

  const enc = s => encodeURIComponent(s); const dec = s => decodeURIComponent(s);
  boot();
})(globalThis);

/* Summary-note generator — clean bulletpoint pulse notes (old-dashboard style).
   Output is plain text: download + clipboard now, Slack-ready for phase 2. */
(function (g) {
  const money = v => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');
  const r2 = v => v == null ? '—' : v.toFixed(2);
  const p0 = v => v == null ? '—' : v.toFixed(0) + '%';

  function header(title, ctx) {
    const f = ctx.funnel === 'ALL' ? 'All funnels' : ctx.funnel;
    return `${title} · ${ctx.start} → ${ctx.end} · ${f} · Moby attribution (${ctx.window || '7d click'})${ctx.demo ? ' · DEMO DATA' : ''}\n${'='.repeat(64)}`;
  }

  function landerNote(groups, prevGroups, ctx) {
    const lines = [header('ALPHA LION — LANDER PULSE', ctx)];
    const prev = new Map((prevGroups || []).map(x => [x.key, x]));
    const sorted = [...groups].sort((a, b) => b.spend - a.spend);
    const tot = totals(groups);
    lines.push(`\nTOTAL: ${money(tot.spend)} spend · ${money(tot.revenue)} rev · ${r2(tot.roas)} ROAS · ${Math.round(tot.ncOrders)} NC orders · NC-CPA ${money(tot.ncCpa)} · NC% ${p0(tot.ncPct)}\n`);
    lines.push('BY LANDER (spend desc):');
    for (const x of sorted.slice(0, 12)) {
      const pv = prev.get(x.key);
      const delta = pv && pv.roas != null && x.roas != null ? ` (ROAS ${x.roas >= pv.roas ? '▲' : '▼'} ${r2(x.roas - pv.roas)} vs prior)` : '';
      lines.push(`• ${x.key} — ${money(x.spend)} · ROAS ${r2(x.roas)} · ${Math.round(x.ncOrders)} NC orders · NC-CPA ${money(x.ncCpa)} · CVR ${x.cvr == null ? '—' : x.cvr.toFixed(1) + '%'}${delta}`);
    }
    flagBlock(lines, sorted, ctx);
    return lines.join('\n');
  }

  function conceptNote(groups, prevGroups, ctx, dim) {
    const lines = [header(`ALPHA LION — ${dim.toUpperCase()} PULSE`, ctx)];
    const prev = new Map((prevGroups || []).map(x => [x.key, x]));
    const sorted = [...groups].sort((a, b) => b.spend - a.spend);
    lines.push(`\nBY ${dim.toUpperCase()} (spend desc):`);
    for (const x of sorted.slice(0, 15)) {
      const pv = prev.get(x.key);
      const delta = pv && pv.roas != null && x.roas != null ? ` (${x.roas >= pv.roas ? '▲' : '▼'}${r2(Math.abs(x.roas - pv.roas))})` : '';
      lines.push(`• ${x.key} — ${money(x.spend)} · ROAS ${r2(x.roas)}${delta} · NC-CPA ${money(x.ncCpa)} · ${x.rows.length} ad-days`);
    }
    const best = sorted.filter(x => x.spend > 200).sort((a, b) => (b.roas || 0) - (a.roas || 0));
    if (best.length) {
      lines.push(`\nTRENDING UP: ${best.slice(0, 3).map(x => `${x.key} (${r2(x.roas)})`).join(' · ')}`);
      lines.push(`WEAKEST: ${best.slice(-3).reverse().map(x => `${x.key} (${r2(x.roas)})`).join(' · ')}`);
    }
    return lines.join('\n');
  }

  function killNote(kills, ctx) {
    const lines = [header('ALPHA LION — TESTING ADS KILL LIST', ctx)];
    const flagged = kills.filter(k => k.flagged && k.active);
    lines.push(`\n${flagged.length} ACTIVE ads over spend threshold & under benchmark:`);
    for (const k of flagged) {
      lines.push(`• ${k.parsed.adId || k.key.slice(0, 60)} [${k.parsed.funnel || '?'} · ${k.parsed.concept || '?'} / ${k.parsed.angle || '?'}]`);
      lines.push(`   ${money(k.spend)} spend · ${k.reasons.join(' · ')} · ${k.daysUnder} day(s) under benchmark${k.daysUnder >= 3 ? '  ⚠️ KILL CANDIDATE' : ''}`);
    }
    if (!flagged.length) lines.push('• none — testing set is clean ✅');
    return lines.join('\n');
  }

  function flagBlock(lines, sorted, ctx) {
    const flags = sorted.filter(x => x.spend > 500 && x.roas != null && x.roas < 1.2);
    if (flags.length) {
      lines.push('\nFLAGS:');
      for (const f of flags) lines.push(`• ${f.key} — ROAS ${r2(f.roas)} on ${money(f.spend)} spend — review spend allocation`);
    }
  }

  function totals(groups) {
    const t = { spend: 0, revenue: 0, orders: 0, ncOrders: 0, ncRevenue: 0, users: 0 };
    for (const x of groups) for (const k of Object.keys(t)) t[k] += x[k] || 0;
    return g.MobyAgg.derive({ ...t, impressions: 0, clicks: 0, vHook: 0, vTot: 0 });
  }

  function deliver(text, filename) {
    navigator.clipboard?.writeText(text).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename;
    a.click();
  }

  g.MobyNotes = { landerNote, conceptNote, killNote, deliver };
})(globalThis);

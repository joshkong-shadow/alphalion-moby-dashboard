/* Alpha Lion ad/campaign name parser — taxonomy per Moby backend config (see memory: reference-alphalion-ad-naming)
   Canonical ad name (12 segments):
   Funnel | Concept | Angle | Script/Hook | Format | Ad ID | Strategist | Editor | Creator | Lander | Fan Page | Launch Date [+ extra tags ignored]
   Plain script: attaches MobyParser to globalThis (works in browser <script> and Node require/import). */
(function (g) {
  const FUNNELS = ['B2O', 'SHB', 'SFL', 'TAS', 'SHT', 'PRE', 'DEL', 'ALL'];
  const DATE_RE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/;          // 02.09.26 or 05.21
  const ADID_RE = /^[a-z0-9]+[.-]?[a-z0-9]*-?(vv|img)\d+/i;          // b2o-vv108.v60, sht-img113.v3, b2o.ach-vv4.v1
  const LANDER_RE = /^[A-Z0-9]+-(LP|LIST|COL)[0-9]*/i;               // B2O-LP01, TAS-LIST10, SFL-COL, B2O-LP03BigRon

  function parseDate(s) {
    const m = DATE_RE.exec((s || '').trim());
    if (!m) return null;
    const [, d, mo] = m; let y = m[3] || '26';
    if (y.length === 4) y = y.slice(2);
    const iso = `20${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isNaN(Date.parse(iso)) ? null : iso;
  }

  function mediaTypeFromAdId(adId) {
    if (/-?vv\d/i.test(adId || '')) return 'video';
    if (/-?img\d/i.test(adId || '')) return 'image';
    return null;
  }

  function normFanPage(s) {
    const t = (s || '').trim();
    if (!t) return null;
    if (/^fp[-_ ]?/i.test(t)) return 'FP-' + t.replace(/^fp[-_ ]?/i, '');
    return 'FP-' + t; // alias tolerance: "WLW" -> "FP-WLW"
  }

  function parseAdName(name) {
    const raw = name || '';
    const seg = raw.split('|').map(s => s.trim());
    const out = {
      raw, funnel: null, concept: null, angle: null, hook: null, format: null,
      adId: null, mediaType: null, strategist: null, editor: null, creator: null,
      lander: null, fanPage: null, launchDate: null, extras: [], conformity: 'unknown',
    };
    // Trybe auto-generated placeholder names
    if (/\bTrybe\b/.test(raw) && /\bAd ID\b/.test(raw)) {
      out.conformity = 'trybe';
      const tail = seg[seg.length - 1] || '';
      const tm = /^([A-Za-z]+)_.*?_(\d{8})_/.exec(tail);
      if (tm) {
        out.creator = tm[1];
        out.launchDate = `${tm[2].slice(0, 4)}-${tm[2].slice(4, 6)}-${tm[2].slice(6, 8)}`;
      }
      out.format = 'UGC';
      out.funnel = FUNNELS.includes(seg[0]?.toUpperCase()) ? seg[0].toUpperCase() : null;
      return out;
    }
    const funnelOk = FUNNELS.includes((seg[0] || '').toUpperCase());
    // canonical 12+: lander at index 9, fan page at 10, date at 11, extras beyond
    if (seg.length >= 12 && funnelOk && LANDER_RE.test(seg[9]) ) {
      assign(out, seg, true);
      out.launchDate = parseDate(seg[11]);
      out.extras = seg.slice(12);
      out.conformity = 'canonical';
      return out;
    }
    // 11 segments: either no date (seg10 = fan page) or no fan page (seg10 = date)
    if (seg.length === 11 && funnelOk && LANDER_RE.test(seg[9])) {
      assign(out, seg, false);
      if (DATE_RE.test(seg[10])) { out.launchDate = parseDate(seg[10]); }
      else { out.fanPage = normFanPage(seg[10]); }
      out.conformity = 'canonical';
      return out;
    }
    out.funnel = funnelOk ? seg[0].toUpperCase() : null;
    return out; // unknown
  }

  function assign(out, seg, withFanPage) {
    out.funnel = seg[0].toUpperCase();
    out.concept = seg[1] || null;
    out.angle = seg[2] || null;
    out.hook = seg[3] || null;
    out.format = seg[4] || null;
    out.adId = seg[5] || null;
    out.mediaType = mediaTypeFromAdId(seg[5]);
    out.strategist = seg[6] || 'n/a';
    out.editor = seg[7] || 'n/a';
    out.creator = seg[8] || 'n/a';
    out.lander = (seg[9] || '').toUpperCase();
    if (withFanPage) out.fanPage = normFanPage(seg[10]);
    // some names put Format and Ad ID swapped or ID-less (NER static batches): tolerate ID-less
    if (out.adId && !ADID_RE.test(out.adId) && !/_/.test(out.adId)) { /* keep as-is, still displayed */ }
  }

  function parseCampaignName(name) {
    const raw = name || '';
    const seg = raw.split('|').map(s => s.trim());
    const funnel = (seg[0] || '').toUpperCase();
    return {
      raw,
      funnel: FUNNELS.includes(funnel) ? funnel : null,
      geo: seg[1] || null,
      structure: seg[2] || null,
      isTesting: /testing/i.test(raw),
      stage: (seg.find(s => /testing|scaling|reach|cc|bofu/i.test(s)) || null),
    };
  }

  g.MobyParser = { parseAdName, parseCampaignName, FUNNELS };
})(globalThis);

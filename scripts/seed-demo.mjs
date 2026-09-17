#!/usr/bin/env node
/* Deterministic demo dataset so the dashboard renders with no credentials (clearly labelled DEMO). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data-demo');
mkdirSync(join(OUT, 'days'), { recursive: true });

let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

const SPECS = [];
const DEFS = {
  B2O: { concepts: [['Fat Loss', ['Thermogenesis', 'Carnitine', 'Body Transformation']], ['Sweats', ['Female Sweat Benefits', 'Best Sweats']]], landers: ['B2O-LP01', 'B2O-LIST10'], fp: ['FP-AL', 'FP-BigRon'] },
  SHT: { concepts: [['Body Transformation', ['Testo Signals', 'Masculinity Reclaim']], ['Metabolism', ['Energy Levels']]], landers: ['SHT-LP01', 'SHT-LIST10'], fp: ['FP-AL'] },
  DEL: { concepts: [['Unisex Electrolytes', ['Daily Hydration', 'Fail Men Over 30']]], landers: ['DEL-LP01'], fp: ['FP-AL'] },
};
const FORMATS = ['UGC', 'Product Image', 'Thumbstopper', 'Green Screen'];
const CREATORS = ['Troy', 'BigRon', 'Jazzy', 'Stock', 'n/a'];
const EDITORS = ['Nacho', 'Alexis', 'Kevin'];
let adN = 0;
for (const [funnel, def] of Object.entries(DEFS)) {
  for (const [concept, angles] of def.concepts) {
    for (const angle of angles) {
      for (let v = 0; v < 3; v++) {
        adN++;
        const media = rnd() > 0.4 ? 'vv' : 'img';
        const lander = def.landers[Math.floor(rnd() * def.landers.length)];
        const quality = rnd(); // 0..1 — drives performance so some ads are clear kills
        SPECS.push({
          funnel, concept, angle, lander,
          name: `${funnel} | ${concept} | ${angle} | Demo Hook ${adN} | ${FORMATS[Math.floor(rnd() * 4)]} | ${funnel.toLowerCase()}-${media}${adN}.v${v + 1} | Dave | ${EDITORS[Math.floor(rnd() * 3)]} | ${CREATORS[Math.floor(rnd() * 5)]} | ${lander} | ${def.fp[Math.floor(rnd() * def.fp.length)]} | 20.08.26`,
          quality, testing: rnd() > 0.45, baseSpend: 40 + rnd() * 260,
        });
      }
    }
  }
}
const days = [];
const end = new Date('2026-09-15');
for (let i = 27; i >= 0; i--) days.push(new Date(end.getTime() - i * 86400_000).toISOString().slice(0, 10));

const M0 = { retOrders: 0, retRevenue: 0, newVisitors: 0, recurringVisitors: 0, outboundClicks: 0, vRet: 0 };
for (const d of days) {
  const creatives = SPECS.filter(() => rnd() > 0.15).map(s => {
    const spend = s.baseSpend * (0.6 + rnd() * 0.8);
    const roas = Math.max(0, (s.quality * 2.6 + rnd() * 0.8 - 0.3));
    const revenue = spend * roas;
    const aov = 65;
    const orders = Math.round(revenue / aov);
    const ncOrders = Math.round(orders * (0.55 + s.quality * 0.3));
    const users = Math.round(spend / (1.1 + rnd()));
    const imp = Math.round(spend * (90 + rnd() * 60));
    const vTot = s.name.includes('-vv') ? Math.round(imp * 0.6) : 0;
    const m = { spend: +spend.toFixed(2), revenue: +revenue.toFixed(2), orders, ncOrders, ncRevenue: +(revenue * ncOrders / Math.max(1, orders)).toFixed(2), platformOrders: Math.round(orders * 0.7), platformRevenue: +(revenue * 0.7).toFixed(2), users, impressions: imp, clicks: Math.round(imp * 0.015), vHook: Math.round(vTot * (0.2 + s.quality * 0.2)), vTot, ...M0 };
    return { name: s.name, ...m, thumb: null, thumbBig: null, fb: null, ig: null, landers: [{ adName: s.name, lander: `https://try.alphalion.com/offers/${s.lander.toLowerCase()}`, ...m }] };
  });
  writeFileSync(join(OUT, 'days', `${d}.json`), JSON.stringify({ date: d, model: 'moby', window: '7_day_click', creatives }));
}
/* campaigns: split testing vs scaling */
const camps = [];
for (const funnel of Object.keys(DEFS)) {
  for (const stage of ['Testing', 'Scaling']) {
    const ads = SPECS.filter(s => s.funnel === funnel && (stage === 'Testing') === s.testing).map((s, i) => ({
      id: `${funnel}-${stage}-${i}`, name: s.name, status: s.quality < 0.15 ? 'PAUSED' : 'ACTIVE', createdTime: '2026-08-20T00:00:00Z',
      thumb: null, thumbBig: null, fb: null, ig: null,
      spend: +(s.baseSpend * 20).toFixed(0), revenue: +(s.baseSpend * 20 * s.quality * 2.2).toFixed(0),
      orders: Math.round(s.baseSpend * 20 * s.quality * 2.2 / 65), ncOrders: Math.round(s.baseSpend * 20 * s.quality * 2.2 / 65 * 0.6), ncRevenue: 0,
      platformOrders: 0, platformRevenue: 0, users: 1000, impressions: 50000, clicks: 700, vHook: 0, vTot: 0, ...M0,
    }));
    camps.push({ id: `${funnel}-${stage}`, name: `${funnel} | US | CBO | Auto | ${stage} W37 | 08.09.26`, status: 'ACTIVE', budget: 1000, budgetType: 'daily', bidStrategy: 'Lowest cost', adsets: [{ id: `${funnel}-${stage}-as1`, name: `${funnel} | US | Broad | Auto`, status: 'ACTIVE', budget: null, budgetType: null, ads }] });
  }
}
writeFileSync(join(OUT, 'campaigns.json'), JSON.stringify({ fetchedAt: new Date('2026-09-16T08:00:00Z').toISOString(), startDate: days[0], endDate: days[27], model: 'moby', window: '7_day_click', campaigns: camps }));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ lastRefresh: new Date('2026-09-16T08:00:00Z').toISOString(), model: 'moby', window: '7_day_click', channel: 'meta', days, demo: true }));
console.log(`demo: ${SPECS.length} ads × ${days.length} days, ${camps.length} campaigns`);

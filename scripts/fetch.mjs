#!/usr/bin/env node
/* Moby MCP fetcher — writes JSON snapshots to data/ (gitignored; contains revenue data — NEVER commit).
   Usage:
     node scripts/fetch.mjs daily          # refresh trailing 8 days + campaign window (default)
     node scripts/fetch.mjs backfill 28    # backfill N days of per-day creative data
   Key: ~/.config/moby/key or MOBY_MCP_KEY env var. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const ENDPOINT = 'https://api.mobybots.com/v2/mcp';
const MODEL = 'moby', WINDOW = '7_day_click', CHANNEL = 'meta';
const TRAILING_REFRESH = 8; // 7_day_click attribution keeps updating trailing days

function key() {
  if (process.env.MOBY_MCP_KEY) return process.env.MOBY_MCP_KEY.trim();
  const f = join(homedir(), '.config', 'moby', 'key');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  console.error('No Moby key: set MOBY_MCP_KEY or create ~/.config/moby/key'); process.exit(1);
}
const KEY = key();
let rpcId = 1;

async function callTool(name, args, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120_000);
      const res = await fetch(ENDPOINT, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } }),
      });
      clearTimeout(t);
      const text = await res.text();
      const m = text.match(/data: (.*)/);
      if (!m) throw new Error(`no data frame (status ${res.status}): ${text.slice(0, 120)}`);
      const parsed = JSON.parse(m[1]);
      if (parsed.error) throw new Error(`rpc error: ${JSON.stringify(parsed.error).slice(0, 200)}`);
      return parsed.result.structuredContent.result;
    } catch (e) {
      console.error(`  attempt ${i}/${tries} failed for ${name}: ${e.message}`);
      if (i === tries) throw e;
      await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
}

const n = v => v == null ? 0 : v;
function normMetrics(x) {
  return {
    spend: n(x.spend), revenue: n(x.revenue), orders: n(x.orders),
    ncOrders: n(x.newCustomerOrders ?? x.acquisitionOrders),
    ncRevenue: n(x.newCustomerRevenue ?? x.acquisitionRevenue),
    retOrders: n(x.retentionOrders ?? x.retentionOrder),
    retRevenue: n(x.retentionRevenue),
    platformOrders: n(x.platformOrders), platformRevenue: n(x.platformRevenue),
    users: n(x.users), newVisitors: n(x.newVisitorCount), recurringVisitors: n(x.recurringVisitorCount),
    impressions: n(x.impressions), clicks: n(x.clicks), outboundClicks: n(x.outboundClicks),
    vHook: n(x.videoHookViews), vRet: n(x.videoRetentionViews), vTot: n(x.videoTotalViews),
  };
}

async function fetchDay(date) {
  const res = await callTool('get_creative_performance', {
    channel: CHANNEL, startDate: date, endDate: date,
    attributionModel: MODEL, attributionWindow: WINDOW, limit: 5000,
  });
  const creatives = res
    .map(c => ({
      name: c.name, ...normMetrics(c),
      thumb: c.smallThumbnailUrl || null, thumbBig: c.bigThumbnailUrl || null,
      fb: (c.facebookPostUrls || [])[0] || null, ig: (c.instagramPostUrls || [])[0] || null,
      landers: (c.landers || []).map(l => ({ adName: l.adName, lander: l.lander, ...normMetrics(l) })),
    }))
    .filter(c => c.spend > 0 || c.impressions > 0 || c.users > 0);
  mkdirSync(join(DATA, 'days'), { recursive: true });
  writeFileSync(join(DATA, 'days', `${date}.json`), JSON.stringify({ date, model: MODEL, window: WINDOW, creatives }));
  console.log(`  ${date}: ${creatives.length} active creatives`);
}

async function fetchCampaigns(startDate, endDate) {
  // weekly chunks to dodge the 29s gateway timeout; sum ad metrics, latest chunk wins on status/budget
  const chunks = [];
  let s = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (s <= end) {
    const e = new Date(Math.min(s.getTime() + 6 * 86400_000, end.getTime()));
    chunks.push([s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]);
    s = new Date(e.getTime() + 86400_000);
  }
  const camps = new Map();
  for (const [cs, ce] of chunks) {
    console.log(`  campaigns ${cs}..${ce}`);
    const res = await callTool('get_channel_campaign_performance', {
      channel: CHANNEL, startDate: cs, endDate: ce, attributionModel: MODEL, attributionWindow: WINDOW,
    });
    for (const c of res) {
      const prev = camps.get(c.id) || { id: c.id, name: c.name, adsets: new Map() };
      prev.status = c.status; prev.budget = c.budget; prev.budgetType = c.budgetType; prev.bidStrategy = c.bidStrategy;
      for (const a of c.adsets || []) {
        const pa = prev.adsets.get(a.id) || { id: a.id, name: a.name, ads: new Map() };
        pa.status = a.status; pa.budget = a.budget; pa.budgetType = a.budgetType;
        for (const ad of a.ads || []) {
          const norm = normMetrics(ad);
          const pd = pa.ads.get(ad.id);
          if (pd) { for (const k of Object.keys(norm)) if (typeof norm[k] === 'number') pd[k] += norm[k]; pd.status = ad.status; }
          else pa.ads.set(ad.id, { id: ad.id, name: ad.name, status: ad.status, createdTime: ad.createdTime, thumb: ad.smallThumbnailUrl, thumbBig: ad.bigThumbnailUrl, fb: ad.facebookPostUrl, ig: ad.instagramPostUrl, ...norm });
        }
        prev.adsets.set(a.id, pa);
      }
      camps.set(c.id, prev);
    }
  }
  const campaigns = [...camps.values()].map(c => ({ ...c, adsets: [...c.adsets.values()].map(a => ({ ...a, ads: [...a.ads.values()] })) }));
  writeFileSync(join(DATA, 'campaigns.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), startDate, endDate, model: MODEL, window: WINDOW, campaigns }));
  console.log(`  campaigns.json: ${campaigns.length} campaigns`);
}

function dstr(d) { return d.toISOString().slice(0, 10); }
function writeMeta() {
  const days = existsSync(join(DATA, 'days'))
    ? readdirSync(join(DATA, 'days')).filter(f => f.endsWith('.json')).map(f => f.slice(0, 10)).sort()
    : [];
  writeFileSync(join(DATA, 'meta.json'), JSON.stringify({ lastRefresh: new Date().toISOString(), model: MODEL, window: WINDOW, channel: CHANNEL, days }));
}

const mode = process.argv[2] || 'daily';
const today = new Date(); // tenant is America/Los_Angeles; data for "today" is partial — treat yesterday as last complete day
const yesterday = new Date(today.getTime() - 86400_000);

if (mode === 'backfill') {
  const nDays = parseInt(process.argv[3] || '28', 10);
  console.log(`Backfilling ${nDays} days of creative data…`);
  for (let i = nDays; i >= 1; i--) {
    const d = dstr(new Date(yesterday.getTime() - (i - 1) * 86400_000));
    if (existsSync(join(DATA, 'days', `${d}.json`))) { console.log(`  ${d}: exists, skip`); continue; }
    await fetchDay(d);
  }
  await fetchCampaigns(dstr(new Date(yesterday.getTime() - 27 * 86400_000)), dstr(yesterday));
} else {
  console.log(`Daily refresh: trailing ${TRAILING_REFRESH} days + campaign window…`);
  for (let i = TRAILING_REFRESH; i >= 1; i--) await fetchDay(dstr(new Date(yesterday.getTime() - (i - 1) * 86400_000)));
  await fetchCampaigns(dstr(new Date(yesterday.getTime() - 27 * 86400_000)), dstr(yesterday));
}
writeMeta();
console.log('Done.');

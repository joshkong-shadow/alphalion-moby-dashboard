#!/usr/bin/env node
/* Compact + gzip + AES-256-GCM encrypt data/ snapshots into enc/ (safe to commit & serve publicly).
   Passphrase: DASH_PASSPHRASE env var or ~/.config/moby/dashboard-passphrase.
   Key derivation: PBKDF2-SHA256, 300k iterations, random salt persisted in enc/salt.json (clear). */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { webcrypto as wc, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data'), ENC = join(ROOT, 'enc');

function passphrase() {
  if (process.env.DASH_PASSPHRASE) return process.env.DASH_PASSPHRASE.trim();
  const f = join(homedir(), '.config', 'moby', 'dashboard-passphrase');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  console.error('No passphrase: set DASH_PASSPHRASE or create ~/.config/moby/dashboard-passphrase'); process.exit(1);
}

mkdirSync(join(ENC, 'days'), { recursive: true });
let salt;
const saltFile = join(ENC, 'salt.json');
if (existsSync(saltFile)) salt = Buffer.from(JSON.parse(readFileSync(saltFile, 'utf8')).salt, 'base64');
else { salt = randomBytes(16); writeFileSync(saltFile, JSON.stringify({ salt: salt.toString('base64'), kdf: 'PBKDF2-SHA256', iter: 300000 })); }

const key = await wc.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 300000, hash: 'SHA-256' },
  await wc.subtle.importKey('raw', new TextEncoder().encode(passphrase()), 'PBKDF2', false, ['deriveKey']),
  { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

async function encryptTo(obj, outPath) {
  const plain = gzipSync(JSON.stringify(obj));
  const iv = randomBytes(12);
  const cipher = Buffer.from(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  writeFileSync(outPath, Buffer.concat([iv, cipher]));
  return cipher.length;
}

const r1 = v => v == null ? 0 : Math.round(v * 100) / 100;
function compactDay(df) {
  return { date: df.date, model: df.model, window: df.window,
    creatives: (df.creatives || []).filter(c => c.spend > 0 || c.impressions > 0 || c.users > 0).map(c => ({
      name: c.name, spend: r1(c.spend), revenue: r1(c.revenue), orders: r1(c.orders), ncOrders: r1(c.ncOrders), ncRevenue: r1(c.ncRevenue),
      platformOrders: r1(c.platformOrders), platformRevenue: r1(c.platformRevenue), users: c.users, newVisitors: c.newVisitors, recurringVisitors: c.recurringVisitors,
      impressions: c.impressions, clicks: c.clicks, outboundClicks: c.outboundClicks, vHook: c.vHook, vRet: c.vRet, vTot: c.vTot,
      thumb: c.thumb, thumbBig: c.thumbBig, fb: c.fb, ig: c.ig,
      landers: (c.landers || []).filter(l => l.spend > 0 || l.users > 0 || l.orders > 0).map(l => ({
        adName: l.adName, lander: l.lander, spend: r1(l.spend), revenue: r1(l.revenue), orders: r1(l.orders), ncOrders: r1(l.ncOrders), ncRevenue: r1(l.ncRevenue),
        users: l.users, impressions: l.impressions, clicks: l.clicks, outboundClicks: l.outboundClicks, vHook: l.vHook, vTot: l.vTot,
      })),
    })) };
}
function compactCampaigns(cw) {
  return { ...cw, campaigns: (cw.campaigns || []).map(c => ({ ...c, adsets: (c.adsets || []).map(a => ({ ...a, ads: (a.ads || []).map(ad => {
    const o = {}; for (const [k, v] of Object.entries(ad)) if (v != null) o[k] = typeof v === 'number' ? r1(v) : v; return o;
  }) })) })) };
}

let total = 0, n = 0;
for (const f of existsSync(join(DATA, 'days')) ? readdirSync(join(DATA, 'days')).filter(x => x.endsWith('.json')) : []) {
  const df = JSON.parse(readFileSync(join(DATA, 'days', f), 'utf8'));
  total += await encryptTo(compactDay(df), join(ENC, 'days', f.replace('.json', '.bin'))); n++;
}
if (existsSync(join(DATA, 'campaigns.json')))
  total += await encryptTo(compactCampaigns(JSON.parse(readFileSync(join(DATA, 'campaigns.json'), 'utf8'))), join(ENC, 'campaigns.bin'));

// meta: union of every day blob present in enc/ (Action refreshes only trailing days; older blobs persist)
const days = readdirSync(join(ENC, 'days')).filter(f => f.endsWith('.bin')).map(f => f.slice(0, 10)).sort();
const meta = existsSync(join(DATA, 'meta.json')) ? JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8')) : {};
await encryptTo({ ...meta, days, lastRefresh: new Date().toISOString() }, join(ENC, 'meta.bin'));
console.log(`enc/: ${n} day blobs refreshed, ${days.length} total days, ~${(total / 1e6).toFixed(1)}MB ciphertext`);

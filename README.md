# Alpha Lion · Moby Growth Dashboard

Daily-feedback dashboard for Alpha Lion Meta ads, powered by **MobyBots attribution** (Moby MCP).
Three lenses: **Landing Pages** · **Persona / Concept** · **Testing Ads (kill list)**.

## Architecture (house pattern, encrypted-Pages variant)

```
Moby MCP (api.mobybots.com/v2/mcp)
        │  scripts/fetch.mjs — GitHub Action daily 09:00 UTC (secrets: MOBY_MCP_KEY)
        ▼
data/   (plain JSON — GITIGNORED, exists only inside the Action run / on Josh's Mac)
        │  scripts/publish.mjs — compact → gzip → AES-256-GCM (secret: DASH_PASSPHRASE)
        ▼
enc/    (ciphertext blobs — COMMITTED; unreadable without the password)
        ▼
GitHub Pages → password screen → WebCrypto decrypt in the viewer's browser
```

**Why encrypted-at-rest:** GitHub Pages is always publicly reachable and a static site cannot
enforce a login — so the password IS the decryption key (PBKDF2-SHA256 300k → AES-256-GCM).
Wrong password = GCM auth failure = no data. Revenue numbers never exist in plaintext in the
repo or on the wire. Thumbnails hot-load from Moby's public S3 (no auth needed).
Moby's endpoint has no CORS, hence Action-side fetching; `js/data.js` is an adapter — local
plain `data/` (dev) → hosted `enc/` (password) → `data-demo/` (no credentials).

**Password:** stored at `~/.config/moby/dashboard-passphrase` on Josh's Mac + GitHub secret
`DASH_PASSPHRASE`. Browser caches it in localStorage (`almoby_pass`) after first unlock.
To rotate: change both, delete `enc/salt.json`, run `npm run publish`, push.

## Daily use

Hosted: open the GitHub Pages URL, enter the password once per device. Data refreshes
itself daily via the Action (manual trigger: Actions tab → refresh-data → Run workflow).

Local dev:
```
npm run refresh   # pull trailing 8 days + campaign window from Moby (~2-4 min)
npm run publish   # rebuild encrypted blobs from data/
npm run serve     # dashboard on http://localhost:8811 (uses plain data/ directly)
```

The trailing 8 days are re-pulled every refresh because the 7-day click window keeps
maturing — yesterday's ROAS will keep rising for a week. Interpret recent days accordingly.

- **API key:** `~/.config/moby/key` (chmod 600, outside the repo). Rotate in Moby → Settings → MCP.
- **First setup on a new machine:** `npm run backfill` (28 days, ~5-10 min).
- **No key / demo:** `npm run seed` then serve — renders with labelled DEMO data.

## The three tabs

1. **Landing Pages** — lander rollups (funnel toggle, date range), multi-select graphing,
   drill: lander → ads → ad → campaign/adset placement. Summary-note download (Slack-ready text).
2. **Persona / Concept** — same pattern grouped by Concept / Angle / Format / Creator /
   Fan Page / Media Type / Hook (from the ad-name taxonomy).
3. **Testing Ads** — every ad parked in a campaign whose name contains "Testing".
   Per-funnel benchmarks (min spend / target ROAS / target NC%) are editable and stored in
   localStorage (`almoby_goals`). Flags = over min-spend AND under a benchmark. "Days under"
   counts consecutive spending days with day-ROAS below target. Paused ads excluded by default.

## Conventions & gotchas

- Ad names parse per the 12-segment taxonomy (see `js/parser.js` tests: `npm test`).
  Non-parseable ads land in a visible "(unknown)" bucket — never silently dropped.
- Moby attributes fractionally (orders come back as floats) and much more conservatively
  than platform-reported numbers (~0.6 blended meta ROAS vs 0.68 platform in Sep 2026).
  Set benchmarks against Moby's own scale, not Northbeam/platform habits.
- Moby's gateway times out at ~29s on cold heavy queries; the fetcher chunks + retries.
- `get_creative_performance` truncates at the requested limit — fetcher asks for 5000.

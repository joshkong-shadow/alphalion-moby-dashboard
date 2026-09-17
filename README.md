# Alpha Lion · Moby Growth Dashboard

Daily-feedback dashboard for Alpha Lion Meta ads, powered by **MobyBots attribution** (Moby MCP).
Three lenses: **Landing Pages** · **Persona / Concept** · **Testing Ads (kill list)**.

## Architecture (house pattern, local-first variant)

```
Moby MCP (api.mobybots.com/v2/mcp)
        │  scripts/fetch.mjs  (per-day pulls, retries, weekly chunking)
        ▼
data/   (JSON snapshots — GITIGNORED: contains revenue data, never committed)
        │  static fetch()
        ▼
index.html + js/  (vanilla JS + Chart.js, dark theme, IBM Plex Sans)
        served by scripts/serve.mjs → http://localhost:8811
```

**Why local-first:** Moby's endpoint has no CORS support, so a hosted (GitHub Pages) page
cannot call it from the browser, and committing revenue snapshots to any Pages branch would
make them public. Data therefore stays on this machine. The data layer (`js/data.js`) is an
adapter — if Moby adds CORS, direct browser mode can be swapped in and the dashboard hosted
like im8-dashboard.

## Daily use

```
npm run refresh   # pull trailing 8 days + campaign window from Moby (~2-4 min)
npm run serve     # dashboard on http://localhost:8811
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

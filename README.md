# Eurovision Party Vote 🎤✨

A real-time party voting app for Eurovision Song Contest events — Melodifestivalen, Dansk Melodi Grand Prix, Eurovision, and beyond.

Built for watching parties. No login. No database. Just fun.

## What It Does

- **Vote on Song + Show** (1–10 each) for every artist in the lineup
- **Live leaderboard** with averages, highest/lowest voters per artist
- **Winner reveal** ceremony with countdown, staged top-3, and medals
- **Live official results** scraped from Eurovisionworld with rank change animations
- **Replay mode** — relive the results announcement in order
- **Felicia mode** 🔊 — laser light show overlay (because why not)
- **Confetti cannon** on every vote submit with mood-based emojis
- **Auto-sync** across all phones (5s polling)
- **Event-driven** — swap between events by editing a JSON file

## Quick Start

This repo uses pnpm (`packageManager` in `package.json`). Enable it with `corepack enable` so the pinned version is used.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
pnpm build
pnpm start -- -p 3020
```

Expose via Tailscale Funnel, Cloudflare Tunnel, or your preferred method:

```bash
# Tailscale Funnel (stable public URL)
tailscale funnel --https 8443 http://127.0.0.1:3020

# Cloudflare Quick Tunnel (ephemeral, no account needed)
cloudflared tunnel --url http://127.0.0.1:3020
```

> **Note:** The server is not running by default. Start it manually when needed for a watching party.

## Adding a New Event

1. Copy `data/events/_template-national.json` (or `_template-eurovision.json`)
2. Save as `data/events/your-event-id.json`
3. Fill in: `id`, `name`, `country` flag, `artists` array, and `liveSource` URL
4. Update `data/active-event.json` to point to your event ID
5. Restart the server

Each event gets its own vote file (`data/state-{eventId}-{subEvent}.json`) and replay history — nothing collides.

### Event Config Shape

```json
{
  "id": "eurovision-2026",
  "name": "Eurovision Song Contest 2026",
  "country": "🇪🇺",
  "type": "eurovision",
  "subEvents": ["semi-1", "semi-2", "final"],
  "activeSubEvent": "semi-1",
  "liveSource": {
    "url": "https://eurovisionworld.com/eurovision/2026",
    "tableIds": []
  },
  "artists": [
    { "id": "artist-slug", "name": "Artist", "song": "Song Title", "country": "Sweden", "flag": "🇸🇪", "runningOrder": 1, "imageUrl": "https://..." }
  ]
}
```

### Switching Events via API

```bash
# Switch active event
curl -X POST http://localhost:3020/api/event -H 'Content-Type: application/json' -d '{"eventId":"eurovision-2026"}'

# Switch sub-event (e.g. semi-1 → final)
curl -X POST http://localhost:3020/api/event -H 'Content-Type: application/json' -d '{"subEvent":"final"}'
```

## How Voting Works

- Voter identified by name (stored in localStorage for convenience)
- Same voter + same artist = upsert (update existing vote)
- Song score + Show score (1–10 each), total is the sum
- All votes stored in a flat JSON file — no database needed
- Case-insensitive name matching

## Live Results

The live results page scrapes [Eurovisionworld](https://eurovisionworld.com) for real-time scoring data:

- Auto-detects the scoring table from embedded JavaScript data
- Dynamic column layout detection (works across different event formats)
- Server-side caching to avoid hammering the source
- Rank change animations with directional indicators (▲/▼)
- "Last changed" pulse on recently updated artists

## Architecture

- **Next.js 16** (App Router, Turbopack)
- **Flat JSON storage** — no database, `data/*.json` files
- **Server-side rendering** for API routes, static pages for client
- **5s polling** for vote sync, 3s for live results
- **Build-ID polling** (12s) for auto-reload on new deployments

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/state` | GET | Current votes + leaderboard |
| `/api/vote` | POST | Submit/update a vote |
| `/api/artists` | GET | Artist list + leaderboard |
| `/api/event` | GET | Active event config + event list |
| `/api/event` | POST | Switch active event or sub-event |
| `/api/live-feed` | GET | Live results from Eurovisionworld |
| `/api/live-history` | GET | Stored replay frames |
| `/api/version` | GET | Current build ID (for auto-reload) |

## Tech

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- No external dependencies for core functionality
- `vm.runInNewContext` for safe evaluation of scraped JS objects

## License

MIT

---

*Built in one evening for a Melodifestivalen 2026 watching party. Felicia won. 🇸🇪*

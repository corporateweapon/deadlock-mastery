# Dead Ledger

*Mastery and stats for Deadlock.*

Third-party meta progression for Deadlock: an uncapped **account level** and a League-style
**hero mastery** (0–X), both built from your real match history on
[deadlock-api.com](https://deadlock-api.com). No backend and no API key: the page runs
in the browser and caches each account in `localStorage`.

**Live:** https://deadlockledger.net (static fallback: https://corporateweapon.github.io/deadlock-mastery/)

Share any page by copying its link (the chain-link button in the header does it for you):
a dossier is `#<SteamID3>`, a comparison is `#<you>/compare/<friend>`, a match is
`#<you>/match/<matchId>`. Everyone's data loads straight from deadlock-api.com in their own
browser, so there's no server and nothing to keep running.

## Hosting

The full site runs as a **Cloudflare Worker** (`worker/`) that serves `public/` and adds:

- **Share links with preview cards**: `/p/<id>`, `/p/<id>/hero/<heroId>`, `/p/<id>/compare/<other>`
  unfurl in Discord with a generated 1200×630 card (`/og/...png`) and open the matching page.
- **Sign in with Steam** (OpenID; the site only ever learns your public SteamID).
- **Discord bot** over HTTP interactions: `/dossier`, `/mastery`, `/compare`, `/ladder`, `/link`, `/unlink`.
- **Ladder service**: Valve's official North America leaderboards (overall + per hero, with rank
  badges), and your exact position among every player for six metrics, found with tiny one-row
  scoreboard requests and cached.
- **Cloudflare Web Analytics** injected when a beacon token is set (cookie-free).

Setup and deployment: see **DEPLOY.md**. GitHub Pages still publishes `public/` on every push as a
static fallback; the server-only extras switch themselves off there.

## Run

```
"Launch Dead Ledger.bat"   # static site only: python serve.py [port] -> http://127.0.0.1:8787/
npm install && npm run dev      # full site with the Worker features -> http://127.0.0.1:8787/
```

Load an account with a SteamID64, `[U:1:…]`, `STEAM_0:…`, a `/profiles/` link, or a name
(name search goes through deadlock-api; `/id/vanity` links fall back to a name search because
resolving them needs a Steam Web API key). `#<accountId>` in the URL loads that account.

## Pages

Every page has its own URL (`#<accountId>/<page>`), so the back button and shared links work.
The **Mastery XP / Core Stats** toggle in the header switches every page between progression
and raw game stats, and the choice is remembered.

| Page | URL (`<id>` = SteamID3 / Steam friend code) | What's there |
|---|---|---|
| Overview | `#<id>` | Dossier (account level, rank, playstyle radar, points or career stats), signature hero, ranks within reach, Form / Journey / Economy charts, activity calendar with by-hour and by-day play, hero pool by role, teammates and squad-vs-solo, recent matches |
| Heroes | `#<id>/heroes` | Tarot-card roster with rank distribution, sorting and role filters |
| Hero file | `#<id>/hero/19` | The hero's art, logo, voice line, role, tags and abilities; your mastery climb or stat trend; playstyle radar; you vs all players; your core build and item win rates; personal bests; lore; match list |
| Ledger | `#<id>/matches` | Full match history with mode/result/hero filters, a summary bar and final builds |
| Match | `#<id>/match/<id>` | Result banner, team souls/kills/damage race with objective and Mid Boss markers, both scoreboards with names, MVPs and items, your purchase timeline, share of team work, accolades |
| Compare | `#<id>/compare/<friendId>` | Two dossiers head to head: account cards, an 18-category tale of the tape, overlaid playstyle radars, games together and against, lifetime points by month, and every hero you both play. `#<id>/compare` picks from your associates or any SteamID/name |
| Codex | `#<id>/codex` | How every number is made |

Rank-ups trigger a full-screen ceremony on the next refresh (preview with `?ceremony`).

## Layout

| Path | What |
|---|---|
| `public/js/scoring.js` | **All balance knobs** + pure scoring/progression functions (browser + Node) |
| `public/js/data.js` | deadlock-api calls, Steam ID parsing, match record normalization |
| `public/js/stats.js` | Core Stats aggregation (totals, averages, per-minute, bests) |
| `public/js/core.js` | Shared state, formatting helpers, asset lookups, routes (`window.DM`) |
| `public/js/components.js` | Crests, medallion, radar, ladders, seals, item icons, tables |
| `public/js/charts.js` | SVG line charts with hover read-outs, bars, columns, calendar, donut |
| `public/js/pages/*.js` | One file per page |
| `public/js/app.js` | Sync, routing, interactions, ceremony |
| `public/js/voicelines.js` | One voice line per hero, verbatim from deadlock.wiki |
| `public/data/baselines.js` | Frozen per-hero global stat averages (`tools/build_baselines.py`) |
| `public/data/assets.js` | Item, ability, rank and accolade names and icons (`tools/build_assets.py`; the raw item list is ~6 MB, this is 100 KB) |
| `public/js/pages/ladder.js` | Ladders page + the hero-page ladder strip |
| `worker/index.js` | Worker routes: share pages, card images, API, auth, Discord |
| `worker/core.js` | Server-side summary (same scoring code as the site), caching, player lookup |
| `worker/ladder.js` | Official leaderboards + scoreboard position search |
| `worker/og.js` | Share-card images (satori/resvg via `@cf-wasm/og`) |
| `worker/auth.js` | Steam OpenID sign-in, signed session cookie |
| `worker/discord.js`, `worker/commands.json` | Discord bot handlers and slash-command definitions |
| `tools/discord_register.js`, `tools/test_bot.mjs` | Register slash commands; run bot commands offline against real data |
| `tools/balance_report.js`, `tools/stats_report.js` | Print what the scoring and stats produce for a real account |

## Data

* `GET /v1/players/{id}/match-history` gives every match: K/D/A, souls, last hits, denies,
  result, mode and duration.
* `GET /v1/matches/metadata?account_ids=…&include_player_final_stats=true` adds hero damage
  (`player_damage`), healing (`player_healing`) and objective damage (`boss_damage`).
  On first load it's one bulk call; after that only matches still missing metadata are fetched,
  retried at most every 6h.
* Some matches never get metadata (~15% for the test account). Their damage, healing and
  objective points are **estimated** from the player's own average ratio on that hero, and
  flagged `est` in the ledger.

## Scoring model

**Per game:** each stat earns `weight × min(2.5, value / hero's global average)`. Weights sum
to 100, so an average game on *any* hero is worth ~100 points. Supports aren't punished for low
damage, and carries don't farm healing.

| Category | Weight | | Category | Weight |
|---|---|---|---|---|
| Win | 20 (40 on win, 0 on loss) | | Objective damage | 12 |
| Kills | 10 | | Souls | 12 |
| Assists | 10 | | Last hits | 9 |
| Hero damage | 14 | | Denies | 5 |
| Healing | 8 | | **Loss bonus** | flat 10 per loss |

* Losses add a flat 10-point participation bonus (`LOSS_BONUS`). It isn't a performance stat, so it's
  left out of grades and the playstyle radar.
* Street Brawl pays ×0.4 (games are ~40% as long), bonus included. Its denies weight moves onto the other stats.
* Bot, private, hero-lab and tutorial games, abandons, and games under 5 minutes score 0.
* Grade per game (performance points only): S+ ≥150, S ≥120, A ≥100, B ≥75, C ≥50, D below.

**Hero mastery:** these are cumulative points. Points keep counting after X, but the rank stops there.

| I | II | III | IV | V | VI | VII | VIII | IX | X |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 350 | 750 | 1.3k | 2k | 3k | 4.5k | 6.5k | 10k | 15k |

Going from 0 to X takes about 150 average games, or about 200 for a slightly below-average player.
Early ranks come fast, and the last two take as many games as the first eight.

**Account level:** the step from level L to L+1 costs `min(500 + 100·(L−1), 2500)`. It grows
until level 21, then stays at 2,500 points (about 25 games) per level forever.

## Rebalancing

Edit the knobs at the top of `js/scoring.js`, run `node tools/balance_report.js`, and reload.
Regenerate baselines after a big patch with `python tools/build_baselines.py --days 90`.
Changing a baseline or weight rescores all history, because nothing stores points, only raw stats.

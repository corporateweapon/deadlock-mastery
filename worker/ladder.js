// Ladders. Two sources:
//  - Valve's official ranked leaderboards (top players only), per region and per hero.
//  - deadlock-api's player scoreboard (every player, all regions), searched with tiny
//    one-row requests so we never download the 100k-row lists.
import { D, cached, rankFor } from "./core.js";

export const REGIONS = ["NAmerica", "Europe", "Asia", "SAmerica", "Oceania"];
export const METRICS = {
  matches: { label: "Games played", min: 5 },
  wins: { label: "Wins", min: 5 },
  winrate: { label: "Win rate", min: 20 },
  avg_kills_per_match: { label: "Kills per game", min: 20 },
  avg_player_damage_per_match: { label: "Hero damage per game", min: 20 },
  avg_net_worth_per_match: { label: "Souls per game", min: 20 },
};

// Official leaderboard, trimmed, with rank badges for the top 100. Valve refreshes hourly.
export function official(env, region = "NAmerica", heroId = null) {
  const key = `lb:v2:${region}:${heroId || "all"}`;
  return cached(env, key, 1800, async () => {
    const lb = await D.getJSON(`/v1/leaderboard/${region}${heroId ? "/" + heroId : ""}`);
    const entries = (lb.entries || []).map((e) => ({
      rank: e.rank, name: e.account_name, ids: e.possible_account_ids || [], heroes: e.top_hero_ids || [],
    }));
    // One batch call for rank badges of the top 100. Valve only gives a name, so an entry can map
    // to several possible accounts; check up to three and keep the highest badge found.
    const top = [...new Set(entries.slice(0, 100).flatMap((e) => e.ids.slice(0, 3)))];
    try {
      const ranks = await D.getJSON("/v1/players/rank", { account_ids: top.join(",") });
      const byId = new Map(ranks.map((r) => [r.account_id, r.badge]));
      for (const e of entries.slice(0, 100)) e.badge = Math.max(0, ...e.ids.slice(0, 3).map((id) => byId.get(id) || 0)) || null;
    } catch { /* badges are a nicety */ }
    return { region, hero: heroId, total: entries.length, entries, at: Date.now() };
  });
}

export function findOfficial(board, accountId) {
  const e = board.entries.find((x) => x.ids.includes(Number(accountId)));
  return e ? e.rank : null;
}

// ------------------------------------------------------------ scoreboard ----
function sbParams(heroId, metric, bracket) {
  const p = { sort_by: metric, min_matches: METRICS[metric].min };
  if (heroId) p.hero_id = heroId;
  if (bracket) { p.min_average_badge = bracket.min; p.max_average_badge = bracket.max; }
  return p;
}
// deadlock-api calls with polite retries when its rate limit says "slow down".
async function api(path, params) {
  for (let attempt = 0; ; attempt++) {
    try { return await D.getJSON(path, params, true); }
    catch (e) {
      if (attempt >= 3 || !/rate limit/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}
// `start` is 1-based: start=n returns the player at position n.
async function rowAt(params, pos) {
  const rows = await api("/v1/analytics/scoreboards/players", { ...params, start: pos, limit: 1 });
  return rows[0] || null;
}

// Smallest position p in [lo, hi] where test(p) is true (test is false...false,true...true),
// probing K points per round in parallel: ~log4(n) rounds instead of log2(n) sequential calls.
async function firstTrue(lo, hi, test, K = 4) {
  while (lo < hi) {
    const pts = [...new Set(Array.from({ length: K - 1 }, (_, j) => Math.floor(lo + ((hi - lo) * (j + 1)) / K)))].filter((p) => p >= lo && p < hi);
    if (!pts.length) pts.push(lo);
    const res = await Promise.all(pts.map(test));
    const i = res.indexOf(true);
    if (i === -1) lo = pts[pts.length - 1] + 1;
    else { hi = pts[i]; if (i > 0) lo = pts[i - 1] + 1; }
  }
  return lo;
}

// How many players are on this board. The count doesn't depend on the sort, so every metric
// with the same hero / minimum games / bracket shares one cached number (12h).
function total(env, params) {
  const { sort_by: _ignored, ...rest } = params;
  params = { ...rest, sort_by: "matches" };
  const key = "lbt:v3:" + new URLSearchParams(rest).toString();
  return cached(env, key, 43200, async () => {
    const empty = async (p) => !(await rowAt(params, p));
    const powers = Array.from({ length: 13 }, (_, i) => 2 ** (i + 10)); // 1k .. 4M, all at once
    const probes = await Promise.all(powers.map(empty));
    const k = probes.indexOf(true);
    if (k === -1) return powers[powers.length - 1];
    const lo = k ? powers[k - 1] + 1 : 1;
    return (await firstTrue(lo, powers[k], empty)) - 1;
  });
}

// Where one account sits: position = 1 + players strictly ahead (ties share a spot).
export async function position(env, { accountId, heroId, metric = "matches", badge = null }) {
  if (!METRICS[metric]) throw new Error("Unknown ladder metric.");
  const r = badge ? rankFor(badge) : null;
  const bracket = r ? { min: r.tier * 10 + 1, max: r.tier * 10 + 6, label: r.name } : null;
  const params = sbParams(heroId, metric, bracket);
  const key = `pos:v2:${accountId}:` + new URLSearchParams(params).toString();
  return cached(env, key, 3 * 3600, async () => {
    const me = await api("/v1/analytics/scoreboards/players", { ...params, account_ids: accountId });
    const n = await total(env, params);
    if (!me.length) return { metric, label: METRICS[metric].label, hero: heroId, bracket: bracket && bracket.label, qualified: false, min: METRICS[metric].min, total: n };
    const v = me[0].value;
    // First position whose value is <= mine (the board is sorted best-first).
    const lo = await firstTrue(1, Math.max(1, n), async (p) => { const row = await rowAt(params, p); return !row || row.value <= v; });
    return { metric, label: METRICS[metric].label, hero: heroId, bracket: bracket && bracket.label, qualified: true,
      value: v, games: me[0].matches, min: METRICS[metric].min, position: lo, total: n, top: n ? lo / n : null };
  });
}

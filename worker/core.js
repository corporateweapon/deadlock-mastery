// Server-side core: the same scoring/data code the site runs, plus caching and a compact
// "dossier summary" used by share cards, the Discord bot and the ladder.
globalThis.DM_FETCH_HEADERS = { "User-Agent": "deadlock-mastery (https://github.com/corporateweapon/deadlock-mastery)" };
// Optional deadlock-api key (higher rate limits). Set as a secret: DEADLOCK_API_KEY.
export function useApiKey(env) {
  if (env.DEADLOCK_API_KEY) globalThis.DM_FETCH_HEADERS["X-API-KEY"] = env.DEADLOCK_API_KEY;
}
import S from "../public/js/scoring.js";
import D from "../public/js/data.js";
import T from "../public/js/stats.js";
import "../public/data/baselines.js";
import "../public/data/assets.js";
import "../public/js/voicelines.js";

export { S, D, T };
export const BASE = globalThis.DM_BASELINES;
export const A = globalThis.DM_ASSETS;
export const VOICE = globalThis.DM_VOICE;
export const HEROES = new Map(A.heroes.map((h) => [h.id, h]));
export const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const ARCHETYPE = { kills: "Executioner", assists: "Accomplice", player_damage: "Gunhand", player_healing: "Mender",
  boss_damage: "Siegebreaker", net_worth: "Profiteer", last_hits: "Harvester" };

export const hero = (id) => HEROES.get(Number(id)) || { id: Number(id), name: `Hero ${id}`, rgb: "217,181,106" };
export function heroByName(q) {
  const s = String(q || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  const list = [...HEROES.values()];
  return list.find((h) => h.name.toLowerCase().replace(/[^a-z0-9]/g, "") === s)
    || list.find((h) => h.name.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(s)) || null;
}
export function rankFor(badge) {
  if (!badge) return null;
  const t = Math.floor(badge / 10), sub = badge % 10;
  const r = A.ranks.find((x) => x.tier === t);
  return r ? { tier: t, sub, name: r.name, color: r.color, label: `${r.name} ${ROMAN[sub] || ""}`.trim() } : null;
}

// ------------------------------------------------------------------- caching ----
// Isolate memory first, then KV (works on workers.dev and custom domains alike).
const mem = new Map();
export async function cached(env, key, ttlSec, fn) {
  const hit = mem.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (env.KV) {
    const kv = await env.KV.get(key, "json");
    if (kv) { mem.set(key, { value: kv, until: Date.now() + 60e3 }); return kv; }
  }
  const value = await fn();
  mem.set(key, { value, until: Date.now() + Math.min(ttlSec, 600) * 1000 });
  if (env.KV && value != null) {
    try { await env.KV.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) }); } catch { /* quota */ }
  }
  return value;
}

// --------------------------------------------------------------- players ----
// Any input a person might type -> { id, name } (or throws with a friendly message).
export async function resolvePlayer(input) {
  const p = D.parseSteamInput(input);
  if (p.error) throw new Error(p.error);
  if (p.accountId) return { id: p.accountId };
  const hits = await D.searchProfiles(p.search);
  if (!hits.length) throw new Error(`No Deadlock player matches "${p.search}". Try a Steam friend code or profile link.`);
  return { id: hits[0].account_id, name: hits[0].personaname };
}

const last = (a) => (Array.isArray(a) && a.length ? a[a.length - 1] : 0);

// Full scoring for one account using a light metadata query (~3x smaller than the site's).
async function computeSummary(id) {
  const meta = D.getJSON("/v1/matches/metadata", { account_ids: id, only_filtered_players: "true", include_player_info: "true",
    extra_player_columns: "stats.player_damage,stats.player_healing,stats.boss_damage", match_mode: "", game_mode: "", limit: 5000 }, true);
  const [hist, rows, profile] = await Promise.all([D.fetchHistory(id), meta, D.fetchProfile(id).catch(() => null)]);
  if (!hist.length) return null;
  const recs = new Map();
  for (const h of hist) recs.set(h.match_id, D.fromHistory(h));
  for (const m of rows) {
    const p = (m.players || []).find((x) => x.account_id === id);
    const r = p && recs.get(m.match_id);
    if (!r) continue;
    r.dmg = last(p.stats_player_damage); r.heal = last(p.stats_player_healing); r.obj = last(p.stats_boss_damage); r.full = true;
  }
  const res = S.computeAll([...recs.values()], BASE);
  const counted = res.scored.filter((x) => x.score.eligible).map((x) => x.rec);
  const st = T.aggregate(counted);
  const a = res.account;
  const arch = Object.keys(ARCHETYPE).filter((k) => a.ratios[k] != null).sort((x, y) => a.ratios[y] - a.ratios[x])[0];
  const heroes = Object.values(res.heroes).sort((x, y) => y.points - x.points).map((h) => ({
    id: h.hero, level: h.mastery.level, points: Math.round(h.points), games: h.matches, wins: h.wins,
    toNext: Math.round(h.mastery.toNext), maxed: h.mastery.maxed,
  }));
  const badgeRec = [...recs.values()].filter((r) => r.badge).sort((x, y) => y.t - x.t)[0];
  return {
    id, name: (profile && profile.personaname) || `Player ${id}`, avatar: profile && profile.avatarfull,
    level: a.level.level, into: Math.round(a.level.into), span: a.level.span, points: Math.round(a.points),
    games: a.matches, wins: a.wins, kda: +st.kda.toFixed(2), avgPts: +(a.points / Math.max(1, a.matches)).toFixed(1),
    hours: Math.round(st.seconds / 3600), archetype: arch ? ARCHETYPE[arch] : null,
    badge: badgeRec ? badgeRec.badge : null, lastPlayed: counted.length ? Math.max(...counted.map((r) => r.t)) : null,
    masterySum: heroes.reduce((s, h) => s + h.level, 0), heroes, at: Date.now(),
  };
}

export const summary = (env, id) => cached(env, `sum:v1:${id}`, 3600, () => computeSummary(Number(id)));

// Deadlock Mastery - deadlock-api.com access + record normalization.
// Works in the browser (window.DMData) and Node 18+ (require), both have fetch.
(function (root) {
  "use strict";

  const API = "https://api.deadlock-api.com";
  const STEAM64_BASE = 76561197960265728n;
  const GAME_MODES = { 1: "normal", 4: "brawl" };
  const MATCH_MODES = { 1: "unranked", 2: "private_lobby", 3: "coop_bot", 4: "ranked",
    5: "server_test", 6: "tutorial", 7: "hero_labs" };
  const META_BATCH = 50;

  // ------------------------------------------------------------ steam ids ----

  // Returns { accountId } for anything we can resolve offline, { search } for a
  // persona name, or { error }.
  function parseSteamInput(input) {
    const s = String(input || "").trim();
    if (!s) return { error: "Enter a Steam ID, profile link or name." };
    let m;
    if ((m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i))) return { accountId: from64(m[1]) };
    if ((m = s.match(/steamcommunity\.com\/id\/([^/?#]+)/i))) return { search: decodeURIComponent(m[1]), vanity: true };
    if ((m = s.match(/^\[?U:1:(\d+)\]?$/i))) return { accountId: Number(m[1]) };
    if ((m = s.match(/^STEAM_[0-5]:([01]):(\d+)$/i))) return { accountId: Number(m[2]) * 2 + Number(m[1]) };
    if (/^7656\d{13}$/.test(s)) return { accountId: from64(s) };
    if (/^\d{1,10}$/.test(s) && Number(s) < 2 ** 32) return { accountId: Number(s) };
    return { search: s };
  }

  function from64(id64) { return Number(BigInt(id64) - STEAM64_BASE); }
  function to64(accountId) { return (BigInt(accountId) + STEAM64_BASE).toString(); }

  // ---------------------------------------------------------------- fetch ----

  // emptyOn404: the metadata endpoint answers 404 when none of the asked-for matches exist yet.
  async function getJSON(path, params, emptyOn404) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    // Server-side callers (the Cloudflare Worker) set DM_FETCH_HEADERS, e.g. a User-Agent.
    const res = await fetch(API + path + qs, root.DM_FETCH_HEADERS ? { headers: root.DM_FETCH_HEADERS } : undefined);
    if (res.status === 404 && emptyOn404) return [];
    if (res.status === 429) throw new Error("deadlock-api rate limit hit - wait a minute and refresh.");
    if (!res.ok) throw new Error(`deadlock-api ${path} -> HTTP ${res.status}`);
    return res.json();
  }

  function fetchHistory(accountId) {
    return getJSON(`/v1/players/${accountId}/match-history`);
  }

  function fetchProfile(accountId) {
    return getJSON("/v1/players/steam", { account_ids: accountId }).then((a) => a[0] || null);
  }

  function searchProfiles(query) {
    return getJSON("/v1/players/steam-search", { search_query: query, limit: 8, min_matches_played_last_30d: 0 });
  }

  const META_PARAMS = { only_filtered_players: "true", include_player_info: "true",
    include_player_final_stats: "true", include_player_items: "true", match_mode: "", game_mode: "" };

  // Everything at once - used on first load (one request, ~4KB per match).
  function fetchAllMetadata(accountId) {
    return getJSON("/v1/matches/metadata", Object.assign({ account_ids: accountId, limit: 5000 }, META_PARAMS), true);
  }

  async function fetchMetadataFor(accountId, matchIds, onProgress) {
    const out = [];
    for (let i = 0; i < matchIds.length; i += META_BATCH) {
      const chunk = matchIds.slice(i, i + META_BATCH);
      const rows = await getJSON("/v1/matches/metadata", Object.assign(
        { account_ids: accountId, match_ids: chunk.join(","), limit: chunk.length }, META_PARAMS), true);
      out.push(...rows);
      if (onProgress) onProgress(Math.min(i + META_BATCH, matchIds.length), matchIds.length);
    }
    return out;
  }

  // One match with all 12 players, item purchases, time-series stats and objectives (~600KB).
  async function fetchMatch(matchId) {
    const rows = await getJSON("/v1/matches/metadata", { match_ids: matchId, include_info: "true",
      include_player_info: "true", include_player_items: "true", include_player_final_stats: "true",
      include_player_stats: "true", include_objectives: "true", include_mid_boss: "true",
      match_mode: "", game_mode: "" }, true);
    return rows[0] || null;
  }

  // Steam profiles for many accounts at once (names + avatars for scoreboards, teammates).
  async function fetchProfiles(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      out.push(...await getJSON("/v1/players/steam", { account_ids: ids.slice(i, i + 100).join(",") }, true));
    }
    return out;
  }

  const fetchMates = (id) => getJSON(`/v1/players/${id}/mate-stats`, { min_matches_played: 3 }, true);
  const fetchEnemies = (id) => getJSON(`/v1/players/${id}/enemy-stats`, { min_matches_played: 2 }, true);
  const fetchRank = (id) => getJSON(`/v1/players/${id}/rank`).catch(() => null);

  // Global per-hero win and pick rates, last 30 days of ranked + unranked.
  async function fetchHeroMeta() {
    const rows = await getJSON("/v1/analytics/hero-stats");
    const total = rows.reduce((s, r) => s + r.matches, 0) / 12;
    const out = {};
    for (const r of rows) {
      out[r.hero_id] = { winRate: r.wins / Math.max(1, r.matches), pickRate: r.matches / Math.max(1, total),
        matches: r.matches, k: r.total_kills / r.matches, d: r.total_deaths / r.matches, a: r.total_assists / r.matches,
        souls: r.total_net_worth / r.matches, dmg: r.total_player_damage / r.matches, obj: r.total_boss_damage / r.matches };
    }
    return out;
  }

  // Trimmed hero list: id, name, images, colour. The full payload is ~2MB.
  async function fetchHeroes() {
    const all = await getJSON("/v1/assets/heroes");
    return all
      .filter((h) => h.player_selectable && !h.disabled)
      .map((h) => {
        const im = h.images || {};
        return {
          id: h.id, name: h.name, type: h.hero_type, tags: h.tags || [],
          card: im.icon_hero_card_webp || im.icon_hero_card,
          gloat: im.hero_card_gloat_webp || im.hero_card_gloat,
          small: im.icon_image_small_webp || im.icon_image_small,
          bg: im.background_image_webp || im.background_image,   // ~1-2MB collage, load on demand
          nameArt: im.name_image,                                  // white SVG logotype
          rgb: h.colors && Array.isArray(h.colors.ui) ? h.colors.ui.join(",") : "217,181,106",
          lore: (h.description && h.description.lore) || "", role: (h.description && h.description.role) || "",
          playstyle: (h.description && h.description.playstyle) || "", complexity: h.complexity || 0,
        };
      });
  }

  // -------------------------------------------------------- normalization ----

  const num = (v) => (typeof v === "number" ? v : null);

  function fromHistory(h) {
    return {
      id: h.match_id, t: h.start_time, hero: h.hero_id,
      mode: GAME_MODES[h.game_mode] || "other:" + h.game_mode,
      mm: MATCH_MODES[h.match_mode] || "other:" + h.match_mode,
      dur: h.match_duration_s, won: h.match_result === h.player_team,
      abandoned: (h.abandoned_time_s || 0) > 0,
      k: h.player_kills, d: h.player_deaths, a: h.player_assists,
      lh: h.last_hits, dn: h.denies, nw: h.net_worth, lvl: h.hero_level || null,
      badge: h.ranked_display_badge || null,
      dmg: null, heal: null, obj: null, full: false,
    };
  }

  const META_MODE = { Normal: "normal", StreetBrawl: "brawl" };
  const META_MM = { Unranked: "unranked", Ranked: "ranked", PrivateLobby: "private_lobby",
    CoopBot: "coop_bot", ServerTest: "server_test", Tutorial: "tutorial", HeroLabs: "hero_labs" };

  function fromMetadata(m, accountId) {
    const p = (m.players || []).find((x) => x.account_id === accountId);
    if (!p) return null;
    const fs = p.final_stats || {};
    const cus = fs.custom_user_stats || {};
    return {
      id: m.match_id,
      t: Math.floor(Date.parse(String(m.start_time).replace(" ", "T") + "Z") / 1000),
      hero: p.hero_id,
      mode: META_MODE[m.game_mode] || "other:" + m.game_mode,
      mm: META_MM[m.match_mode] || "other:" + m.match_mode,
      dur: m.duration_s, won: m.winning_team === p.team,
      abandoned: (p.abandon_match_time_s || 0) > 0,
      k: p.kills, d: p.deaths, a: p.assists, lh: p.last_hits, dn: p.denies, nw: p.net_worth,
      dmg: fs.player_damage || 0, heal: fs.player_healing || 0, obj: fs.boss_damage || 0,
      full: !!p.final_stats,
      // Extra detail for the Core Stats view (not used by scoring).
      lvl: p.player_level || fs.level || null,
      taken: num(fs.player_damage_taken), mit: num(fs.damage_mitigated),
      teamHeal: num(fs.teammate_healing), barrier: num(fs.teammate_barriering),
      creep: num(fs.creep_kills), neutral: num(fs.neutral_kills),
      hShots: num(cus["Enemy Hero Accuracy##Shots"]), hHits: num(cus["Enemy Hero Accuracy##Hits"]),
      hHead: num(cus["Enemy Hero Accuracy##Headshots"]),
      lane: p.assigned_lane || null,
      // Final build: everything still owned at the end, with its buy time. Ability unlocks are in
      // this list too; the UI keeps only ids it knows as shop items.
      it: (p.items || []).filter((x) => !x.sold_time_s).map((x) => [x.item_id, x.game_time_s]),
      acc: (p.accolades || []).filter((x) => x.accolade_threshold_achieved >= 0).map((x) => x.accolade_id),
    };
  }

  // Metadata wins on the stats it has; history keeps the exact start time.
  function merge(existing, incoming) {
    if (!existing) return incoming;
    if (incoming.full && !existing.full) return Object.assign({}, incoming, { t: existing.t || incoming.t, lvl: incoming.lvl || existing.lvl, badge: existing.badge || null });
    if (existing.full && !incoming.full && incoming.badge && !existing.badge) return Object.assign({}, existing, { badge: incoming.badge });
    if (existing.full && !incoming.full) return existing;
    return Object.assign({}, existing, incoming);
  }

  const api = { API, getJSON, parseSteamInput, from64, to64, fetchHistory, fetchProfile, searchProfiles,
    fetchAllMetadata, fetchMetadataFor, fetchHeroes, fetchMatch, fetchProfiles, fetchMates, fetchEnemies,
    fetchRank, fetchHeroMeta, fromHistory, fromMetadata, merge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DMData = api;
})(typeof window !== "undefined" ? window : globalThis);

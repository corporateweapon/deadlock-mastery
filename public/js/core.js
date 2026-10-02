// Deadlock Mastery - shared state, helpers and asset lookups. Everything hangs off window.DM.
(function () {
  "use strict";
  const S = window.DMScoring, D = window.DMData, T = window.DMStats;
  const BASE = window.DM_BASELINES;
  const A = window.DM_ASSETS || { items: {}, abilities: {}, kits: {}, ranks: [], accolades: {} };
  const VOICE = window.DM_VOICE || {};

  const CACHE_VER = "dm:v1:";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CAN_HOVER = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const TIERS = ["ash", "bronze", "bronze", "silver", "silver", "gold", "gold", "jade", "jade", "amethyst", "radiant"];
  const FLAVOR = [
    "A stranger to these streets.",
    "You've been seen around.",
    "Taking orders, learning the trade.",
    "People step aside when you pass.",
    "You run a crew now.",
    "Your word carries weight.",
    "Second only to the throne.",
    "Whispered counsel, sharpened knives.",
    "The city answers to you.",
    "Every racket pays tribute.",
    "A name carved into the Cursed Apple.",
  ];
  const SHORT = { win: "Wins", kills: "Kills", assists: "Assists", player_damage: "Damage",
    player_healing: "Healing", boss_damage: "Objective", net_worth: "Souls", last_hits: "Last hits", denies: "Denies" };
  const ARCHETYPE = { win: "Closer", kills: "Executioner", assists: "Accomplice", player_damage: "Gunhand",
    player_healing: "Mender", boss_damage: "Siegebreaker", net_worth: "Profiteer", last_hits: "Harvester", denies: "Spoiler" };
  // Team 0 fights for the Hidden King (amber), team 1 for the Archmother (sapphire).
  const TEAMS = [{ name: "Hidden King", cls: "amber" }, { name: "Archmother", cls: "sapphire" }];
  const ROLE_NAMES = { marksman: "Marksman", brawler: "Brawler", mystic: "Mystic", assassin: "Assassin", tank: "Tank", support: "Support" };
  const SLOT_NAMES = { weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" };

  const state = {
    accountId: null, profile: null, records: new Map(), metaTried: {},
    heroes: [], heroById: new Map(), result: null, stats: null,
    shown: 30, busy: false, sort: "points", filter: "all", role: "all", heroFilter: 0, animate: true,
    route: { page: "overview", arg: null },
    view: (() => { try { return localStorage.getItem(CACHE_VER + "view") === "stats" ? "stats" : "xp"; } catch { return "xp"; } })(),
    heroMeta: null, rank: null, mates: null, enemies: null,
    profiles: new Map(), matches: new Map(),
    server: null, me: null, ladderShown: 100, // server = /api/health result when the Worker is present
  };

  // ---------------------------------------------------------------- utils ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString();
  const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));
  const fmtBig = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e4 ? fmtK(n) : fmt(n);
  const fmtAvg = (v) => v == null || !isFinite(v) ? "–" : v >= 1000 ? fmtK(v) : v.toFixed(v < 10 ? 1 : 0);
  const pct = (x) => x == null || !isFinite(x) ? "–" : Math.round(x * 100) + "%";
  const clock = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60) % 60).padStart(2, "0")}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const tier = (l) => TIERS[Math.max(0, Math.min(10, l))];
  const gradeCls = (g) => "g-" + g.replace("+", "p");
  const countAttr = (n, dec = 0) => `data-count="${n}" data-dec="${dec}"`;
  const isStats = () => state.view === "stats";
  const gamesFor = (h, pts) => Math.ceil(pts / Math.max(40, h.points / Math.max(1, h.matches)));
  const dateShort = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
  const dateLong = (t) => new Date(t * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const ago = (t) => {
    const s = Date.now() / 1000 - t;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 86400 * 30) return Math.round(s / 86400) + "d ago";
    return new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const modeName = (r) => r.mode === "brawl" ? "Street Brawl" : r.mm === "ranked" ? "Ranked" : r.mm === "unranked" ? "Standard" : String(r.mm).replace("_", " ");

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(CACHE_VER + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(CACHE_VER + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
    // Small helper for API results that are fine to reuse for a few hours.
    fresh(k, ttl) { const v = this.get(k); return v && Date.now() - v.at < ttl ? v.data : null; },
    keep(k, data) { this.set(k, { at: Date.now(), data }); },
  };

  // ---------------------------------------------------------------- assets ----
  const heroMeta = (id) => state.heroById.get(Number(id)) || { id: Number(id), name: `Hero ${id}`, rgb: "217,181,106", lore: "", role: "", tags: [] };
  const heroName = (id) => heroMeta(id).name;
  const quote = (meta, level) => VOICE[meta.name] || FLAVOR[level || 0];
  function item(id) {
    const x = A.items[String(id)];
    return x ? { id, name: x[0], img: x[1], slot: x[2], tier: x[3], cost: x[4], shop: !!x[5] } : null;
  }
  // Final shop items of a record, in purchase order.
  const buildOf = (r) => (r.it || []).map(([id, t]) => ({ ...item(id), t })).filter((x) => x.name).sort((a, b) => a.t - b.t);
  const kit = (heroId) => (A.kits[String(heroId)] || []).map((cls) => {
    const a = A.abilities[cls];
    return a ? { cls, id: a[0], name: a[1], img: a[2], quip: a[3], desc: a[4] } : null;
  }).filter(Boolean);
  // Badge = tier * 10 + subrank (e.g. 74 = Archon 4).
  function rankFor(badge) {
    if (!badge) return null;
    const t = Math.floor(badge / 10), sub = badge % 10;
    const r = A.ranks.find((x) => x.tier === t);
    return r ? { tier: t, sub, name: r.name, color: r.color, img: (r.sub && r.sub[sub]) || r.img } : null;
  }
  const accolade = (id) => (A.accolades[String(id)] || [null])[0];

  // --------------------------------------------------------------- routing ----
  const href = {
    overview: () => `#${state.accountId}`,
    page: (p) => `#${state.accountId}/${p}`,
    hero: (id) => `#${state.accountId}/hero/${id}`,
    match: (id) => `#${state.accountId}/match/${id}`,
    compare: (id) => `#${state.accountId}/compare${id ? "/" + id : ""}`,
  };
  function parseHash(h) {
    const parts = String(h || "").replace(/^#/, "").split("/").filter(Boolean);
    const acct = Number(parts[0]) || null;
    const page = parts[1] || "overview";
    const arg = parts[2] ? Number(parts[2]) : null;
    return { acct, page: ["overview", "heroes", "hero", "matches", "match", "codex", "compare", "ladder"].includes(page) ? page : "overview", arg };
  }

  // Records of counted games, newest first, optionally for one hero.
  const counted = (heroId) => (state.result ? state.result.scored : [])
    .filter((x) => x.score.eligible && (heroId == null || x.rec.hero === Number(heroId)));

  window.DM = {
    S, D, T, BASE, A, VOICE, state, store, CACHE_VER, REDUCED, CAN_HOVER,
    ROMAN, TIERS, FLAVOR, SHORT, ARCHETYPE, TEAMS, ROLE_NAMES, SLOT_NAMES,
    u: { $, esc, fmt, fmtK, fmtBig, fmtAvg, pct, clock, plural, tier, gradeCls, countAttr, isStats, gamesFor,
      dateShort, dateLong, ago, modeName },
    a: { heroMeta, heroName, quote, item, buildOf, kit, rankFor, accolade },
    href, parseHash, counted,
  };
})();

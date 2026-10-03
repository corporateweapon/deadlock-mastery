// Dead Ledger - core game stats (the "Core Stats" view). Pure aggregation, no scoring.
// Works in the browser (window.DMStats) and Node (require).
(function (root) {
  "use strict";

  // meta: only present when deadlock-api has the match metadata.
  // base: scoring baseline key, so the UI can show "vs hero average".
  // perMin: also worth showing per minute.
  const STATS = [
    { key: "k", label: "Kills", base: "kills" },
    { key: "d", label: "Deaths", lowerBetter: true },
    { key: "a", label: "Assists", base: "assists" },
    { key: "nw", label: "Souls", base: "net_worth", perMin: true },
    { key: "lh", label: "Last hits", base: "last_hits", perMin: true },
    { key: "dn", label: "Denies", base: "denies" },
    { key: "dmg", label: "Hero damage", base: "player_damage", perMin: true, meta: true },
    { key: "taken", label: "Damage taken", perMin: true, meta: true, lowerBetter: true },
    { key: "mit", label: "Damage mitigated", meta: true },
    { key: "heal", label: "Healing", base: "player_healing", perMin: true, meta: true },
    { key: "teamHeal", label: "Ally healing", meta: true },
    { key: "obj", label: "Objective damage", base: "boss_damage", perMin: true, meta: true },
    { key: "creep", label: "Creep kills", meta: true },
    { key: "neutral", label: "Neutral kills", meta: true },
  ];

  const BESTS = [
    { key: "k", label: "Most kills" },
    { key: "a", label: "Most assists" },
    { key: "dmg", label: "Most hero damage" },
    { key: "nw", label: "Most souls" },
    { key: "heal", label: "Most healing" },
    { key: "obj", label: "Most objective damage" },
  ];

  const has = (v) => typeof v === "number" && isFinite(v);

  // recs: the counted games to summarise (already filtered by the caller).
  function aggregate(recs) {
    const out = { games: recs.length, wins: 0, seconds: 0, lines: [], bests: [], k: 0, d: 0, a: 0,
      accuracy: null, headshot: null, level: null, streak: 0, fullGames: 0 };
    let shots = 0, hits = 0, heads = 0, lvlSum = 0, lvlN = 0, run = 0;
    for (const r of recs.slice().sort((x, y) => x.t - y.t)) {
      if (r.won) { out.wins++; run++; out.streak = Math.max(out.streak, run); } else run = 0;
      out.seconds += r.dur || 0;
      if (r.full) out.fullGames++;
      if (has(r.hShots) && has(r.hHits)) { shots += r.hShots; hits += r.hHits; heads += r.hHead || 0; }
      if (has(r.lvl)) { lvlSum += r.lvl; lvlN++; }
    }
    for (const s of STATS) {
      let total = 0, n = 0, minutes = 0;
      for (const r of recs) {
        const v = r[s.key];
        if (s.meta && !r.full) continue;
        if (!has(v)) continue;
        total += v; n++; minutes += (r.dur || 0) / 60;
      }
      out.lines.push({ ...s, total, n, avg: n ? total / n : null, perMin: s.perMin && minutes ? total / minutes : null });
    }
    for (const b of BESTS) {
      let best = null;
      for (const r of recs) {
        const v = r[b.key];
        if (!has(v) || (b.key === "dmg" || b.key === "heal" || b.key === "obj") && !r.full) continue;
        if (!best || v > best.value) best = { value: v, rec: r };
      }
      out.bests.push({ ...b, best });
    }
    const line = (k) => out.lines.find((l) => l.key === k);
    out.k = line("k").avg || 0; out.d = line("d").avg || 0; out.a = line("a").avg || 0;
    out.kda = (line("k").total + line("a").total) / Math.max(1, line("d").total);
    out.accuracy = shots ? hits / shots : null;
    out.headshot = hits ? heads / hits : null;
    out.level = lvlN ? lvlSum / lvlN : null;
    out.avgMinutes = out.games ? out.seconds / 60 / out.games : 0;
    out.line = line;
    return out;
  }

  const api = { STATS, BESTS, aggregate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DMStats = api;
})(typeof window !== "undefined" ? window : globalThis);

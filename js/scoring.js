// Deadlock Mastery - scoring model.
// Pure functions + every tuning knob in one place. No DOM, no fetch: runs in the
// browser (window.DMScoring) and in Node (require) for the balance report.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- knobs ----

  // Expected points from each category in an AVERAGE game on ANY hero (sums to 100).
  // A stat earns  weight x (your value / that hero's global average), capped.
  const WEIGHTS = {
    win: 20,            // win pays 2x (40), loss pays 0 -> 20 at a 50% win rate
    kills: 10,
    assists: 10,
    player_damage: 14,  // hero damage
    player_healing: 8,
    boss_damage: 12,    // objective damage (guardians, walkers, base, patron)
    net_worth: 12,      // souls collected
    last_hits: 9,
    denies: 5,
  };

  // Flat points for finishing a counted game you lost, so a rough loss still moves you forward.
  // Not performance: left out of grades and the playstyle radar.
  const LOSS_BONUS = 10;

  const CATEGORIES = [
    { key: "win", label: "Wins" },
    { key: "loss_bonus", label: "Loss Bonus", bonus: true },
    { key: "kills", label: "Kills" },
    { key: "assists", label: "Assists" },
    { key: "player_damage", label: "Hero Damage" },
    { key: "player_healing", label: "Healing" },
    { key: "boss_damage", label: "Objective Damage" },
    { key: "net_worth", label: "Souls" },
    { key: "last_hits", label: "Last Hits" },
    { key: "denies", label: "Denies" },
  ];

  const RATIO_CAP = 2.5;        // one stat can pay at most 2.5x its weight in a game
  const BASELINE_FLOOR = 0.25;  // hero avg never below 25% of the all-hero avg (no div-by-tiny)
  const MIN_DURATION_S = 300;   // shorter games (remakes) earn nothing
  // Street Brawl games run ~14 min vs ~37 for Normal. Scale so a minute of either
  // is worth about the same.
  const MODE_SCALE = { normal: 1.0, brawl: 0.4 };
  // Only these count. Bots, private lobbies, hero labs and tutorials earn nothing.
  const COUNTED_MATCH_MODES = ["unranked", "ranked"];

  // Grades use the unscaled points of one game (100 = an average game on that hero).
  // An average-stat loss scores ~80 (B); an average-stat win ~120 (S).
  const GRADES = [
    { min: 150, grade: "S+" }, { min: 120, grade: "S" }, { min: 100, grade: "A" },
    { min: 75, grade: "B" }, { min: 50, grade: "C" }, { min: 0, grade: "D" },
  ];

  // Hero mastery: cumulative points to REACH each level (~100 pts = one average game).
  // Index = level. Points keep accruing after 10 but the rank stops there.
  const MASTERY_THRESHOLDS = [0, 100, 350, 750, 1300, 2000, 3000, 4500, 6500, 10000, 15000];
  const MASTERY_MAX = 10;
  const MASTERY_TITLES = ["Unproven", "Associate", "Soldier", "Enforcer", "Lieutenant",
    "Capo", "Underboss", "Consigliere", "Boss", "Kingpin", "Legend"];

  // Account level (uncapped): points to go from level L to L+1.
  // Grows by 100 per level, then flattens at 2500 (about 25 games per level) from level 21.
  const ACCOUNT_BASE = 500, ACCOUNT_STEP = 100, ACCOUNT_MAX_STEP = 2500;

  // ------------------------------------------------------------ baselines ----

  function baselineFor(baselines, mode, heroId, stat) {
    const block = baselines && baselines.modes && baselines.modes[mode];
    if (!block) return null;
    const all = block.all && block.all[stat] ? block.all[stat].avg : null;
    const hero = block[String(heroId)] && block[String(heroId)][stat] ? block[String(heroId)][stat].avg : null;
    const avg = hero != null ? hero : all;
    if (avg == null || all == null) return avg || null;
    return Math.max(avg, all * BASELINE_FLOOR);
  }

  // Normal weights, minus any stat the mode never produces (Street Brawl has no denies),
  // with that weight spread proportionally over the rest so the total stays 100.
  function weightsFor(baselines, mode) {
    const w = Object.assign({}, WEIGHTS);
    const block = baselines && baselines.modes && baselines.modes[mode];
    let dropped = 0;
    if (block && block.all) {
      for (const k of Object.keys(w)) {
        if (k === "win") continue;
        const b = block.all[k];
        if (!b || !(b.avg > 0.05)) { dropped += w[k]; w[k] = 0; }
      }
    }
    if (dropped > 0) {
      const live = Object.keys(w).filter((k) => w[k] > 0);
      const liveSum = live.reduce((s, k) => s + w[k], 0);
      for (const k of live) w[k] += dropped * (w[k] / liveSum);
    }
    return w;
  }

  // ------------------------------------------------------------- matches ----

  // record: { id, t, hero, mode:'normal'|'brawl', mm:'ranked'|'unranked'|..., dur, won,
  //           abandoned, k, d, a, lh, dn, nw, dmg, heal, obj, full:boolean }
  const STAT_FIELDS = { kills: "k", assists: "a", player_damage: "dmg", player_healing: "heal",
    boss_damage: "obj", net_worth: "nw", last_hits: "lh", denies: "dn" };
  const META_ONLY = ["player_damage", "player_healing", "boss_damage"]; // not in match history

  function eligibility(r) {
    if (!COUNTED_MATCH_MODES.includes(r.mm)) return "mode";
    if (!(r.mode in MODE_SCALE)) return "mode";
    if (r.abandoned) return "abandoned";
    if (!(r.dur >= MIN_DURATION_S)) return "short";
    return null;
  }

  function gradeFor(raw) {
    for (const g of GRADES) if (raw >= g.min) return g.grade;
    return "D";
  }

  // estRatios: { [stat]: ratio } used for META_ONLY stats when the match has no metadata yet.
  function scoreMatch(r, baselines, estRatios) {
    const why = eligibility(r);
    const out = { id: r.id, eligible: !why, reason: why, raw: 0, points: 0, grade: null,
      estimated: false, cats: {}, ratios: {} };
    if (why) return out;
    const w = weightsFor(baselines, r.mode);
    const scale = MODE_SCALE[r.mode];

    out.cats.win = r.won ? w.win * 2 : 0;
    out.ratios.win = r.won ? 2 : 0;
    for (const stat of Object.keys(STAT_FIELDS)) {
      if (!w[stat]) { out.cats[stat] = 0; continue; }  // no ratio: stat absent in this mode
      let ratio;
      if (!r.full && META_ONLY.includes(stat)) {
        ratio = (estRatios && estRatios[stat] != null) ? estRatios[stat] : 1;
        out.estimated = true;
      } else {
        const base = baselineFor(baselines, r.mode, r.hero, stat);
        const v = r[STAT_FIELDS[stat]] || 0;
        ratio = base ? v / base : 0;
      }
      ratio = Math.min(RATIO_CAP, Math.max(0, ratio));
      out.ratios[stat] = ratio;
      out.cats[stat] = w[stat] * ratio;
    }
    out.raw = Object.values(out.cats).reduce((s, x) => s + x, 0);  // performance only
    out.grade = gradeFor(out.raw);
    out.cats.loss_bonus = r.won ? 0 : LOSS_BONUS;
    for (const k of Object.keys(out.cats)) out.cats[k] *= scale;
    out.points = (out.raw + out.cats.loss_bonus / scale) * scale;
    return out;
  }

  // Player's own average ratio per hero for the stats only metadata has, so matches
  // still missing metadata get a fair estimate instead of zero (or a free average).
  function estimateRatios(records, baselines) {
    const acc = {}; // key -> {stat: [sum, n]}
    const add = (key, stat, v) => {
      acc[key] = acc[key] || {};
      const a = (acc[key][stat] = acc[key][stat] || [0, 0]);
      a[0] += v; a[1] += 1;
    };
    for (const r of records) {
      if (!r.full || eligibility(r)) continue;
      for (const stat of META_ONLY) {
        const base = baselineFor(baselines, r.mode, r.hero, stat);
        if (!base) continue;
        const ratio = Math.min(RATIO_CAP, (r[STAT_FIELDS[stat]] || 0) / base);
        add("h" + r.hero, stat, ratio);
        add("all", stat, ratio);
      }
    }
    const pick = (key, stat) => {
      const a = acc[key] && acc[key][stat];
      return a && a[1] >= 3 ? a[0] / a[1] : null;
    };
    return (heroId) => {
      const o = {};
      for (const stat of META_ONLY) {
        let v = pick("h" + heroId, stat);
        if (v == null) v = pick("all", stat);
        o[stat] = v == null ? 1 : v;
      }
      return o;
    };
  }

  // ----------------------------------------------------------- progression ----

  function masteryFor(points) {
    let level = 0;
    for (let L = 1; L <= MASTERY_MAX; L++) if (points >= MASTERY_THRESHOLDS[L]) level = L;
    const maxed = level >= MASTERY_MAX;
    const floor = MASTERY_THRESHOLDS[level];
    const next = maxed ? null : MASTERY_THRESHOLDS[level + 1];
    return {
      level, title: MASTERY_TITLES[level], points, maxed,
      into: points - floor,
      span: maxed ? null : next - floor,
      toNext: maxed ? 0 : next - points,
      progress: maxed ? 1 : (points - floor) / (next - floor),
      overflow: maxed ? points - MASTERY_THRESHOLDS[MASTERY_MAX] : 0,
    };
  }

  function accountStep(level) {
    return Math.min(ACCOUNT_MAX_STEP, ACCOUNT_BASE + ACCOUNT_STEP * (level - 1));
  }

  function accountFor(points) {
    let level = 1, spent = 0;
    while (points - spent >= accountStep(level)) { spent += accountStep(level); level++; }
    const span = accountStep(level);
    return { level, points, into: points - spent, span, toNext: span - (points - spent),
      progress: (points - spent) / span };
  }

  function accountThreshold(level) { // cumulative points to reach `level`
    let s = 0;
    for (let L = 1; L < level; L++) s += accountStep(L);
    return s;
  }

  // ------------------------------------------------------------- rollups ----

  function emptyCats() {
    const c = {};
    for (const { key } of CATEGORIES) c[key] = 0;
    return c;
  }

  // Average performance per category vs the hero baseline (1 = global average).
  function addRatios(target, ratios) {
    for (const k of Object.keys(ratios)) {
      const a = (target.ratioAcc[k] = target.ratioAcc[k] || [0, 0]);
      a[0] += ratios[k]; a[1] += 1;
    }
  }
  function finishRatios(target) {
    target.ratios = {};
    for (const { key } of CATEGORIES) {
      const a = target.ratioAcc[key];
      target.ratios[key] = a && a[1] ? a[0] / a[1] : null;
    }
    delete target.ratioAcc;
  }

  function computeAll(records, baselines) {
    const sorted = records.slice().sort((a, b) => a.t - b.t);
    const est = estimateRatios(sorted, baselines);
    const scored = [];
    const heroes = {};
    const account = { points: 0, cats: emptyCats(), matches: 0, wins: 0, estimated: 0,
      skipped: { mode: 0, abandoned: 0, short: 0 }, grades: {}, ratioAcc: {} };

    for (const r of sorted) {
      const s = scoreMatch(r, baselines, r.full ? null : est(r.hero));
      scored.push({ rec: r, score: s });
      if (!s.eligible) { account.skipped[s.reason] = (account.skipped[s.reason] || 0) + 1; continue; }
      const h = (heroes[r.hero] = heroes[r.hero] ||
        { hero: r.hero, points: 0, cats: emptyCats(), matches: 0, wins: 0, estimated: 0,
          grades: {}, last: 0, best: null, history: [], ratioAcc: {} });
      for (const target of [h, account]) {
        target.points += s.points;
        target.matches += 1;
        if (r.won) target.wins += 1;
        if (s.estimated) target.estimated += 1;
        target.grades[s.grade] = (target.grades[s.grade] || 0) + 1;
        for (const k of Object.keys(s.cats)) target.cats[k] += s.cats[k];
        // Estimated stats would just echo the player's own average back, so skip them.
        const real = {};
        for (const k of Object.keys(s.ratios)) if (r.full || !["player_damage", "player_healing", "boss_damage"].includes(k)) real[k] = s.ratios[k];
        addRatios(target, real);
      }
      h.last = Math.max(h.last, r.t);
      if (!h.best || s.raw > h.best.raw) h.best = { raw: s.raw, grade: s.grade, id: r.id };
      h.history.push({ t: r.t, points: h.points });
    }
    for (const h of Object.values(heroes)) { h.mastery = masteryFor(h.points); finishRatios(h); }
    finishRatios(account);
    account.level = accountFor(account.points);
    return { scored: scored.reverse(), heroes, account };
  }

  const api = {
    WEIGHTS, CATEGORIES, LOSS_BONUS, RATIO_CAP, BASELINE_FLOOR, MIN_DURATION_S, MODE_SCALE,
    COUNTED_MATCH_MODES, GRADES, MASTERY_THRESHOLDS, MASTERY_MAX, MASTERY_TITLES,
    ACCOUNT_BASE, ACCOUNT_STEP, ACCOUNT_MAX_STEP,
    weightsFor, baselineFor, scoreMatch, gradeFor, masteryFor, accountFor, accountStep,
    accountThreshold, computeAll, eligibility,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DMScoring = api;
})(typeof window !== "undefined" ? window : globalThis);

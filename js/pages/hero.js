// Hero page: a full hero file, tinted in the hero's colours.
(function () {
  "use strict";
  const { S, state, ROMAN, ROLE_NAMES, SLOT_NAMES } = DM;
  const { esc, fmt, fmtK, fmtAvg, pct, plural, tier, isStats, gamesFor, clock, dateShort } = DM.u;
  const { heroMeta, quote, kit, buildOf } = DM.a;
  const C = DM.c, CH = DM.charts;

  function render(el, id) {
    const meta = heroMeta(id);
    const h = state.result.heroes[id];
    const hs = state.stats.heroes[id];
    const m = h ? h.mastery : S.masteryFor(0);
    const games = DM.counted(id);
    const global = state.heroMeta && state.heroMeta[id];

    el.innerHTML = `<article class="hero-page t-${tier(m.level)}" style="--hero-rgb:${meta.rgb}">
      ${banner(meta, h, hs, m)}
      <section class="panel hp-kit">
        ${C.head("The Kit", `Abilities of ${esc(meta.name)}`)}
        ${C.abilityTiles(kit(id))}
      </section>
      ${h ? `
      <div class="hp-grid">
        <section class="panel">${isStats() ? statsBlock(h, hs) : xpBlock(h)}</section>
        <section class="panel hp-style">
          ${C.head("Playstyle", "How You Play Them")}
          ${C.sigil(h.ratios, { cls: "small" })}
          ${(() => { const a = C.archetype(h.ratios); return a ? `<p class="arch center">The <b>${a.primary}</b>${a.secondary ? ` <span>· ${a.secondary}</span>` : ""}</p>` : ""; })()}
          ${metaCompare(h, hs, global)}
        </section>
      </div>
      <section class="panel">${journey(h, hs, games)}</section>
      <section class="panel">${arsenal(games, h)}</section>
      <div class="hp-grid">
        <section class="panel">${C.head("Records", "Personal Bests")}${C.bestsList(hs, "two")}</section>
        <section class="panel hp-lore">${lore(meta)}</section>
      </div>
      <section class="panel">${C.head("The Ledger", `Matches as ${esc(meta.name)}`, `<a class="btn-ghost" href="${DM.href.page("matches")}" data-hero-ledger="${id}">Open in ledger →</a>`)}
        ${DM.ledger(games.slice(0, 15), { compact: true })}</section>` : `
      <div class="hp-grid">
        <section class="panel">${C.head("Uncharted", "No games yet")}
          <p class="flavor">One average game earns Mastery I. Ten ranks wait beyond it.</p>
          ${metaCompare(null, null, global)}
        </section>
        <section class="panel hp-lore">${lore(meta)}</section>
      </div>`}
    </article>`;
  }

  function banner(meta, h, hs, m) {
    const pips = "◆".repeat(meta.complexity || 0) + "◇".repeat(Math.max(0, 3 - (meta.complexity || 0)));
    const quick = !h ? "" : isStats() && hs ? `
        <div><dt>Games</dt><dd>${hs.games}</dd></div><div><dt>Win rate</dt><dd>${pct(hs.wins / hs.games)}</dd></div>
        <div><dt>KDA</dt><dd>${hs.kda.toFixed(2)}</dd></div><div><dt>Souls / min</dt><dd>${fmtAvg(hs.line("nw").perMin)}</dd></div>` : `
        <div><dt>Games</dt><dd>${h.matches}</dd></div><div><dt>Win rate</dt><dd>${pct(h.wins / h.matches)}</dd></div>
        <div><dt>Points</dt><dd>${fmt(h.points)}</dd></div><div><dt>Best</dt><dd>${h.best ? C.seal(h.best.grade) : "–"}</dd></div>`;
    return `<header class="hp-banner">
      ${meta.bg ? `<div class="hp-bg" style="background-image:url('${esc(meta.bg)}')"></div>` : ""}
      <div class="hp-veil"></div>
      <div class="hp-content">
        <a class="crumb" href="${DM.href.page("heroes")}">‹ The roster</a>
        <div class="eyebrow">Hero file · ${esc(ROLE_NAMES[meta.type] || meta.type || "Hero")} <span class="cx" title="Complexity">${pips}</span></div>
        ${C.nameplate(meta, "hp-name")}
        <p class="flavor voice">“${esc(quote(meta, m.level))}”</p>
        ${meta.role ? `<p class="hp-role">${esc(meta.role)}</p>` : ""}
        ${meta.tags && meta.tags.length ? `<div class="chips">${meta.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="hp-rank">
          ${C.emblem(m.level, 104, "big")}
          <div class="hp-rank-text">
            <div class="sp-title"><span>Mastery ${ROMAN[m.level]}</span><span class="dot">◆</span><span>${S.MASTERY_TITLES[m.level]}</span></div>
            ${C.ladder(m.points, "lg")}${C.ladderRoman(m.level)}
            <p class="hp-next">${m.maxed
              ? `Max rank. <b>${fmt(m.points)}</b> points, <b>${fmt(m.overflow)}</b> beyond Mastery X.`
              : h ? `<b>${fmt(m.toNext)}</b> points to Mastery ${ROMAN[m.level + 1]} · ≈ ${plural(gamesFor(h, m.toNext), "game")} at your pace`
              : `Uncharted. One average game earns Mastery I.`}</p>
          </div>
        </div>
        ${quick ? `<dl class="hp-quick">${quick}</dl>` : ""}
      </div>
      <div class="hp-portrait"><div class="hp-arch">${meta.gloat || meta.card ? `<img src="${esc(meta.gloat || meta.card)}" alt="${esc(meta.name)}">` : ""}</div></div>
    </header>`;
  }

  function xpBlock(h) {
    const maxCat = Math.max(...S.CATEGORIES.map((c) => h.cats[c.key]));
    const gradeOrder = S.GRADES.map((g) => g.grade);
    const maxGrade = Math.max(1, ...gradeOrder.map((g) => h.grades[g] || 0));
    return `${C.head("Mastery XP", "Where the Points Came From")}
      <ul class="cats compact">${S.CATEGORIES.map((c, i) => `
        <li style="--i:${i}"><span class="cat-name">${c.label}</span>
          <span class="cat-bar"><span style="--w:${maxCat ? (h.cats[c.key] / maxCat * 100).toFixed(1) : 0}%"></span></span>
          <span class="cat-val">${fmt(h.cats[c.key])}</span></li>`).join("")}
      </ul>
      <h3 class="h-small spaced">Grades</h3>
      <div class="grade-hist short">${gradeOrder.map((g) => `
        <div class="gh-col ${DM.u.gradeCls(g)}"><span class="gh-n">${h.grades[g] || 0}</span>
          <span class="gh-bar"><span style="--h:${((h.grades[g] || 0) / maxGrade * 100).toFixed(1)}%"></span></span>${C.seal(g)}</div>`).join("")}
      </div>
      <p class="fine">Average ${(h.points / h.matches).toFixed(1)} points a game${h.estimated ? ` · ${h.estimated} games use estimated damage/healing/objective` : ""}.</p>`;
  }

  function statsBlock(h, hs) {
    return `${C.head("Core Stats", "Per Game, Per Minute")}${C.statTable(hs, h.ratios, true)}
      <p class="fine">Avg game ${clock(hs.avgMinutes)} · final level ${hs.level == null ? "–" : hs.level.toFixed(1)} · accuracy ${pct(hs.accuracy)} · headshots ${pct(hs.headshot)} · best streak ${hs.streak}</p>`;
  }

  // You vs the global player base on this hero (last 30 days).
  function metaCompare(h, hs, g) {
    if (!g) return `<p class="fine">Global hero stats are loading…</p>`;
    const row = (label, mine, theirs, f, invert) => {
      const max = Math.max(mine || 0, theirs || 0) * 1.15 || 1;
      const better = mine == null ? null : invert ? mine <= theirs : mine >= theirs;
      return `<div class="mc-row"><span class="mc-label">${label}</span>
        <span class="mc-bars"><span class="mc-you${better == null ? "" : better ? " up" : " down"}" style="--w:${mine == null ? 0 : (mine / max * 100).toFixed(1)}%"></span>
          <span class="mc-them" style="--w:${(theirs / max * 100).toFixed(1)}%"></span></span>
        <span class="mc-vals"><b>${mine == null ? "–" : f(mine)}</b><small>${f(theirs)}</small></span></div>`;
    };
    return `<div class="meta-compare">
      <h3 class="h-small">You vs everyone <span class="h-note">global, last 30 days</span></h3>
      <div class="mc-legend"><span><i class="you"></i>You</span><span><i class="them"></i>All players</span></div>
      ${row("Win rate", h ? h.wins / h.matches : null, g.winRate, pct)}
      ${row("Kills", hs ? hs.k : null, g.k, (v) => v.toFixed(1))}
      ${row("Deaths", hs ? hs.d : null, g.d, (v) => v.toFixed(1), true)}
      ${row("Assists", hs ? hs.a : null, g.a, (v) => v.toFixed(1))}
      ${row("Souls", hs ? hs.line("nw").avg : null, g.souls, fmtK)}
      ${row("Hero damage", hs ? hs.line("dmg").avg : null, g.dmg, fmtK)}
      <p class="fine">Picked in ${pct(g.pickRate)} of matches across ${fmt(g.matches / 1000)}k recent games.</p>
    </div>`;
  }

  function journey(h, hs, games) {
    const asc = games.slice().reverse();
    const recs = asc.map((g) => g.rec);
    const xLabel = (i) => recs[i] ? dateShort(recs[i].t) : "";
    const tip = (i) => recs[i] ? `Game ${i + 1} · ${recs[i].won ? "Win" : "Loss"} · ${recs[i].k}/${recs[i].d}/${recs[i].a} · ${dateShort(recs[i].t)}` : "";
    if (isStats()) {
      const kda = CH.rolling(recs.map((r) => (r.k + r.a) / Math.max(1, r.d)), 10, 3);
      const spm = CH.rolling(recs.map((r) => r.dur ? r.nw / (r.dur / 60) : null), 10, 3);
      return `${C.head("Trend", "Form on This Hero")}${CH.line([
        { label: "KDA (10-game avg)", values: kda, color: `rgb(${heroMeta(h.hero).rgb})`, area: true, fmt: (v) => v.toFixed(2) },
        { label: "Souls / min (10-game avg)", values: spm, color: "var(--gold)", fmt: (v) => fmt(v), axis: "right" },
      ], { xLabel, tip, height: 230 })}`;
    }
    const pts = h.history.map((p) => p.points);
    const T = S.MASTERY_THRESHOLDS;
    const yTop = Math.max(pts[pts.length - 1] || 0, T[Math.min(10, h.mastery.level + 1)]) * 1.04;
    const refs = T.slice(1).filter((t) => t <= yTop).map((t, i) => ({ value: t, label: `${ROMAN[i + 1]} · ${S.MASTERY_TITLES[i + 1]}`, cls: `t-${tier(i + 1)}` }));
    const reached = [];
    let lvl = 0;
    pts.forEach((p, i) => { while (lvl < 10 && p >= T[lvl + 1]) { lvl++; reached.push({ lvl, i, t: h.history[i].t }); } });
    return `${C.head("The Climb", "Mastery Journey")}
      ${CH.line([{ label: "Mastery points", values: pts, color: `rgb(${heroMeta(h.hero).rgb})`, area: true, fmt: (v) => fmt(v), max: yTop }],
        { xLabel, tip, height: 250, refLines: refs, markers: reached.map((r) => ({ i: r.i, label: `Mastery ${ROMAN[r.lvl]} · ${dateShort(r.t)}`, cls: `t-${tier(r.lvl)}` })) })}
      <ol class="milestones">${reached.map((r) => `<li class="t-${tier(r.lvl)}">${C.emblem(r.lvl, 34)}<span><b>${S.MASTERY_TITLES[r.lvl]}</b>${dateShort(r.t)} · game ${r.i + 1}</span></li>`).join("")}</ol>`;
  }

  // Item popularity in this player's final builds on the hero.
  function arsenal(games, h) {
    const withBuild = games.filter((g) => (g.rec.it || []).length);
    if (!withBuild.length) return `${C.head("The Arsenal", "Your Builds")}<p class="fine">No item data for these games yet.</p>`;
    const tally = new Map();
    for (const { rec } of withBuild) {
      for (const it of buildOf(rec)) {
        const t = tally.get(it.id) || { it, n: 0, w: 0, time: 0 };
        t.n++; if (rec.won) t.w++; t.time += it.t;
        tally.set(it.id, t);
      }
    }
    const heroWR = withBuild.filter((g) => g.rec.won).length / withBuild.length;
    const all = [...tally.values()].sort((a, b) => b.n - a.n);
    const core = all.slice(0, 6).sort((a, b) => a.time / a.n - b.time / b.n);
    const col = (slot) => {
      const list = all.filter((x) => x.it.slot === slot).slice(0, 6);
      return `<div class="ars-col s-${slot}"><h3 class="h-small">${SLOT_NAMES[slot]}</h3><ul class="ars-list">${list.map((x) => {
        const wr = x.w / x.n;
        return `<li>${C.itemIcon(x.it, { size: 36 })}<span class="ars-name">${esc(x.it.name)}<small>${pct(x.n / withBuild.length)} of builds · ${plural(x.n, "game")}</small></span>
          <span class="ars-wr ${wr >= heroWR ? "up" : "down"}" title="Win rate when this was in your final build">${pct(wr)}</span></li>`;
      }).join("") || `<li class="fine">None yet.</li>`}</ul></div>`;
    };
    return `${C.head("The Arsenal", "Your Builds", `<span class="h-note">${plural(withBuild.length, "build")} · win rate ${pct(heroWR)}</span>`)}
      <div class="core-build">
        <span class="cb-label">Core build<small>your six most common finishers, in buy order</small></span>
        <div class="cb-items">${core.map((x, i) => `${i ? `<i class="cb-arrow">›</i>` : ""}<span class="cb-item">${C.itemIcon(x.it, { size: 52 })}<small>${esc(x.it.name)}</small><em>~${clock(x.time / x.n / 60)}</em></span>`).join("")}</div>
      </div>
      <div class="ars-grid">${["weapon", "vitality", "spirit"].map(col).join("")}</div>
      <p class="fine">Win rate is shown green when it beats your overall ${pct(heroWR)} on ${esc(heroMeta(h.hero).name)}.</p>`;
  }

  function lore(meta) {
    if (!meta.lore && !meta.playstyle) return `${C.head("Lore", "Dossier")}<p class="fine">The archives are silent on this one.</p>`;
    const paras = String(meta.lore || "").split(/\n+|<br\s*\/?>/).map((p) => p.trim()).filter(Boolean);
    return `${C.head("Lore", `The ${esc(meta.name)} File`)}
      ${meta.playstyle ? `<p class="hp-playstyle">${esc(meta.playstyle)}</p>` : ""}
      <div class="lore-text">${paras.map((p) => `<p>${esc(p.replace(/<[^>]+>/g, ""))}</p>`).join("")}</div>`;
  }

  DM.pages = DM.pages || {};
  DM.pages.hero = render;
})();

// Ledger: the full match history with filters, plus the shared row renderer.
(function () {
  "use strict";
  const { state } = DM;
  const { esc, fmt, fmtK, pct, clock, ago, isStats, modeName, plural } = DM.u;
  const { heroMeta, buildOf } = DM.a;
  const C = DM.c;

  // Column sorting on the full ledger. Each key reads one value off a scored row.
  const SORTS = {
    t: (x) => x.rec.t, hero: (x) => heroMeta(x.rec.hero).name, mode: (x) => modeName(x.rec), res: (x) => (x.rec.won ? 1 : 0),
    kda: (x) => (x.rec.k + x.rec.a) / Math.max(1, x.rec.d), nw: (x) => x.rec.nw || 0, dmg: (x) => (x.rec.full ? x.rec.dmg : null),
    heal: (x) => (x.rec.full ? x.rec.heal : null), obj: (x) => (x.rec.full ? x.rec.obj : null), lh: (x) => x.rec.lh || 0,
    dur: (x) => x.rec.dur || 0, pts: (x) => (x.score.eligible ? x.score.points : null),
  };
  const DEFAULT_SORT = { key: "t", dir: -1 };
  function sortRows(rows) {
    const { key, dir } = state.ledgerSort || DEFAULT_SORT;
    const get = SORTS[key] || SORTS.t;
    // Rows without the value (uncounted games, no detailed stats yet) sink to the bottom either way.
    return rows.slice().sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null || vb == null) return (va == null) - (vb == null) || b.rec.t - a.rec.t;
      const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return c ? c * dir : b.rec.t - a.rec.t;
    });
  }

  // rows: scored entries ({ rec, score }) newest first.
  function ledger(rows, opts = {}) {
    const stats = isStats();
    const sort = opts.sortable ? (state.ledgerSort || DEFAULT_SORT) : null;
    // th(label, sortKey, classes): sortable headers carry data-lsort and show their direction.
    const th = (label, key, cls = "") => {
      if (!sort || !key) return `<th class="${cls}">${label}</th>`;
      const on = sort.key === key;
      return `<th class="${cls} sortable${on ? (sort.dir > 0 ? " asc" : " desc") : ""}" data-lsort="${key}" aria-sort="${on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}" title="Sort by ${label.replace(/<[^>]+>/g, "").toLowerCase()}"><button type="button">${label}</button></th>`;
    };
    const head = stats
      ? `<tr>${th("When", "t")}${th("Hero", "hero")}${th("Mode", "mode", "hide-xs")}${th("Result", "res")}${th("K / D / A", "kda", "num")}${th("Souls", "nw", "num")}
         ${th("Hero dmg", "dmg", "num")}${th("Healing", "heal", "num hide-sm")}${th("Obj dmg", "obj", "num hide-sm")}${th("LH / Dn", "lh", "num hide-md")}${th("Build", null, "hide-md")}${th("Length", "dur", "num")}</tr>`
      : `<tr>${th("When", "t")}${th("Hero", "hero")}${th("Mode", "mode", "hide-xs")}${th("Result", "res")}${th("K / D / A", "kda", "num")}${th("Souls", "nw", "num hide-sm")}
         ${th("Build", null, "hide-md")}${th("Points", "pts", "num")}${th("Grade", null, "center")}</tr>`;
    const metaCell = (r, k) => r.full ? fmtK(r[k] || 0) : '<span class="void">–</span>';
    const body = rows.map(({ rec: r, score: s }) => {
      const pts = s.eligible
        ? `+${s.points.toFixed(0)}${s.estimated ? '<sup title="Damage, healing and objective damage estimated until detailed stats arrive">≈</sup>' : ""}`
        : `<span class="void" title="Not counted">${s.reason === "mode" ? "bot / lobby" : s.reason}</span>`;
      const build = C.buildStrip(buildOf(r).slice(-6), 22);
      const tail = stats
        ? `<td class="num">${fmtK(r.nw || 0)}</td><td class="num">${metaCell(r, "dmg")}</td><td class="num hide-sm">${metaCell(r, "heal")}</td>
           <td class="num hide-sm">${metaCell(r, "obj")}</td><td class="num hide-md">${r.lh}<i class="sep">/</i>${r.dn}</td><td class="hide-md">${build}</td><td class="num when">${clock((r.dur || 0) / 60)}</td>`
        : `<td class="num hide-sm">${fmtK(r.nw || 0)}</td><td class="hide-md">${build}</td>
           <td class="num pts">${pts}</td><td class="center">${s.grade ? C.seal(s.grade) : ""}</td>`;
      return `<tr class="${r.won ? "row-win" : "row-loss"}${s.eligible ? "" : " row-void"}" data-href="${DM.href.match(r.id)}" style="--hero-rgb:${heroMeta(r.hero).rgb}">
        <td class="when">${ago(r.t)}</td>
        <td><a class="row-link" href="${DM.href.match(r.id)}">${C.heroChip(r.hero)}</a></td>
        <td class="mode hide-xs">${esc(modeName(r))}</td>
        <td class="res">${r.won ? "Victory" : "Defeat"}</td>
        <td class="num kda">${r.k}<i>/</i>${r.d}<i>/</i>${r.a}</td>
        ${tail}
      </tr>`;
    }).join("") || `<tr><td colspan="12" class="empty">Nothing in the ledger under this filter.</td></tr>`;
    return `<div class="table-wrap"><table class="ledger${opts.compact ? " tight" : ""}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function filtered() {
    const f = state.filter, hero = state.heroFilter;
    return state.result.scored.filter(({ rec: r }) =>
      (!hero || r.hero === hero) &&
      (f === "all" ? true : f === "wins" ? r.won : f === "losses" ? !r.won : f === "brawl" ? r.mode === "brawl" : f === "ranked" ? r.mm === "ranked" : r.mode === "normal"));
  }

  function render(el) {
    const rows = sortRows(filtered());
    const counted = rows.filter((x) => x.score.eligible);
    const st = DM.T.aggregate(counted.map((x) => x.rec));
    const pts = counted.reduce((s, x) => s + x.score.points, 0);
    const heroes = Object.values(state.result.heroes).sort((a, b) => b.matches - a.matches);
    const filters = [["all", "All"], ["normal", "Standard"], ["brawl", "Street Brawl"], ["ranked", "Ranked"], ["wins", "Wins"], ["losses", "Losses"]];
    el.innerHTML = `<section class="panel">
      ${C.head("The Ledger", "Match History", `
        <div class="seg" role="group" aria-label="Filter matches">${filters.map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join("")}</div>
        <label class="select"><span class="sr">Hero</span><select data-hero-filter>
          <option value="0">All heroes</option>${heroes.map((h) => `<option value="${h.hero}"${state.heroFilter === h.hero ? " selected" : ""}>${esc(heroMeta(h.hero).name)} (${h.matches})</option>`).join("")}
        </select></label>`)}
      <dl class="summary-bar">
        <div><dt>Games</dt><dd>${fmt(st.games)}${rows.length > st.games ? `<small title="Not counted: bot games, lobbies, abandons"> +${rows.length - st.games}</small>` : ""}</dd></div>
        <div><dt>Record</dt><dd>${st.wins}–${st.games - st.wins}</dd></div>
        <div><dt>Win rate</dt><dd>${pct(st.wins / Math.max(1, st.games))}</dd></div>
        <div><dt>KDA</dt><dd>${st.kda.toFixed(2)}</dd></div>
        <div><dt>Avg souls</dt><dd>${fmtK(st.line("nw").avg || 0)}</dd></div>
        <div><dt>Points</dt><dd>${fmt(pts)}</dd></div>
        <div><dt>Time</dt><dd>${(st.seconds / 3600).toFixed(1)}<small>h</small></dd></div>
      </dl>
      ${ledger(rows.slice(0, state.shown), { sortable: true })}
      ${state.shown < rows.length ? `<button class="btn-ghost wide" type="button" data-more>Turn the page · ${fmt(rows.length - state.shown)} more</button>` : ""}
    </section>`;
  }

  // Header clicks: same column flips direction, a new column starts with its natural order.
  document.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-lsort]");
    if (!th) return;
    const key = th.dataset.lsort, cur = state.ledgerSort || DEFAULT_SORT;
    const natural = key === "hero" || key === "mode" ? 1 : -1;
    state.ledgerSort = cur.key === key ? { key, dir: -cur.dir } : { key, dir: natural };
    state.shown = Math.max(state.shown, 30);
    DM.rerender();
  });

  DM.ledger = ledger;
  DM.pages = DM.pages || {};
  DM.pages.matches = render;
})();

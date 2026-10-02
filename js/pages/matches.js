// Ledger: the full match history with filters, plus the shared row renderer.
(function () {
  "use strict";
  const { state } = DM;
  const { esc, fmt, fmtK, pct, clock, ago, isStats, modeName, plural } = DM.u;
  const { heroMeta, buildOf } = DM.a;
  const C = DM.c;

  // rows: scored entries ({ rec, score }) newest first.
  function ledger(rows, opts = {}) {
    const stats = isStats();
    const head = stats
      ? `<tr><th>When</th><th>Hero</th><th class="hide-xs">Mode</th><th>Result</th><th class="num">K / D / A</th><th class="num">Souls</th>
         <th class="num">Hero dmg</th><th class="num hide-sm">Healing</th><th class="num hide-sm">Obj dmg</th><th class="num hide-md">LH / Dn</th><th class="hide-md">Build</th><th class="num">Length</th></tr>`
      : `<tr><th>When</th><th>Hero</th><th class="hide-xs">Mode</th><th>Result</th><th class="num">K / D / A</th><th class="num hide-sm">Souls</th>
         <th class="hide-md">Build</th><th class="num">Points</th><th class="center">Grade</th></tr>`;
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
    const rows = filtered();
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
      ${ledger(rows.slice(0, state.shown))}
      ${state.shown < rows.length ? `<button class="btn-ghost wide" type="button" data-more>Turn the page · ${fmt(rows.length - state.shown)} more</button>` : ""}
    </section>`;
  }

  DM.ledger = ledger;
  DM.pages = DM.pages || {};
  DM.pages.matches = render;
})();

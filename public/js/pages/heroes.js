// Heroes page: the tarot grid, rank distribution, sorting and role filters.
(function () {
  "use strict";
  const { S, state, ROMAN, ROLE_NAMES } = DM;
  const { esc, fmt, fmtK, fmtAvg, pct, tier, isStats } = DM.u;
  const { heroMeta } = DM.a;
  const C = DM.c;

  function heroList() {
    const played = state.result.heroes;
    const list = Object.values(played).map((h) => ({ h, meta: heroMeta(h.hero) }));
    if (state.showUncharted) for (const hero of state.heroes) if (!played[hero.id]) list.push({ h: null, meta: hero });
    const role = state.role, q = (state.heroQuery || "").trim().toLowerCase();
    const out = list.filter((x) => (role === "all" || x.meta.type === role) && (!q || x.meta.name.toLowerCase().includes(q)));
    out.sort((x, y) => {
      if (!x.h || !y.h) return (x.h ? -1 : y.h ? 1 : x.meta.name.localeCompare(y.meta.name));
      if (state.sort === "recent") return y.h.last - x.h.last;
      if (state.sort === "games") return y.h.matches - x.h.matches;
      if (state.sort === "name") return x.meta.name.localeCompare(y.meta.name);
      if (state.sort === "winrate") return y.h.wins / y.h.matches - x.h.wins / x.h.matches || y.h.matches - x.h.matches;
      return y.h.points - x.h.points;
    });
    return out;
  }

  function card({ h, meta }, i) {
    const m = h ? h.mastery : S.masteryFor(0);
    const hs = h && isStats() ? state.stats.heroes[h.hero] : null;
    const sub = hs ? `${hs.k.toFixed(1)} / ${hs.d.toFixed(1)} / ${hs.a.toFixed(1)} avg K/D/A`
      : !h ? "Uncharted" : m.maxed ? `+${fmt(m.overflow)} beyond X` : `${fmt(m.into)} / ${fmt(m.span)} to ${ROMAN[m.level + 1]}`;
    const foot = hs ? `<span>${hs.kda.toFixed(2)} KDA</span><span>${fmtAvg(hs.line("dmg").avg)} dmg</span><span>${fmtAvg(hs.line("nw").perMin)}/m</span>`
      : h ? `<span>${h.matches} game${h.matches === 1 ? "" : "s"}</span><span>${pct(h.wins / h.matches)} WR</span><span>${fmtK(h.points)} pts</span>` : "";
    return `<a class="tcard t-${tier(m.level)}${h ? "" : " unplayed"}${m.maxed ? " maxed" : ""}" href="${DM.href.hero(meta.id)}" data-name="${esc(meta.name.toLowerCase())}" style="--hero-rgb:${meta.rgb};--i:${Math.min(i, 24)}">
      <span class="tc-art">
        ${meta.card ? `<img src="${esc(meta.card)}" alt="" loading="lazy">` : ""}
        ${meta.gloat && h ? `<img class="tc-gloat" src="${esc(meta.gloat)}" alt="" loading="lazy">` : ""}
      </span>
      <span class="tc-foil"></span><span class="tc-sheen"></span><span class="tc-frame"></span>
      <span class="tc-emblem">${C.emblem(m.level, 60)}</span>
      <span class="tc-body">
        <span class="tc-name">${esc(meta.name)}</span>
        <span class="tc-title">${S.MASTERY_TITLES[m.level]}</span>
        ${C.ladder(m.points)}
        <span class="tc-sub">${sub}</span>
        ${foot ? `<span class="tc-foot">${foot}</span>` : ""}
      </span>
    </a>`;
  }

  function render(el) {
    const heroes = Object.values(state.result.heroes);
    const counts = new Array(11).fill(0);
    for (const h of heroes) counts[h.mastery.level]++;
    const roles = [...new Set(state.heroes.map((h) => h.type).filter(Boolean))].sort();
    const sorts = [["points", "Mastery"], ["games", "Games"], ["winrate", "Win rate"], ["recent", "Recent"], ["name", "A–Z"]];
    el.innerHTML = `<section class="panel">
      ${C.head("The Roster", "Hero Mastery", `
        <label class="find"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5"/></svg>
          <input type="search" data-hero-search placeholder="Find a hero" aria-label="Find a hero" value="${esc(state.heroQuery || "")}" autocomplete="off"></label>
        <div class="seg" role="group" aria-label="Sort heroes">${sorts.map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${state.sort === k}">${l}</button>`).join("")}</div>
        <label class="toggle"><input type="checkbox" data-uncharted${state.showUncharted ? " checked" : ""}><span class="tg-track"><span class="tg-knob"></span></span>Uncharted</label>`)}
      <div class="rank-strip">${counts.slice(1).map((n, i) => `
        <div class="rs-step${n ? " held" : ""}">${C.emblem(i + 1, 46)}<b>${n}</b><span>${S.MASTERY_TITLES[i + 1]}</span></div>`).join("")}
        <div class="rs-total"><b>${heroes.length}</b><span>of ${state.heroes.length} heroes played</span><b>${heroes.reduce((s, h) => s + h.mastery.level, 0)}</b><span>mastery sum</span></div>
      </div>
      <div class="role-tabs" role="group" aria-label="Filter by role">
        ${["all", ...roles].map((r) => `<button type="button" data-role="${r}" aria-pressed="${state.role === r}">${r === "all" ? "All roles" : esc(ROLE_NAMES[r] || r)}</button>`).join("")}
      </div>
      <div class="hero-grid${state.animate ? " intro" : ""}" id="hero-grid">${heroList().map(card).join("")}<p class="fine grid-empty" hidden>No hero by that name${state.role === "all" ? "" : " in this role"}.</p></div>
    </section>`;
  }

  // Typing filters the dealt cards in place (no re-render, so the field keeps focus).
  document.addEventListener("input", (e) => {
    if (!e.target.matches("[data-hero-search]")) return;
    state.heroQuery = e.target.value;
    const q = state.heroQuery.trim().toLowerCase();
    let shown = 0;
    for (const c of document.querySelectorAll("#hero-grid .tcard")) { const hit = !q || c.dataset.name.includes(q); c.hidden = !hit; if (hit) shown++; }
    const empty = document.querySelector("#hero-grid .grid-empty");
    if (empty) empty.hidden = shown > 0;
  });

  DM.pages = DM.pages || {};
  DM.pages.heroes = render;
  DM.heroCard = card;
})();

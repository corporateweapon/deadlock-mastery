// Ladders page: Valve's official North America leaderboards (overall + per hero), and where the
// current player stands - on the official board, and among every player via the server's scoreboard search.
(function () {
  "use strict";
  const { state, store, ROMAN } = DM;
  const { esc, fmt, pct } = DM.u;
  const { heroMeta, rankFor } = DM.a;
  const C = DM.c;

  const REGION = "NAmerica";
  const METRICS = [
    ["matches", "Games played"], ["wins", "Wins"], ["winrate", "Win rate"],
    ["avg_kills_per_match", "Kills / game"], ["avg_player_damage_per_match", "Damage / game"], ["avg_net_worth_per_match", "Souls / game"],
  ];
  const boards = new Map();    // "all" | heroId -> board
  const positions = new Map(); // key -> result | Promise

  // Official board: via the server (adds rank badges, cached) or straight from deadlock-api.
  async function loadBoard(heroId) {
    const key = heroId || "all";
    if (boards.has(key)) return boards.get(key);
    let board;
    if (state.server) {
      const r = await fetch(`/api/ladder/official?region=${REGION}${heroId ? `&hero=${heroId}` : ""}`);
      if (!r.ok) throw new Error("The ladder service is busy. Try again in a minute.");
      board = await r.json();
    } else {
      const lb = await DM.D.getJSON(`/v1/leaderboard/${REGION}${heroId ? "/" + heroId : ""}`);
      const entries = (lb.entries || []).map((e) => ({ rank: e.rank, name: e.account_name, ids: e.possible_account_ids || [], heroes: e.top_hero_ids || [] }));
      board = { region: REGION, hero: heroId, total: entries.length, entries };
    }
    boards.set(key, board);
    return board;
  }

  // Server-side scoreboard position (all regions). Returns null when no server.
  function loadPosition(heroId, metric, badge) {
    if (!state.server) return Promise.resolve(null);
    const key = `${state.accountId}:${heroId || 0}:${metric}:${badge || 0}`;
    if (!positions.has(key)) {
      positions.set(key, fetch(`/api/ladder/position?account=${state.accountId}&metric=${metric}${heroId ? `&hero=${heroId}` : ""}${badge ? `&badge=${badge}` : ""}`)
        .then((r) => (r.ok ? r.json() : r.status === 429 ? { limited: true } : null)).catch(() => null)
        .then((res) => { if (!res || res.limited) positions.delete(key); return res; })); // let a retry happen later
    }
    return positions.get(key);
  }

  // "top 0.42%" / "top 3.1%" / "top 74%"
  const topLabel = (f) => { const p = f * 100; return `${p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : Math.round(p)}%`; };

  const myBadge = () => {
    const r = [...state.records.values()].filter((x) => x.badge).sort((a, b) => b.t - a.t)[0];
    return (r && r.badge) || (state.rank && state.rank.badge) || null;
  };

  function render(el, heroId) {
    heroId = heroId || null;
    const meta = heroId ? heroMeta(heroId) : null;
    const played = state.result.heroes;
    const heroes = state.heroes.slice().sort((a, b) => ((played[b.id] || {}).matches || 0) - ((played[a.id] || {}).matches || 0) || a.name.localeCompare(b.name));
    el.innerHTML = `<article class="ladder-page"${meta ? ` style="--hero-rgb:${meta.rgb}"` : ""}>
      <section class="panel">
        ${C.head("North America", meta ? `The ${esc(meta.name)} Ladder` : "The Ranked Ladder")}
        <nav class="hero-pick" aria-label="Choose a ladder">
          <a class="hp-all${heroId ? "" : " on"}" href="${DM.href.page("ladder")}"><span>All</span></a>
          ${heroes.map((h) => `<a class="${h.id === heroId ? "on" : ""}${played[h.id] ? " played" : ""}" href="${DM.href.page("ladder")}/${h.id}" title="${esc(h.name)}" style="--hero-rgb:${h.rgb}">
            ${h.small ? `<img src="${esc(h.small)}" alt="${esc(h.name)}" loading="lazy">` : esc(h.name)}</a>`).join("")}
        </nav>
      </section>
      <section class="panel standing" id="standing">${standingShell(heroId)}</section>
      <section class="panel" id="board"><p class="loading-line">Reading the board…</p></section>
    </article>`;
    fillBoard(heroId);
    fillStanding(heroId);
  }

  function standingShell(heroId) {
    const name = (state.profile && state.profile.personaname) || `Player ${state.accountId}`;
    const r = rankFor(myBadge());
    const metrics = METRICS.map(([k, l]) => `<div class="pos-card" data-metric="${k}"><span class="pc-label">${l}</span><b class="pc-pos">…</b><span class="pc-sub">&nbsp;</span><span class="pc-bar"><span></span></span></div>`).join("");
    return `${C.head("Your standing", esc(name))}
      <div class="stand-top">
        <div class="stand-rank">${C.rankBadge(r, 72)}<span><small>Current rank</small><b>${r ? `${esc(r.name)} ${ROMAN[r.sub] || ""}` : "Unranked"}</b></span></div>
        <div class="stand-official" id="stand-official"><small>Official NA ${heroId ? "hero " : ""}ladder</small><b>…</b></div>
      </div>
      ${state.server ? `<h3 class="h-small spaced">Among every ${heroId ? esc(heroMeta(heroId).name) + " " : ""}player <span class="h-note">all regions; Valve doesn't publish region for every player</span></h3>
        <div class="pos-grid">${metrics}</div>
        ${r ? `<h3 class="h-small spaced">In your rank bracket <span class="h-note">games where the lobby averaged ${esc(r.name)}</span></h3>
          <div class="pos-grid" id="bracket-grid">${METRICS.slice(0, 3).map(([k, l]) => `<div class="pos-card" data-metric="${k}" data-bracket="1"><span class="pc-label">${l}</span><b class="pc-pos">…</b><span class="pc-sub">&nbsp;</span><span class="pc-bar"><span></span></span></div>`).join("")}</div>`
          : `<p class="fine">Play ranked to unlock rank-bracket ladders: we compare you against players at your rank once you have one.</p>`}`
      : `<p class="fine">Player-wide positions (your spot among every player) need the full site with its ladder service.</p>`}`;
  }

  async function fillBoard(heroId) {
    const el = document.getElementById("board");
    let board;
    try { board = await loadBoard(heroId); } catch (e) { if (el) el.innerHTML = `<p class="fine">${esc(e.message)}</p>`; return; }
    if (!document.getElementById("board") || state.route.page !== "ladder" || (state.route.arg || null) !== heroId) return;
    const mine = board.entries.find((e) => e.ids.includes(state.accountId));
    const shown = board.entries.slice(0, state.ladderShown || 100);
    el.innerHTML = `${C.head(`Valve · updated hourly`, `Top ${fmt(board.total)}`, `<span class="h-note">${heroId ? "Hero leaderboard" : "Ranked leaderboard"} · North America</span>`)}
      <div class="table-wrap"><table class="ladder-table"><thead><tr><th class="num">#</th><th>Player</th><th>Rank</th><th class="hide-xs">Top heroes</th><th></th></tr></thead><tbody>
      ${shown.map((e) => {
        const r = rankFor(e.badge);
        const single = e.ids.length === 1 ? e.ids[0] : null;
        return `<tr class="${e === mine ? "me" : ""}${e.rank <= 3 ? " podium p" + e.rank : ""}">
          <td class="num lt-rank">${e.rank <= 3 ? `<span class="medal"><i>${e.rank}</i></span>` : e.rank}</td>
          <td class="lt-name">${single ? `<a href="#${single}">${esc(e.name)}</a>` : `<span title="Valve lists ${e.ids.length} possible accounts for this name">${esc(e.name)}</span>`}</td>
          <td>${r ? `<span class="rank-line">${C.rankBadge(r, 26)}${esc(r.name)} ${ROMAN[r.sub] || ""}</span>` : `<span class="void">–</span>`}</td>
          <td class="hide-xs">${e.heroes.slice(0, 3).map((h) => C.heroChip(h, { noName: true })).join("")}</td>
          <td class="center">${single && single !== state.accountId ? `<a class="pp-cmp" href="${DM.href.compare(single)}" title="Compare with ${esc(e.name)}">⇄</a>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div>
      ${board.entries.length > shown.length ? `<button class="btn-ghost wide" type="button" data-ladder-more>Show more · ${fmt(board.entries.length - shown.length)} left</button>` : ""}`;
    const off = document.getElementById("stand-official");
    if (off) off.innerHTML = `<small>Official NA ${heroId ? "hero " : ""}ladder</small>${mine
      ? `<b>#${fmt(mine.rank)}</b><span>of ${fmt(board.total)}</span>`
      : `<b class="dim">Not listed</b><span>Valve publishes the top ${fmt(board.total)} ${heroId ? "players on this hero" : "ranked players"}</span>`}`;
  }

  async function fillStanding(heroId) {
    if (!state.server) return;
    const badge = myBadge();
    const cards = [...document.querySelectorAll("#standing .pos-card")];
    // Two at a time: the ladder search is request-heavy and deadlock-api rate-limits bursts.
    const queue = cards.slice();
    const fillOne = async (card) => {
      const res = await loadPosition(heroId, card.dataset.metric, card.dataset.bracket ? badge : null);
      if (!card.isConnected) return;
      const pos = card.querySelector(".pc-pos"), sub = card.querySelector(".pc-sub"), bar = card.querySelector(".pc-bar > span");
      if (!res) { pos.textContent = "–"; sub.textContent = "unavailable right now"; return; }
      if (res.limited) { pos.textContent = "–"; sub.textContent = "busy: refresh in a minute"; return; }
      if (!res.qualified) { pos.textContent = "–"; pos.classList.add("dim"); sub.textContent = `needs ${res.min}+ games`; return; }
      const topPct = res.top * 100;
      pos.textContent = `#${fmt(res.position)}`;
      sub.textContent = `of ${fmt(res.total)} · top ${topLabel(res.top)}`;
      card.classList.add(topPct <= 1 ? "elite" : topPct <= 10 ? "great" : topPct <= 50 ? "good" : "low");
      bar.style.setProperty("--w", `${Math.max(2, 100 - topPct).toFixed(1)}%`);
    };
    const worker = async () => { while (queue.length) await fillOne(queue.shift()); };
    await Promise.all([worker(), worker()]);
  }

  // Compact standing strip for the hero page.
  DM.heroStanding = async function (el, heroId) {
    if (!el) return;
    const meta = heroMeta(heroId);
    el.innerHTML = `<div class="hs-row"><span class="hs-label">On the ladder</span>
      <span class="hs-item" data-k="official"><small>NA ${esc(meta.name)} board</small><b>…</b></span>
      ${state.server ? `<span class="hs-item" data-k="matches"><small>By games, all players</small><b>…</b></span>
      <span class="hs-item" data-k="winrate"><small>By win rate</small><b>…</b></span>` : ""}
      <a class="btn-ghost" href="${DM.href.page("ladder")}/${heroId}">${esc(meta.name)} ladder →</a></div>`;
    const set = (k, html) => { const n = el.querySelector(`[data-k="${k}"] b`); if (n) n.innerHTML = html; };
    loadBoard(heroId).then((b) => {
      const mine = b.entries.find((e) => e.ids.includes(state.accountId));
      set("official", mine ? `#${fmt(mine.rank)} <em>of ${fmt(b.total)}</em>` : `<span class="dim">not in top ${fmt(b.total)}</span>`);
    }).catch(() => set("official", "–"));
    for (const k of ["matches", "winrate"]) {
      loadPosition(heroId, k).then((r) => set(k, !r || r.limited ? "–" : !r.qualified ? `<span class="dim">needs ${r.min}+ games</span>`
        : `#${fmt(r.position)} <em>top ${topLabel(r.top)}</em>`));
    }
  };

  DM.pages = DM.pages || {};
  DM.pages.ladder = render;
})();

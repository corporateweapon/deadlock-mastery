// Compare page: two dossiers head to head - tale of the tape, playstyles, the climb,
// shared heroes, and every game the two of you played together or against each other.
(function () {
  "use strict";
  const { S, state, ROMAN } = DM;
  const { esc, fmt, fmtK, fmtAvg, pct, plural, tier, dateShort, ago } = DM.u;
  const { heroMeta, rankFor } = DM.a;
  const C = DM.c, CH = DM.charts;
  const COL_A = "var(--gold)", COL_B = "var(--rival)";

  async function render(el, otherId) {
    if (!otherId) return picker(el);
    if (otherId === state.accountId) {
      el.innerHTML = `<section class="panel">${C.head("Head to Head", "That's you")}<p class="fine">Pick someone else to compare against.</p>
        <p><a class="btn-ghost" href="${DM.href.compare()}">‹ Choose a rival</a></p></section>`;
      return;
    }
    const me = await DM.loadBundle(state.accountId);
    let them;
    try {
      them = await DM.loadBundle(otherId, (msg) => {
        const p = el.querySelector(".loader p");
        if (p) p.textContent = msg;
        else el.innerHTML = `<div class="loader"><p>${esc(msg)}</p></div>`;
      });
    } catch (e) {
      el.innerHTML = `<section class="panel">${C.head("Head to Head", "Couldn't open that dossier")}<p class="fine">${esc(e.message)}</p>
        <p><a class="btn-ghost" href="${DM.href.compare()}">‹ Choose someone else</a></p></section>`;
      return;
    }
    if (state.route.page !== "compare" || state.route.arg !== otherId) return; // navigated away meanwhile
    el.innerHTML = page(me, them);
  }

  // ------------------------------------------------------------------ picker
  async function picker(el) {
    const c = state.company;
    const mates = c && c.mates ? c.mates : null;
    el.innerHTML = `<section class="panel">
      ${C.head("Head to Head", "Pick a Rival")}
      <form class="cmp-find" data-compare-find autocomplete="off">
        <input type="text" name="q" placeholder="SteamID, profile link or player name" aria-label="Player to compare">
        <button class="btn-gold" type="submit">Compare</button>
      </form>
      <div class="cmp-hits" id="cmp-hits"></div>
      <h3 class="h-small spaced">Your associates <span class="h-note">the players you queue with most</span></h3>
      ${mates ? `<div class="cmp-mates">${mates.map((m) => {
        const p = state.profiles.get(m.id) || {};
        return `<a class="cmp-mate" href="${DM.href.compare(m.id)}">
          <span class="pp-av">${p.avatarmedium ? `<img src="${esc(p.avatarmedium)}" alt="">` : ""}</span>
          <span class="pp-name"><b>${esc(p.personaname || `Player ${m.id}`)}</b><small>${plural(m.games, "game")} together · ${pct(m.wins / Math.max(1, m.games))} won</small></span>
          <span class="cmp-go">⇄</span></a>`;
      }).join("")}</div>` : `<p class="loading-line">Asking around the Cursed Apple…</p>`}
    </section>`;
    if (!mates) {
      await DM.loadCompany();
      if (state.route.page === "compare" && !state.route.arg) picker(el);
    }
  }

  DM.compareSearch = async function (form) {
    const q = form.q.value;
    const box = document.getElementById("cmp-hits");
    const p = DM.D.parseSteamInput(q);
    if (p.error) { box.innerHTML = `<p class="fine">${esc(p.error)}</p>`; return; }
    if (p.accountId) { location.hash = DM.href.compare(p.accountId); return; }
    box.innerHTML = `<p class="loading-line">Searching for “${esc(p.search)}”…</p>`;
    try {
      const hits = await DM.D.searchProfiles(p.search);
      box.innerHTML = hits.length ? `<div class="cmp-mates">${hits.map((h) => `<a class="cmp-mate" href="${DM.href.compare(h.account_id)}">
          <span class="pp-av"><img src="${esc(h.avatar)}" alt=""></span><span class="pp-name"><b>${esc(h.personaname)}</b><small>${h.account_id}</small></span><span class="cmp-go">⇄</span></a>`).join("")}</div>`
        : `<p class="fine">No Deadlock players match “${esc(p.search)}”.</p>`;
    } catch (e) { box.innerHTML = `<p class="fine">${esc(e.message)}</p>`; }
  };

  // -------------------------------------------------------------------- page
  function page(A, B) {
    const rows = tapeRows(A, B);
    const winsA = rows.filter((r) => r.win === "a").length, winsB = rows.filter((r) => r.win === "b").length;
    return `<div class="compare-page">
      <section class="panel cmp-head">
        ${C.head("Head to Head", "The Comparison", `
          <a class="btn-ghost" href="#${B.id}/compare/${A.id}" title="Open from their side">⇄ Swap sides</a>
          <a class="btn-ghost" href="${DM.href.compare()}">Change rival</a>`)}
        <div class="cmp-duel">
          ${card(A, "a")}
          <div class="cmp-vs">
            <span class="vs-word">vs</span>
            <span class="vs-score"><b class="a">${winsA}</b><i>–</i><b class="b">${winsB}</b></span>
            <span class="vs-cap">categories won</span>
          </div>
          ${card(B, "b")}
        </div>
      </section>
      <section class="panel">${C.head("By the Numbers", "Tale of the Tape")}
        <div class="tape">${rows.map(tapeRow).join("")}</div>
        <p class="fine">The brighter bar takes the category. Per-game damage, healing and objective stats only use games with detailed stats.</p>
      </section>
      <div class="hp-grid">
        <section class="panel">${C.head("Playstyle", "Two Styles, One Sigil")}
          ${C.sigil(A.result.account.ratios, { compare: B.result.account.ratios, cls: "duo" })}
          <div class="duo-legend">${[A, B].map((x, i) => {
            const a = C.archetype(x.result.account.ratios);
            return `<span class="${i ? "b" : "a"}"><i></i>${esc(nameOf(x))}${a ? ` · <b>The ${a.primary}</b>` : ""}</span>`;
          }).join("")}</div>
        </section>
        <section class="panel">${together(A, B)}</section>
      </div>
      <section class="panel">${climb(A, B)}</section>
      <section class="panel">${sharedHeroes(A, B)}</section>
    </div>`;
  }

  const nameOf = (b) => (b.profile && b.profile.personaname) || `Player ${b.id}`;
  const masterySum = (b) => Object.values(b.result.heroes).reduce((s, h) => s + h.mastery.level, 0);
  const topHero = (b) => Object.values(b.result.heroes).sort((x, y) => y.points - x.points)[0];
  const rankOf = (b) => {
    const r = [...b.records.values()].filter((x) => x.badge).sort((x, y) => y.t - x.t)[0];
    return rankFor(r && r.badge);
  };

  function card(b, side) {
    const p = b.profile || {}, a = b.result.account, st = b.stats.account;
    const top = topHero(b), rank = rankOf(b), arch = C.archetype(a.ratios);
    const tm = top ? heroMeta(top.hero) : null;
    return `<div class="cmp-card ${side}"${tm ? ` style="--hero-rgb:${tm.rgb}"` : ""}>
      ${tm && tm.bg ? `<div class="cc-bg" style="background-image:url('${esc(tm.bg)}')"></div>` : ""}
      <div class="cc-body">
        <div class="avatar-frame">${p.avatarfull ? `<img src="${esc(p.avatarfull)}" alt="">` : ""}</div>
        <h2><a href="#${b.id}">${esc(nameOf(b))}</a></h2>
        <div class="cc-tags">
          <span class="rank-line">${C.rankBadge(rank, 24)}${rank ? `${esc(rank.name)} ${ROMAN[rank.sub] || ""}` : "Unranked"}</span>
          ${arch ? `<span class="arch">The <b>${arch.primary}</b></span>` : ""}
        </div>
        <div class="cc-level"><span>Account level</span><b>${a.level.level}</b><span>${fmt(a.points)} pts</span></div>
        ${top ? `<div class="cc-top">${C.emblem(top.mastery.level, 52)}<span><small>Signature</small><b>${esc(tm.name)}</b><em>Mastery ${ROMAN[top.mastery.level]} · ${top.matches} games</em></span></div>` : ""}
        <div class="cc-mini"><span><b>${st.games}</b> games</span><span><b>${pct(st.wins / Math.max(1, st.games))}</b> WR</span><span><b>${st.kda.toFixed(2)}</b> KDA</span></div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ tale of tape
  function tapeRows(A, B) {
    const defs = [
      ["Account level", (b) => b.result.account.level.level, (v) => fmt(v)],
      ["Lifetime points", (b) => b.result.account.points, fmtK],
      ["Games counted", (b) => b.result.account.matches, (v) => fmt(v)],
      ["Win rate", (b) => b.result.account.wins / Math.max(1, b.result.account.matches), pct],
      ["Points per game", (b) => b.result.account.points / Math.max(1, b.result.account.matches), (v) => v.toFixed(1)],
      ["KDA", (b) => b.stats.account.kda, (v) => v.toFixed(2)],
      ["Kills per game", (b) => b.stats.account.k, (v) => v.toFixed(1)],
      ["Deaths per game", (b) => b.stats.account.d, (v) => v.toFixed(1), true],
      ["Assists per game", (b) => b.stats.account.a, (v) => v.toFixed(1)],
      ["Souls per minute", (b) => b.stats.account.line("nw").perMin, (v) => fmt(v)],
      ["Hero damage per game", (b) => b.stats.account.line("dmg").avg, fmtAvg],
      ["Healing per game", (b) => b.stats.account.line("heal").avg, fmtAvg],
      ["Objective damage per game", (b) => b.stats.account.line("obj").avg, fmtAvg],
      ["Hero accuracy", (b) => b.stats.account.accuracy, pct],
      ["Mastery sum", masterySum, (v) => fmt(v)],
      ["Heroes played", (b) => Object.keys(b.result.heroes).length, (v) => fmt(v)],
      ["Hours played", (b) => b.stats.account.seconds / 3600, (v) => fmt(v)],
      ["Best win streak", (b) => b.stats.account.streak, (v) => fmt(v)],
    ];
    return defs.map(([label, get, f, lower]) => {
      const a = get(A), b = get(B);
      const ok = (v) => v != null && isFinite(v);
      let win = null;
      if (ok(a) && ok(b) && a !== b) win = (lower ? a < b : a > b) ? "a" : "b";
      const max = Math.max(ok(a) ? a : 0, ok(b) ? b : 0) || 1;
      return { label, a, b, f, win, wa: ok(a) ? a / max : 0, wb: ok(b) ? b / max : 0, lower };
    });
  }

  const tapeRow = (r, i) => `<div class="tape-row" style="--i:${i}">
      <span class="tv a${r.win === "a" ? " win" : ""}">${r.a == null || !isFinite(r.a) ? "–" : r.f(r.a)}</span>
      <span class="tb a${r.win === "a" ? " win" : ""}"><span style="--w:${(r.wa * 100).toFixed(1)}%"></span></span>
      <span class="tl">${r.label}${r.lower ? ` <small>lower is better</small>` : ""}</span>
      <span class="tb b${r.win === "b" ? " win" : ""}"><span style="--w:${(r.wb * 100).toFixed(1)}%"></span></span>
      <span class="tv b${r.win === "b" ? " win" : ""}">${r.b == null || !isFinite(r.b) ? "–" : r.f(r.b)}</span>
    </div>`;

  // ------------------------------------------------------- together / against
  function together(A, B) {
    const shared = [];
    for (const [id, ra] of A.records) {
      const rb = B.records.get(id);
      if (rb) shared.push({ id, ra, rb, same: ra.won === rb.won });
    }
    shared.sort((x, y) => y.ra.t - x.ra.t);
    const tog = shared.filter((x) => x.same), vs = shared.filter((x) => !x.same);
    const togW = tog.filter((x) => x.ra.won).length, vsW = vs.filter((x) => x.ra.won).length;
    if (!shared.length) return `${C.head("Crossed Paths", "Together &amp; Against")}<p class="flavor">Your paths have never crossed in a recorded match.</p>`;
    return `${C.head("Crossed Paths", "Together &amp; Against")}
      <div class="vs-cards">
        <div class="vs-card"><span class="vc-label">Same team</span><b>${tog.length}</b><span class="vc-sub">${tog.length ? `${pct(togW / tog.length)} won together` : "never teamed up"}</span>
          <span class="vc-bar"><span style="--w:${tog.length ? (togW / tog.length * 100).toFixed(1) : 0}%"></span></span></div>
        <div class="vs-card"><span class="vc-label">Opposite sides</span><b>${vs.length}</b><span class="vc-sub">${vs.length ? `${esc(nameOf(A))} won ${vsW} of ${vs.length}` : "never faced off"}</span>
          <span class="vc-bar"><span style="--w:${vs.length ? (vsW / vs.length * 100).toFixed(1) : 0}%"></span></span></div>
      </div>
      <h3 class="h-small spaced">Most recent</h3>
      <ul class="shared">${shared.slice(0, 7).map((x) => `<li><a href="${DM.href.match(x.id)}">
        <span class="sh-when">${ago(x.ra.t)}</span>
        ${C.heroChip(x.ra.hero)}<span class="sh-rel ${x.same ? "with" : "against"}">${x.same ? "with" : "vs"}</span>${C.heroChip(x.rb.hero)}
        <span class="sh-res ${x.ra.won ? "up" : "down"}">${x.ra.won ? "Win" : "Loss"}</span></a></li>`).join("")}</ul>`;
  }

  // ------------------------------------------------------------------ climb
  function climb(A, B) {
    const games = (b) => b.result.scored.filter((x) => x.score.eligible);
    const all = [...games(A), ...games(B)];
    if (!all.length) return "";
    const first = new Date(Math.min(...all.map((x) => x.rec.t)) * 1000);
    const months = [];
    for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= new Date(); d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
    const series = (b) => {
      const per = new Array(months.length).fill(0);
      for (const x of games(b)) {
        const d = new Date(x.rec.t * 1000);
        const i = (d.getFullYear() - months[0].getFullYear()) * 12 + d.getMonth() - months[0].getMonth();
        if (i >= 0 && i < per.length) per[i] += x.score.points;
      }
      let cum = 0;
      return per.map((v) => (cum += v));
    };
    const label = (i) => months[i] ? months[i].toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : "";
    return `${C.head("The Climb", "Lifetime Points, Month by Month")}
      ${CH.line([
        { label: nameOf(A), values: series(A), color: COL_A, area: true, fmt: fmtK },
        { label: nameOf(B), values: series(B), color: COL_B, area: true, fmt: fmtK },
      ], { xLabel: label, tip: label, height: 240, legend: true })}`;
  }

  // ----------------------------------------------------------- shared heroes
  function sharedHeroes(A, B) {
    const ids = Object.keys(A.result.heroes).filter((id) => B.result.heroes[id]);
    const side = (h, cls) => `<span class="sh-side ${cls}">${C.emblem(h.mastery.level, 34)}
      <span><b>${S.MASTERY_TITLES[h.mastery.level]}</b><small>${h.matches} games · ${pct(h.wins / h.matches)} WR · ${fmtK(h.points)} pts</small></span></span>`;
    const rows = ids.map((id) => ({ id, a: A.result.heroes[id], b: B.result.heroes[id] }))
      .sort((x, y) => (y.a.matches + y.b.matches) - (x.a.matches + x.b.matches)).slice(0, 12);
    return `${C.head("Common Ground", "Heroes You Both Play", `<span class="h-note">${plural(ids.length, "hero")} in common</span>`)}
      ${rows.length ? `<div class="shared-heroes">${rows.map((r) => {
        const m = heroMeta(r.id);
        const lead = r.a.mastery.points === r.b.mastery.points ? "" : r.a.mastery.points > r.b.mastery.points ? "a" : "b";
        return `<div class="shh-row lead-${lead}" style="--hero-rgb:${m.rgb}">
          ${side(r.a, "a")}
          <a class="shh-hero" href="${DM.href.hero(r.id)}">${m.small ? `<img src="${esc(m.small)}" alt="">` : ""}<b>${esc(m.name)}</b></a>
          ${side(r.b, "b")}
        </div>`;
      }).join("")}</div>` : `<p class="fine">No heroes in common yet.</p>`}`;
  }

  DM.pages = DM.pages || {};
  DM.pages.compare = render;
})();

// Overview page: dossier, signature hero, form, activity, hero pool, company, recent games.
(function () {
  "use strict";
  const { S, T, state, ROMAN, ROLE_NAMES } = DM;
  const { esc, fmt, fmtK, fmtAvg, pct, plural, tier, gradeCls, countAttr, isStats, gamesFor, clock, dateShort } = DM.u;
  const { heroMeta, quote, rankFor } = DM.a;
  const C = DM.c, CH = DM.charts;

  function render(el) {
    el.innerHTML = `
      <section class="dossier panel" data-rail="Dossier">${dossier()}</section>
      ${spotlight()}
      ${pursuits()}
      <section class="panel form-panel" id="form-panel">${formPanel()}</section>
      <div class="ov-grid">
        <section class="panel">${activity()}</section>
        <section class="panel">${heroPool()}</section>
      </div>
      <section class="panel" id="company">${company()}</section>
      <section class="panel">${C.head("Chapter VI", "Recent Matches", `<a class="btn-ghost" href="${DM.href.page("matches")}">Full ledger →</a>`)}
        ${DM.ledger(DM.counted().slice(0, 8).concat([]), { compact: true })}</section>`;
    DM.loadCompany();
  }

  // ------------------------------------------------------------------ dossier
  function currentRank() {
    const ranked = [...state.records.values()].filter((r) => r.badge).sort((a, b) => b.t - a.t)[0];
    return rankFor(ranked ? ranked.badge : state.rank && state.rank.badge);
  }

  function dossier() {
    const p = state.profile || {};
    const a = state.result.account, st = state.stats.account;
    const name = p.personaname || `Account ${state.accountId}`;
    const steamUrl = `https://steamcommunity.com/profiles/${DM.D.to64(state.accountId)}`;
    const L = a.level, arch = C.archetype(a.ratios), rank = currentRank();
    const maxCat = Math.max(...S.CATEGORIES.map((c) => a.cats[c.key]));
    const gradeOrder = S.GRADES.map((g) => g.grade);
    const maxGrade = Math.max(1, ...gradeOrder.map((g) => a.grades[g] || 0));
    const mastered = Object.values(state.result.heroes);
    const sumLevels = mastered.reduce((s, h) => s + h.mastery.level, 0);
    const avgPts = a.points / Math.max(1, a.matches);

    const plaques = isStats() ? `
          <div><dt>Games</dt><dd ${countAttr(st.games)}>${fmt(st.games)}</dd></div>
          <div><dt>Win rate</dt><dd>${pct(st.wins / st.games)}</dd></div>
          <div><dt>KDA</dt><dd>${st.kda.toFixed(2)}</dd></div>
          <div><dt>Hero accuracy</dt><dd>${pct(st.accuracy)}</dd></div>
          <div><dt>Hours played</dt><dd ${countAttr(Math.round(st.seconds / 3600))}>${fmt(st.seconds / 3600)}</dd></div>
          <div><dt>Best streak</dt><dd>${st.streak}<small> wins</small></dd></div>` : `
          <div><dt>Points</dt><dd ${countAttr(Math.round(a.points))}>${fmt(a.points)}</dd></div>
          <div><dt>Games</dt><dd ${countAttr(a.matches)}>${fmt(a.matches)}</dd></div>
          <div><dt>Win rate</dt><dd>${pct(a.wins / a.matches)}</dd></div>
          <div><dt>Avg / game</dt><dd ${countAttr(avgPts.toFixed(1), 1)}>${avgPts.toFixed(1)}</dd></div>
          <div><dt>Mastery sum</dt><dd title="Sum of every hero's mastery rank">${sumLevels}<small> / ${state.heroes.length * 10 || "–"}</small></dd></div>
          <div><dt>Heroes at X</dt><dd>${mastered.filter((h) => h.mastery.maxed).length}</dd></div>`;

    const lower = isStats() ? `
      <div class="dz-cats">
        <h3 class="h-small">Career stats <span class="h-note">${st.fullGames} of ${st.games} games have detailed stats</span></h3>
        ${C.statTable(st, a.ratios)}
      </div>
      <div class="dz-grades">
        <h3 class="h-small">Personal bests</h3>
        ${C.bestsList(st)}
        <p class="fine">Average game ${clock(st.avgMinutes)} · final level ${st.level == null ? "–" : st.level.toFixed(1)} · headshot rate ${pct(st.headshot)}</p>
      </div>` : `
      <div class="dz-cats">
        <h3 class="h-small">Where your points come from</h3>
        <ul class="cats">${S.CATEGORIES.map((c, i) => `
          <li style="--i:${i}"><span class="cat-name">${c.label}</span>
            <span class="cat-bar"><span style="--w:${maxCat ? (a.cats[c.key] / maxCat * 100).toFixed(1) : 0}%"></span></span>
            <span class="cat-val">${fmt(a.cats[c.key])}</span>
            <span class="cat-pct">${a.points ? pct(a.cats[c.key] / a.points) : ""}</span></li>`).join("")}
        </ul>
      </div>
      <div class="dz-grades">
        <h3 class="h-small">Grades earned</h3>
        <div class="grade-hist">${gradeOrder.map((g) => `
          <div class="gh-col ${gradeCls(g)}">
            <span class="gh-n">${a.grades[g] || 0}</span>
            <span class="gh-bar"><span style="--h:${((a.grades[g] || 0) / maxGrade * 100).toFixed(1)}%"></span></span>
            ${C.seal(g)}
          </div>`).join("")}
        </div>
        ${skippedNote(a)}
      </div>`;

    return `
      <div class="dz-id">
        <div class="eyebrow">Chapter I · Dossier</div>
        <div class="who">
          <div class="avatar-frame">${p.avatarfull ? `<img src="${esc(p.avatarfull)}" alt="">` : ""}</div>
          <div class="who-text">
            <h1>${esc(name)}</h1>
            <div class="muted small">SteamID3 ${state.accountId} · <a href="${esc(steamUrl)}" target="_blank" rel="noopener">Steam profile ↗</a></div>
            <div class="who-tags">
              <span class="rank-line">${C.rankBadge(rank, 30)}${rank ? `${esc(rank.name)} ${ROMAN[rank.sub] || ""}` : "Unranked"}</span>
              ${arch ? `<span class="arch">The <b>${arch.primary}</b>${arch.secondary ? ` <span>· ${arch.secondary}</span>` : ""}</span>` : ""}
            </div>
          </div>
        </div>
        <dl class="plaques">${plaques}</dl>
      </div>
      <div class="dz-medal">
        ${C.medallion(L)}
        <div class="medal-cap"><b ${countAttr(Math.round(L.toNext))}>${fmt(L.toNext)}</b> points to level ${L.level + 1} · ≈ ${plural(Math.ceil(L.toNext / Math.max(40, avgPts)), "game")}</div>
      </div>
      <div class="dz-sigil">
        ${C.sigil(a.ratios)}
        <div class="sigil-cap">Your average game against each hero's global average. The dashed ring is 100%.</div>
      </div>
      ${lower}`;
  }

  function skippedNote(a) {
    const parts = [];
    if (a.skipped.mode) parts.push(`${a.skipped.mode} bot/private/lab`);
    if (a.skipped.abandoned) parts.push(`${a.skipped.abandoned} abandoned`);
    if (a.skipped.short) parts.push(`${a.skipped.short} under 5 min`);
    const est = a.estimated ? ` · ${a.estimated} with estimated damage/healing/objective` : "";
    return parts.length || est ? `<p class="fine">Not counted: ${parts.join(", ") || "none"}${est}</p>` : "";
  }

  // ----------------------------------------------------------------- spotlight
  function spotlight() {
    const top = Object.values(state.result.heroes).sort((x, y) => y.points - x.points)[0];
    if (!top) return "";
    const meta = heroMeta(top.hero), m = top.mastery;
    return `<section class="spotlight t-${tier(m.level)}" style="--hero-rgb:${meta.rgb}" data-rail="Signature hero">
      ${meta.bg ? `<div class="sp-bg" style="background-image:url('${esc(meta.bg)}')"></div>` : ""}
      <div class="sp-veil"></div>
      <div class="sp-content">
        <div class="eyebrow">Signature hero</div>
        ${C.nameplate(meta, "sp-name")}
        <div class="sp-title"><span>Mastery ${ROMAN[m.level]}</span><span class="dot">◆</span><span>${S.MASTERY_TITLES[m.level]}</span></div>
        <p class="flavor voice">“${esc(quote(meta, m.level))}”</p>
        ${C.ladder(m.points, "lg")}${C.ladderRoman(m.level)}
        <div class="sp-next">${m.maxed
          ? `<b>${fmt(m.points)}</b> points · <b>${fmt(m.overflow)}</b> earned beyond Mastery X`
          : `<b>${fmt(m.toNext)}</b> points to Mastery ${ROMAN[m.level + 1]} · ≈ ${plural(gamesFor(top, m.toNext), "game")}`}</div>
        <dl class="sp-stats">
          <div><dt>Games</dt><dd>${top.matches}</dd></div>
          <div><dt>Win rate</dt><dd>${pct(top.wins / top.matches)}</dd></div>
          <div><dt>Avg / game</dt><dd>${(top.points / top.matches).toFixed(1)}</dd></div>
          <div><dt>Best</dt><dd>${top.best ? C.seal(top.best.grade) : "–"}</dd></div>
        </dl>
        <a class="btn-gold" href="${DM.href.hero(top.hero)}">Open hero file</a>
      </div>
      <div class="sp-portrait">
        <div class="sp-arch">${meta.gloat || meta.card ? `<img src="${esc(meta.gloat || meta.card)}" alt="${esc(meta.name)}">` : ""}</div>
        <div class="sp-emblem">${C.emblem(m.level, 150, "big")}</div>
      </div>
    </section>`;
  }

  function pursuits() {
    const list = Object.values(state.result.heroes).filter((h) => !h.mastery.maxed)
      .map((h) => ({ h, games: gamesFor(h, h.mastery.toNext) }))
      .sort((x, y) => x.games - y.games || y.h.points - x.h.points).slice(0, 4);
    if (!list.length) return "";
    const ring = (p, r = 26) => {
      const Cc = 2 * Math.PI * r;
      return `<svg class="pr-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="pr-track"/><circle cx="32" cy="32" r="${r}" class="pr-fill" stroke-dasharray="${Cc.toFixed(1)}" stroke-dashoffset="${(Cc * (1 - p)).toFixed(1)}" transform="rotate(-90 32 32)"/></svg>`;
    };
    return `<section class="pursuits">
      <div class="pursuit-head"><span class="eyebrow">Within reach</span><span class="fine">The ranks closest to falling, at your usual pace on each hero.</span></div>
      <div class="pursuit-row">${list.map(({ h, games }) => {
        const meta = heroMeta(h.hero), m = h.mastery;
        return `<a class="pursuit t-${tier(m.level + 1)}" href="${DM.href.hero(h.hero)}" style="--hero-rgb:${meta.rgb}">
          <span class="pr-portrait">${ring(m.progress)}${meta.small ? `<img src="${esc(meta.small)}" alt="">` : ""}</span>
          <span class="pr-text">
            <span class="pr-name">${esc(meta.name)}</span>
            <span class="pr-step">${ROMAN[m.level]} <i>→</i> <b>${ROMAN[m.level + 1]}</b> ${S.MASTERY_TITLES[m.level + 1]}</span>
            <span class="pr-need">${fmt(m.toNext)} pts · ≈ ${plural(games, "game")}</span>
          </span>
          ${C.emblem(m.level + 1, 40, "pr-next")}
        </a>`;
      }).join("")}</div></section>`;
  }

  // -------------------------------------------------------------------- form
  const FORM_TABS = [["form", "Form"], ["journey", "Journey"], ["economy", "Economy"]];

  function formPanel() {
    const games = DM.counted().slice().reverse(); // oldest first
    const recs = games.map((g) => g.rec);
    const tab = state.formTab || "form";
    const tabs = `<div class="seg" role="group" aria-label="Chart">${FORM_TABS.map(([k, l]) =>
      `<button type="button" data-form="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>`;
    const xLabel = (i) => recs[i] ? dateShort(recs[i].t) : "";
    const tip = (i) => recs[i] ? `Game ${i + 1} · ${heroMeta(recs[i].hero).name} · ${recs[i].won ? "Win" : "Loss"} · ${dateShort(recs[i].t)}` : "";
    let chart;
    if (tab === "journey") {
      let cum = 0;
      const vals = games.map((g) => (cum += g.score.points));
      const refs = [];
      for (let L = 5; S.accountThreshold(L) <= cum * 1.05; L += 5) refs.push({ value: S.accountThreshold(L), label: `Level ${L}`, cls: "gold" });
      chart = CH.line([{ label: "Lifetime points", values: vals, color: "var(--gold)", area: true, fmt: (v) => fmtK(v) }],
        { xLabel, tip, refLines: refs, height: 240, aria: "Lifetime points over every counted game" });
    } else if (tab === "economy") {
      const spm = recs.map((r) => r.dur ? r.nw / (r.dur / 60) : null);
      const dpm = recs.map((r) => r.full && r.dur ? r.dmg / (r.dur / 60) : null);
      chart = CH.line([
        { label: "Souls / min (20-game avg)", values: CH.rolling(spm, 20), color: "var(--gold)", area: true, fmt: (v) => fmt(v) },
        { label: "Hero damage / min (20-game avg)", values: CH.rolling(dpm, 20), color: "#e0786a", fmt: (v) => fmt(v), axis: "right" },
      ], { xLabel, tip, height: 240 });
    } else {
      const wr = CH.rolling(recs.map((r) => (r.won ? 1 : 0)), 20, 5);
      const second = isStats()
        ? { label: "KDA (20-game avg)", values: CH.rolling(recs.map((r) => (r.k + r.a) / Math.max(1, r.d)), 20, 5), color: "#8fcf9f", fmt: (v) => v.toFixed(2), axis: "right" }
        : { label: "Points / game (20-game avg)", values: CH.rolling(games.map((g) => g.score.points), 20, 5), color: "#8fcf9f", fmt: (v) => v.toFixed(0), axis: "right" };
      chart = CH.line([
        { label: "Win rate (20-game avg)", values: wr, color: "var(--gold)", area: true, fmt: pct, min: 0, max: 1 },
        second,
      ], { xLabel, tip, height: 240, refLines: [{ value: 0.5, label: "50%", cls: "mid" }] });
    }

    const last20 = recs.slice(-20), wins20 = last20.filter((r) => r.won).length;
    let streak = 0;
    for (let i = recs.length - 1; i >= 0 && recs[i].won === recs[recs.length - 1].won; i--) streak++;
    const pts20 = games.slice(-20).reduce((s, g) => s + g.score.points, 0) / Math.max(1, Math.min(20, games.length));
    const ptsAll = state.result.account.points / Math.max(1, games.length);
    return `${C.head("Chapter II", "Form &amp; Journey", tabs)}
      <div class="form-grid">
        <div class="form-chart">${chart}</div>
        <aside class="form-side">
          <div class="fs-block"><span class="fs-label">Last 20</span>${C.formPips([...recs].reverse(), 20)}</div>
          <div class="fs-stat"><b>${wins20}–${last20.length - wins20}</b><span>${pct(wins20 / Math.max(1, last20.length))} win rate</span></div>
          <div class="fs-stat"><b class="${recs.length && recs[recs.length - 1].won ? "w" : "l"}">${streak}${recs.length && recs[recs.length - 1].won ? "W" : "L"}</b><span>current streak</span></div>
          <div class="fs-stat"><b>${pts20.toFixed(1)}</b><span>points / game lately <em class="${pts20 >= ptsAll ? "up" : "down"}">${pts20 >= ptsAll ? "▲" : "▼"} ${Math.abs(pts20 - ptsAll).toFixed(1)} vs career</em></span></div>
        </aside>
      </div>`;
  }

  // ---------------------------------------------------------------- activity
  function activity() {
    const recs = DM.counted().map((g) => g.rec);
    const days = new Map(), hours = new Array(24).fill(0), dows = new Array(7).fill(0);
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const r of recs) {
      const d = new Date(r.t * 1000);
      const k = key(d), v = days.get(k) || { g: 0, w: 0 };
      v.g++; if (r.won) v.w++;
      days.set(k, v);
      hours[d.getHours()]++;
      dows[d.getDay()]++;
    }
    // Sessions: games less than an hour apart.
    const asc = recs.slice().sort((a, b) => a.t - b.t);
    let best = { n: 0 }, cur = null;
    for (const r of asc) {
      if (cur && r.t - cur.end < 3600) { cur.n++; cur.end = r.t + (r.dur || 0); cur.sec += r.dur || 0; }
      else { cur = { n: 1, start: r.t, end: r.t + (r.dur || 0), sec: r.dur || 0 }; }
      if (cur.n > best.n) best = { ...cur };
    }
    const now = Date.now() / 1000;
    const last30 = recs.filter((r) => now - r.t < 30 * 86400).length;
    const topDow = dows.indexOf(Math.max(...dows)), topHour = hours.indexOf(Math.max(...hours));
    const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const hourName = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
    const activeDays = [...days.keys()].length;
    return `${C.head("Chapter III", "Activity")}
      ${CH.calendar(days)}
      <div class="act-facts">
        <div><b>${last30}</b><span>games in the last 30 days</span></div>
        <div><b>${activeDays}</b><span>days with a game</span></div>
        <div><b>${best.n}</b><span>longest session${best.start ? ` · ${dateShort(best.start)}, ${Math.floor(best.sec / 3600)}h ${Math.round((best.sec % 3600) / 60)}m` : ""}</span></div>
      </div>
      <div class="act-cols">
        <div><h3 class="h-small">By hour</h3>${CH.columns(hours, hours.map((_, h) => hourName(h)), { short: (h) => (h % 6 === 0 ? hourName(h) : ""), fmt: (v) => plural(v, "game") })}</div>
        <div><h3 class="h-small">By day</h3>${CH.columns(dows, dowNames, { short: (d) => dowNames[d].slice(0, 2), fmt: (v) => plural(v, "game") })}</div>
      </div>
      <p class="fine">You play most on ${dowNames[topDow]}s, usually around ${hourName(topHour)}.</p>`;
  }

  // --------------------------------------------------------------- hero pool
  function heroPool() {
    const heroes = Object.values(state.result.heroes).sort((a, b) => b.matches - a.matches);
    const roles = {};
    for (const h of heroes) {
      const r = heroMeta(h.hero).type || "other";
      roles[r] = (roles[r] || 0) + h.matches;
    }
    const roleColors = { marksman: "#e1bb5c", brawler: "#d6806e", mystic: "#b897ee", assassin: "#62c9a1", tank: "#7aa7d6", support: "#8fcf9f", other: "#8b857b" };
    const segs = Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ value: v, color: roleColors[k] || "#8b857b", label: ROLE_NAMES[k] || k }));
    const total = heroes.reduce((s, h) => s + h.matches, 0);
    const top = heroes.slice(0, 7);
    const shareTop3 = heroes.slice(0, 3).reduce((s, h) => s + h.matches, 0) / Math.max(1, total);
    return `${C.head("Chapter IV", "Hero Pool", `<a class="btn-ghost" href="${DM.href.page("heroes")}">All heroes →</a>`)}
      <div class="pool">
        <div class="pool-donut">
          ${CH.donut(segs, { size: 170, center: `${heroes.length}`, sub: `of ${state.heroes.length} heroes`, aria: "Games by hero role" })}
          <ul class="legend">${segs.map((s) => `<li><i style="background:${s.color}"></i>${esc(s.label)}<b>${pct(s.value / total)}</b></li>`).join("")}</ul>
        </div>
        <div class="pool-bars">
          ${CH.bars(top.map((h) => {
            const m = heroMeta(h.hero);
            return { label: m.name, img: m.small, rgb: m.rgb, href: DM.href.hero(h.hero), value: h.matches, color: `rgb(${m.rgb})`,
              display: `${h.matches}`, sub: `${ROMAN[h.mastery.level]} · ${pct(h.wins / h.matches)} WR` };
          }))}
          <p class="fine">Your top three heroes make up ${pct(shareTop3)} of your games.</p>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------ company
  function company() {
    const c = state.company;
    const body = !c ? `<p class="loading-line">Asking around the Cursed Apple…</p>` : c.error ? `<p class="fine">${esc(c.error)}</p>` : `
      <div class="company">
        <div><h3 class="h-small">Associates <span class="h-note">teammates, 3+ games together</span></h3>${people(c.mates, "together")}</div>
        <div><h3 class="h-small">Squad vs Solo <span class="h-note">games with a regular teammate vs without</span></h3>${squadSolo(c.squad || [])}</div>
      </div>`;
    return `${C.head("Chapter V", "The Company You Keep", `<a class="btn-ghost" href="${DM.href.compare()}">Compare →</a>`)}${body}`;
  }

  function squadSolo(ids) {
    const set = new Set(ids);
    const games = DM.counted();
    const side = (list, label, cls) => {
      const n = list.length, w = list.filter((g) => g.rec.won).length;
      const pts = list.reduce((s, g) => s + g.score.points, 0) / Math.max(1, n);
      const kda = list.reduce((s, g) => s + g.rec.k + g.rec.a, 0) / Math.max(1, list.reduce((s, g) => s + g.rec.d, 0));
      return { label, cls, n, wr: w / Math.max(1, n), pts, kda };
    };
    const a = side(games.filter((g) => set.has(g.rec.id)), "With the squad", "squad");
    const b = side(games.filter((g) => !set.has(g.rec.id)), "Solo queue", "solo");
    const best = a.wr === b.wr ? null : a.wr > b.wr ? a : b;
    return `<div class="vs-cards">${[a, b].map((x) => `
      <div class="vs-card ${x.cls}${best === x ? " best" : ""}">
        <span class="vc-label">${x.label}</span>
        <b>${pct(x.wr)}</b><span class="vc-sub">win rate · ${plural(x.n, "game")}</span>
        <span class="vc-bar"><span style="--w:${(x.wr * 100).toFixed(1)}%"></span></span>
        <dl><div><dt>Pts / game</dt><dd>${x.pts.toFixed(1)}</dd></div><div><dt>KDA</dt><dd>${x.kda.toFixed(2)}</dd></div></dl>
      </div>`).join("")}</div>
      ${best ? `<p class="fine">You win ${Math.abs(Math.round((a.wr - b.wr) * 100))} points more often ${best === a ? "with your regulars" : "on your own"}.</p>` : ""}`;
  }

  function people(list, word) {
    if (!list || !list.length) return `<p class="fine">Nobody shows up often enough yet.</p>`;
    return `<ul class="people">${list.map((x) => {
      const prof = state.profiles.get(x.id) || {};
      const wr = x.wins / Math.max(1, x.games);
      return `<li>
        <span class="pp-av">${prof.avatarmedium ? `<img src="${esc(prof.avatarmedium)}" alt="" loading="lazy">` : ""}</span>
        <span class="pp-name"><a href="#${x.id}" title="Open their dossier">${esc(prof.personaname || `Player ${x.id}`)}</a><small>${plural(x.games, "game")} ${word}</small></span>
        <span class="pp-wr"><span class="pp-bar"><span style="--w:${(wr * 100).toFixed(1)}%"></span></span><b class="${wr >= 0.5 ? "up" : "down"}">${pct(wr)}</b></span>
        <a class="pp-cmp" href="${DM.href.compare(x.id)}" title="Compare with ${esc(prof.personaname || "this player")}">⇄</a>
      </li>`;
    }).join("")}</ul>`;
  }

  DM.pages = DM.pages || {};
  DM.pages.overview = render;
  DM.pages.overviewParts = { formPanel, company };
})();

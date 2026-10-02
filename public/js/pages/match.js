// Match page: one game in full - both teams, the souls race, your build, accolades.
(function () {
  "use strict";
  const { state, TEAMS } = DM;
  const { esc, fmt, fmtK, pct, clock, dateLong, plural, modeName, tier } = DM.u;
  const { heroMeta, item, accolade, rankFor } = DM.a;
  const C = DM.c, CH = DM.charts;

  async function render(el, id) {
    let m = state.matches.get(id);
    if (!m) {
      el.innerHTML = `<div class="loader"><p>Unsealing match ${id}…</p></div>`;
      try {
        m = await DM.D.fetchMatch(id);
      } catch (e) {
        el.innerHTML = `<section class="panel">${C.head("The Ledger", "Match unavailable")}<p class="fine">${esc(e.message)}</p>
          <p><a class="btn-ghost" href="${DM.href.page("matches")}">‹ Back to the ledger</a></p></section>`;
        return;
      }
      if (!m) {
        el.innerHTML = `<section class="panel">${C.head("The Ledger", "Match not on record")}<p class="fine">deadlock-api has no detailed data for match ${id} yet. Recent games can take a while to appear.</p>
          <p><a class="btn-ghost" href="${DM.href.page("matches")}">‹ Back to the ledger</a></p></section>`;
        return;
      }
      state.matches.set(id, m);
      const missing = m.players.map((p) => p.account_id).filter((a) => a && !state.profiles.has(a));
      if (missing.length) {
        try { for (const p of await DM.D.fetchProfiles(missing)) state.profiles.set(p.account_id, p); } catch { /* names are optional */ }
      }
      if (DM.state.route.page !== "match" || DM.state.route.arg !== id) return; // navigated away meanwhile
    }
    el.innerHTML = page(m);
  }

  const teamIdx = (t) => (t === "Team1" || t === 1 ? 1 : 0);

  function page(m) {
    const me = m.players.find((p) => p.account_id === state.accountId) || m.players[0];
    const myTeam = teamIdx(me.team), won = teamIdx(m.winning_team) === myTeam;
    const meta = heroMeta(me.hero_id);
    const scored = state.result.scored.find((x) => x.rec.id === m.match_id);
    const teams = [0, 1].map((t) => m.players.filter((p) => teamIdx(p.team) === t).sort((a, b) => b.net_worth - a.net_worth));
    const tot = teams.map((ps) => ({ souls: ps.reduce((s, p) => s + p.net_worth, 0), kills: ps.reduce((s, p) => s + p.kills, 0) }));
    const rec = scored ? scored.rec : { mode: m.game_mode === "StreetBrawl" ? "brawl" : "normal", mm: String(m.match_mode).toLowerCase() };
    const badges = [m.average_badge_team0, m.average_badge_team1].map(rankFor);

    return `<article class="match-page ${won ? "won" : "lost"}" style="--hero-rgb:${meta.rgb}">
      <header class="mp-banner">
        ${meta.bg ? `<div class="hp-bg" style="background-image:url('${esc(meta.bg)}')"></div>` : ""}
        <div class="hp-veil"></div>
        <div class="mp-content">
          <a class="crumb" href="${DM.href.page("matches")}">‹ The ledger</a>
          <div class="eyebrow">Match ${m.match_id} · ${esc(modeName(rec))} · ${clock(m.duration_s / 60)}</div>
          <h1 class="mp-result">${won ? "Victory" : "Defeat"}</h1>
          <p class="mp-when">${dateLong(Date.parse(String(m.start_time).replace(" ", "T") + "Z") / 1000)}</p>
          <div class="mp-me">
            ${C.heroChip(me.hero_id)}
            <span class="mp-kda">${me.kills}<i>/</i>${me.deaths}<i>/</i>${me.assists}</span>
            <span class="mp-souls">${fmtK(me.net_worth)} souls</span>
            ${scored && scored.score.eligible ? `<span class="mp-pts">+${scored.score.points.toFixed(0)} pts ${C.seal(scored.score.grade)}</span>` : ""}
          </div>
        </div>
        <div class="mp-score">
          ${[0, 1].map((t) => `<div class="mp-team ${TEAMS[t].cls}${t === myTeam ? " mine" : ""}${teamIdx(m.winning_team) === t ? " winner" : ""}">
            <span class="mpt-name">${TEAMS[t].name}${t === myTeam ? " <small>your team</small>" : ""}</span>
            <b>${tot[t].kills}</b><span class="mpt-sub">kills · ${fmtK(tot[t].souls)} souls</span>
            ${badges[t] ? `<span class="mpt-rank">${C.rankBadge(badges[t], 26)}${esc(badges[t].name)}</span>` : ""}
          </div>`).join(`<span class="mp-vs">vs</span>`)}
        </div>
      </header>
      <section class="panel">${race(m, myTeam)}</section>
      <section class="panel">${C.head("The Scoreboard", "Both Sides")}
        ${[0, 1].map((t) => board(teams[t], t, m, myTeam)).join("")}
      </section>
      <div class="hp-grid">
        <section class="panel">${buildTimeline(me, m)}</section>
        <section class="panel">${shares(teams, myTeam)}${accolades(me)}</section>
      </div>
    </article>`;
  }

  // Team souls over time, resampled per minute, with objectives and the Mid Boss marked.
  function race(m, myTeam) {
    const snaps = (m.players[0].stats || []).map((s) => s.time_stamp_s);
    if (snaps.length < 2) return `${C.head("The Race", "Souls Over Time")}<p class="fine">No timeline recorded for this match.</p>`;
    const minutes = Math.ceil(m.duration_s / 60);
    const teamAt = (t, key) => {
      const pts = [{ time: 0, v: 0 }].concat(snaps.map((time, i) => ({ time, v: m.players.filter((p) => teamIdx(p.team) === t)
        .reduce((s, p) => s + ((p.stats[i] || {})[key] || 0), 0) })));
      return Array.from({ length: minutes + 1 }, (_, mi) => {
        const time = Math.min(mi * 60, m.duration_s);
        const k = pts.findIndex((p) => p.time >= time);
        if (k === -1) return pts[pts.length - 1].v;
        if (k === 0) return pts[0].v;
        const a = pts[k - 1], b = pts[k];
        return a.v + (b.v - a.v) * ((time - a.time) / ((b.time - a.time) || 1));
      });
    };
    const key = state.raceKey || "net_worth";
    const series = [0, 1].map((t) => ({ label: TEAMS[t].name + (t === myTeam ? " (you)" : ""), values: teamAt(t, key),
      color: t === 0 ? "var(--amber)" : "var(--sapphire)", area: t === myTeam, fmt: (v) => fmtK(v) }));
    const markers = (m.objectives || []).filter((o) => o.destroyed_time_s > 0).map((o) => {
      const taker = 1 - teamIdx(o.team);
      return { i: Math.round(o.destroyed_time_s / 60), label: `${TEAMS[taker].name} destroys an objective · ${clock(o.destroyed_time_s / 60)}`, cls: TEAMS[taker].cls };
    });
    for (const b of m.mid_boss || []) {
      if (b.destroyed_time_s) markers.push({ i: Math.round(b.destroyed_time_s / 60), label: `Mid Boss slain by ${TEAMS[teamIdx(b.team_killed)].name} · ${clock(b.destroyed_time_s / 60)}`, cls: "boss" });
    }
    const keys = [["net_worth", "Souls"], ["kills", "Kills"], ["player_damage", "Hero damage"]];
    const tabs = `<div class="seg" role="group" aria-label="Metric">${keys.map(([k, l]) => `<button type="button" data-race="${k}" aria-pressed="${key === k}">${l}</button>`).join("")}</div>`;
    return `${C.head("The Race", "Over Time", tabs)}
      ${CH.line(series, { height: 250, xLabel: (i) => `${i}m`, tip: (i) => `Minute ${i}`, markers })}
      <p class="fine">Diamonds mark objectives (coloured by the team that took them) and the Mid Boss.</p>`;
  }

  function board(players, t, m, myTeam) {
    const won = teamIdx(m.winning_team) === t;
    const maxDmg = Math.max(...m.players.map((p) => (p.final_stats || {}).player_damage || 0), 1);
    return `<div class="board ${TEAMS[t].cls}">
      <div class="board-head"><span class="bh-name">${TEAMS[t].name}</span>${won ? `<span class="bh-win">Victory</span>` : `<span class="bh-loss">Defeat</span>`}${t === myTeam ? `<span class="bh-you">your team</span>` : ""}</div>
      <div class="table-wrap"><table class="scoreboard"><thead><tr>
        <th>Player</th><th class="num">Lvl</th><th class="num">K / D / A</th><th class="num">Souls</th><th class="num hide-sm">LH / Dn</th>
        <th class="num">Hero dmg</th><th class="num hide-sm">Obj dmg</th><th class="num hide-sm">Healing</th><th class="hide-md">Items</th>
      </tr></thead><tbody>${players.map((p) => {
        const fs = p.final_stats || {};
        const prof = state.profiles.get(p.account_id) || {};
        const meta = heroMeta(p.hero_id);
        const items = (p.items || []).filter((x) => !x.sold_time_s).map((x) => ({ ...item(x.item_id), t: x.game_time_s })).filter((x) => x.name);
        const mine = p.account_id === state.accountId;
        const mvp = p.mvp_rank ? `<span class="mvp m${p.mvp_rank}" title="MVP #${p.mvp_rank}">${p.mvp_rank === 1 ? "MVP" : "#" + p.mvp_rank}</span>` : "";
        return `<tr class="${mine ? "me" : ""}" style="--hero-rgb:${meta.rgb}">
          <td><span class="sb-player">${meta.small ? `<img src="${esc(meta.small)}" alt="">` : ""}<span><b>${esc(meta.name)}</b>
            <small>${p.account_id ? `<a href="#${p.account_id}">${esc(prof.personaname || "Player " + p.account_id)}</a>` : "Anonymous"}</small></span>${mvp}</span></td>
          <td class="num">${p.player_level || fs.level || "–"}</td>
          <td class="num kda">${p.kills}<i>/</i>${p.deaths}<i>/</i>${p.assists}</td>
          <td class="num strong">${fmtK(p.net_worth)}</td>
          <td class="num hide-sm">${p.last_hits}<i class="sep">/</i>${p.denies}</td>
          <td class="num"><span class="dmg-cell"><span class="dmg-bar" style="--w:${((fs.player_damage || 0) / maxDmg * 100).toFixed(1)}%"></span>${fmtK(fs.player_damage || 0)}</span></td>
          <td class="num hide-sm">${fmtK(fs.boss_damage || 0)}</td>
          <td class="num hide-sm">${fmtK(fs.player_healing || 0)}</td>
          <td class="hide-md">${C.buildStrip(items.sort((a, b) => a.t - b.t), 22)}</td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
  }

  // Every purchase along the match clock; sold items fade.
  function buildTimeline(me, m) {
    const buys = (me.items || []).map((x) => ({ ...item(x.item_id), t: x.game_time_s, sold: x.sold_time_s })).filter((x) => x.name && x.shop !== undefined);
    if (!buys.length) return `${C.head("The Shopping List", "Your Build")}<p class="fine">No purchases recorded.</p>`;
    const dur = m.duration_s || 1;
    const lanes = [];
    const placed = buys.sort((a, b) => a.t - b.t).map((b) => {
      const x = (b.t / dur) * 100;
      let lane = lanes.findIndex((end) => x - end > 6.5);
      if (lane === -1) { lane = lanes.length; lanes.push(x); } else lanes[lane] = x;
      return { ...b, x, lane };
    });
    const ticks = Array.from({ length: Math.floor(dur / 300) + 1 }, (_, i) => i * 5);
    const spent = buys.reduce((s, b) => s + (b.cost || 0), 0);
    return `${C.head("The Shopping List", "Your Build", `<span class="h-note">${plural(buys.length, "purchase")} · ${fmtK(spent)} souls spent</span>`)}
      <div class="timeline" style="--lanes:${lanes.length}">
        ${ticks.map((mi) => `<span class="tl-tick" style="left:${(mi * 60 / dur * 100).toFixed(2)}%">${mi}m</span>`).join("")}
        ${placed.map((b) => `<span class="tl-item" style="left:${b.x.toFixed(2)}%;--lane:${b.lane}">${C.itemIcon(b, { size: 30, sold: b.sold, t: b.t })}</span>`).join("")}
      </div>
      <div class="build-final"><span class="cb-label">Final build</span>${C.buildStrip(placed.filter((b) => !b.sold), 40)}</div>`;
  }

  function shares(teams, myTeam) {
    const metrics = [["player_damage", "Hero damage"], ["net_worth", "Souls"], ["boss_damage", "Objective damage"], ["player_healing", "Healing"]];
    const val = (p, k) => k === "net_worth" ? p.net_worth : (p.final_stats || {})[k] || 0;
    const t = teams[myTeam];
    return `${C.head("Your Team", "Share of the Work")}
      ${metrics.map(([k, l]) => {
        const total = t.reduce((s, p) => s + val(p, k), 0) || 1;
        return `<div class="share"><span class="share-l">${l}</span><span class="share-bar">${t.map((p) => {
          const meta = heroMeta(p.hero_id), f = val(p, k) / total;
          return `<span class="${p.account_id === state.accountId ? "me" : ""}" style="--w:${(f * 100).toFixed(2)}%;--hero-rgb:${meta.rgb}" title="${esc(meta.name)}: ${pct(f)}">${f > 0.09 && meta.small ? `<img src="${esc(meta.small)}" alt="">` : ""}</span>`;
        }).join("")}</span></div>`;
      }).join("")}
      <p class="fine">Your slice is outlined. Each colour is a hero on your team.</p>`;
  }

  function accolades(me) {
    // -1 = not earned; 0+ = the tier reached.
    const list = (me.accolades || []).filter((a) => a.accolade_threshold_achieved >= 0);
    if (!list.length) return "";
    return `<h3 class="h-small spaced">Accolades</h3><div class="accolades">${list.map((a) => `
      <span class="accolade"><b>${esc(accolade(a.accolade_id) || "Accolade")}</b><small>${fmt(a.accolade_stat_value)}</small></span>`).join("")}</div>`;
  }

  DM.pages = DM.pages || {};
  DM.pages.match = render;
})();

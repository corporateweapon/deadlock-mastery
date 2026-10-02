// Deadlock Mastery - reusable visual pieces (crests, medallion, sigil, tables, items...).
(function () {
  "use strict";
  const { S, ROMAN, SHORT, ARCHETYPE, SLOT_NAMES, state } = DM;
  const { esc, fmt, fmtK, fmtBig, fmtAvg, pct, tier, gradeCls, countAttr, dateShort } = DM.u;
  const { heroMeta, item } = DM.a;

  // Rank crest. Ornament grows with rank: pendant (III), sunburst (V), wings + finial (VII),
  // orbit ring (IX), rotating halo (X). Paint comes from the shared #m-<tier> gradients.
  function emblem(level, size, extra = "") {
    const t = tier(level), m = `url(#m-${t})`;
    const simple = size < 44;
    let back = "";
    if (!simple) {
      if (level >= 10) back += `<g class="em-halo">${Array.from({ length: 24 }, (_, i) =>
        `<path d="M60 0 62 13 58 13Z" transform="rotate(${i * 15} 60 60)" fill="${m}"/>`).join("")}</g>`;
      if (level >= 9) back += `<circle cx="60" cy="60" r="50" fill="none" stroke="${m}" stroke-width="1.5" opacity=".8"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="${m}" stroke-width=".6" stroke-dasharray="1 3" opacity=".7"/>`;
      if (level >= 5) back += `<g opacity=".55">${[-3, -2, -1, 0, 1, 2, 3].map((i) => {
        const a = (-90 + i * 19) * Math.PI / 180, w = 5 * Math.PI / 180, r = 58;
        const p = (ang) => `${(60 + r * Math.cos(ang)).toFixed(1)},${(60 + r * Math.sin(ang)).toFixed(1)}`;
        return `<polygon points="60,60 ${p(a - w)} ${p(a + w)}" fill="${m}"/>`;
      }).join("")}</g>`;
      if (level >= 7) {
        const wing = `<polygon points="17,60 2,47 2,53 10,60 2,67 2,73" fill="${m}"/><polygon points="22,60 11,51 11,55 16,60 11,65 11,69" fill="${m}" opacity=".7"/>`;
        back += `<g>${wing}</g><g transform="translate(120 0) scale(-1 1)">${wing}</g>
          <polygon points="60,0 65,8 60,16 55,8" fill="${m}"/>`;
      }
      if (level >= 3) back += `<polygon points="60,100 67,110 60,120 53,110" fill="${m}"/>`;
    }
    const n = ROMAN[level];
    const fs = simple ? (n.length > 3 ? 22 : n.length > 2 ? 26 : 32) : (n.length > 3 ? 15 : n.length > 2 ? 18 : 23);
    return `<svg class="emblem t-${t} ${extra}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Mastery ${n}">
      ${back}
      <polygon points="60,14 106,60 60,106 14,60" fill="url(#core-glow)" stroke="${m}" stroke-width="${simple ? 7 : 4}"/>
      ${simple ? "" : `<polygon points="60,23 97,60 60,97 23,60" fill="none" stroke="${m}" stroke-width="1" opacity=".55"/>
      <polygon points="60,30 90,60 60,90 30,60" class="em-core" fill="${m}"/>`}
      <text x="60" y="61" text-anchor="middle" dominant-baseline="central" class="em-num" font-size="${fs}" fill="${m}">${n}</text>
    </svg>`;
  }

  function medallion(L) {
    const R = 84, C = 2 * Math.PI * R;
    const rays = Array.from({ length: 72 }, (_, i) => {
      const a = (i * 5) * Math.PI / 180, r1 = 101, r2 = i % 2 ? 108 : 117;
      return `<line x1="${(120 + r1 * Math.cos(a)).toFixed(1)}" y1="${(120 + r1 * Math.sin(a)).toFixed(1)}" x2="${(120 + r2 * Math.cos(a)).toFixed(1)}" y2="${(120 + r2 * Math.sin(a)).toFixed(1)}"/>`;
    }).join("");
    return `<svg class="medallion" viewBox="0 0 240 240" role="img" aria-label="Account level ${L.level}, ${pct(L.progress)} to next">
      <defs>
        <path id="md-top" d="M 28 120 A 92 92 0 0 1 212 120"/>
        <path id="md-bot" d="M 22 120 A 98 98 0 0 0 218 120"/>
      </defs>
      <g class="md-rays">${rays}</g>
      <circle cx="120" cy="120" r="${R}" class="md-track"/>
      <circle cx="120" cy="120" r="${R}" class="md-prog" stroke-dasharray="${C.toFixed(1)}" style="--off:${(C * (1 - L.progress)).toFixed(1)};--full:${C.toFixed(1)}" transform="rotate(-90 120 120)"/>
      <polygon points="120,48 192,120 120,192 48,120" class="md-dia"/>
      <polygon points="120,60 180,120 120,180 60,120" class="md-dia-in"/>
      <text class="md-arc"><textPath href="#md-top" startOffset="50%" text-anchor="middle">Account · Level</textPath></text>
      <text class="md-arc dim"><textPath href="#md-bot" startOffset="50%" text-anchor="middle">${fmt(L.into)} / ${fmt(L.span)}</textPath></text>
      <text x="120" y="124" class="md-num" text-anchor="middle" dominant-baseline="central" ${countAttr(L.level)}>${L.level}</text>
    </svg>`;
  }

  // Playstyle sigil: radar of average performance vs hero baseline (dashed ring = global average).
  function sigil(ratios, opts = {}) {
    const cats = S.CATEGORIES.filter((c) => !c.bonus);
    const keys = cats.map((c) => c.key);
    const n = keys.length, cx = 150, cy = 150, R = 96, MAX = 1.6;
    const pt = (i, v) => {
      const a = (-90 + (360 / n) * i) * Math.PI / 180;
      return [cx + R * (v / MAX) * Math.cos(a), cy + R * (v / MAX) * Math.sin(a)];
    };
    const poly = (v) => keys.map((_, i) => pt(i, v).map((q) => q.toFixed(1)).join(",")).join(" ");
    const rings = [0.4, 0.8, 1.2, 1.6].map((v) => `<polygon points="${poly(v)}" class="sg-ring"/>`).join("") +
      `<polygon points="${poly(1)}" class="sg-avg"/>`;
    const axes = keys.map((_, i) => { const [x, y] = pt(i, MAX); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="sg-axis"/>`; }).join("");
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = i * 5 * Math.PI / 180, r1 = 110, r2 = i % 6 ? 113 : 117;
      return `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}"/>`;
    }).join("");
    // opts.compare: a second ratio set drawn as a second shape (Compare page).
    const shapeOf = (rs, cls) => {
      const vals = keys.map((k) => Math.min(MAX, rs[k] == null ? 0 : rs[k]));
      const pts = vals.map((v, i) => pt(i, Math.max(0.04, v)).map((q) => q.toFixed(1)).join(",")).join(" ");
      const dots = vals.map((v, i) => { const [x, y] = pt(i, Math.max(0.04, v)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" class="sg-dot ${cls}"><title>${cats[i].label}: ${rs[keys[i]] == null ? "n/a" : pct(rs[keys[i]])} of average</title></circle>`; }).join("");
      return `<polygon points="${pts}" class="sg-shape ${cls}"/>${dots}`;
    };
    const B = opts.compare;
    const shapes = (B ? shapeOf(B, "b") : "") + shapeOf(ratios, "a");
    const labels = keys.map((k, i) => {
      const [x, y] = pt(i, MAX * 1.33);
      const anchor = Math.abs(x - cx) < 8 ? "middle" : x < cx ? "end" : "start";
      const v = ratios[k];
      const pos = `x="${x.toFixed(1)}" dy="1.25em"`;
      const val = B ? `<tspan ${pos} class="sg-val">${v == null ? "–" : pct(v)}</tspan><tspan class="sg-val b"> · ${B[k] == null ? "–" : pct(B[k])}</tspan>`
        : `<tspan ${pos} class="sg-val">${v == null ? "–" : pct(v)}</tspan>`;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="sg-label${v == null ? " off" : ""}">${SHORT[k]}${val}</text>`;
    }).join("");
    return `<svg class="sigil ${opts.cls || ""}" viewBox="-30 0 360 300" role="img" aria-label="Playstyle compared with the global average">
      <circle cx="${cx}" cy="${cy}" r="120" class="sg-frame"/><g class="sg-ticks">${ticks}</g>
      ${rings}${axes}
      ${shapes}
      <circle cx="${cx}" cy="${cy}" r="3" class="sg-dot"/>
      ${labels}
    </svg>`;
  }

  function archetype(ratios) {
    // Wins and denies are too swingy to define a playstyle; they never take the lead.
    const ranked = Object.keys(ARCHETYPE).filter((k) => !["win", "denies"].includes(k) && ratios[k] != null)
      .sort((a, b) => ratios[b] - ratios[a]);
    if (!ranked.length) return null;
    return { primary: ARCHETYPE[ranked[0]], secondary: ranked[1] ? ARCHETYPE[ranked[1]] : null };
  }

  function ladder(points, cls = "") {
    const T = S.MASTERY_THRESHOLDS;
    return `<span class="ladder ${cls}" aria-hidden="true">${T.slice(1).map((t, i) => {
      const f = Math.max(0, Math.min(1, (points - T[i]) / (t - T[i])));
      return `<span class="lad-seg${f >= 1 ? " full" : ""}"><span style="width:${(f * 100).toFixed(1)}%"></span></span>`;
    }).join("")}</span>`;
  }
  const ladderRoman = (level) => `<div class="lad-roman" aria-hidden="true">${ROMAN.slice(1).map((r, i) => `<span class="${i < level ? "on" : ""}">${r}</span>`).join("")}</div>`;

  const seal = (g) => `<span class="seal ${gradeCls(g)}"><span>${g}</span></span>`;

  function nameplate(meta, cls) {
    return meta.nameArt
      ? `<div class="${cls} nameplate" role="img" aria-label="${esc(meta.name)}" style="--name:url('${esc(meta.nameArt)}')"></div>`
      : `<div class="${cls} nameplate text">${esc(meta.name)}</div>`;
  }

  const viewToggle = () => `<div class="seg view-toggle" role="group" aria-label="Show">${[["xp", "Mastery XP"], ["stats", "Core Stats"]]
    .map(([v, l]) => `<button type="button" data-view="${v}" aria-pressed="${state.view === v}">${l}</button>`).join("")}</div>`;

  function vsAvg(ratio) {
    if (ratio == null) return `<span class="vs none">–</span>`;
    const d = ratio - 1, w = Math.min(1, Math.abs(d)) * 50;
    return `<span class="vs ${d >= 0 ? "up" : "down"}"><span class="vs-bar"><span style="${d >= 0 ? "left" : "right"}:50%;width:${w.toFixed(1)}%"></span></span><b>${d >= 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}%</b></span>`;
  }

  function statTable(st, ratios, compact) {
    return `<div class="table-wrap"><table class="stat-table${compact ? " compact" : ""}"><thead><tr>
        <th>Stat</th>${compact ? "" : `<th class="num">Total</th>`}<th class="num">Per game</th><th class="num">Per min</th><th class="vs-h">vs hero avg</th>
      </tr></thead><tbody>${st.lines.map((l) => `<tr>
        <td>${l.label}</td>${compact ? "" : `<td class="num">${l.n ? fmtBig(l.total) : "–"}</td>`}
        <td class="num strong">${fmtAvg(l.avg)}</td><td class="num">${l.perMin == null ? "" : fmtAvg(l.perMin)}</td>
        <td>${l.base ? vsAvg(ratios[l.base]) : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function bestsList(st, cls = "") {
    return `<ul class="bests ${cls}">${st.bests.map((b) => {
      if (!b.best) return "";
      const r = b.best.rec, meta = heroMeta(r.hero);
      return `<li><a href="${DM.href.match(r.id)}" style="--hero-rgb:${meta.rgb}">
        ${meta.small ? `<img src="${esc(meta.small)}" alt="">` : `<span class="b-img"></span>`}
        <span class="b-label">${b.label}<small>${esc(meta.name)} · ${dateShort(r.t)} · ${r.won ? "Victory" : "Defeat"}</small></span>
        <b>${fmtBig(b.best.value)}</b></a></li>`;
    }).join("")}</ul>`;
  }

  // Shop item tile: slot-coloured frame, tier pips, name on hover.
  function itemIcon(it, opts = {}) {
    if (!it || !it.name) return "";
    const size = opts.size || 38;
    return `<span class="item s-${it.slot || "none"}${opts.sold ? " sold" : ""}" style="--sz:${size}px" title="${esc(it.name)}${it.cost ? ` · ${fmt(it.cost)} souls` : ""}${opts.t != null ? ` · ${DM.u.clock(opts.t / 60)}` : ""}">
      ${it.img ? `<img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy">` : ""}
      ${it.tier ? `<i class="it-tier">${"◆".repeat(Math.min(4, it.tier))}</i>` : ""}
    </span>`;
  }
  const buildStrip = (items, size = 30) => `<span class="build">${items.map((it) => itemIcon(it, { size })).join("")}</span>`;

  function heroChip(id, opts = {}) {
    const m = heroMeta(id);
    return `<span class="hero-chip" style="--hero-rgb:${m.rgb}">${m.small ? `<img src="${esc(m.small)}" alt="" loading="lazy">` : ""}${opts.noName ? "" : `<span>${esc(m.name)}</span>`}</span>`;
  }

  // Last N results as little lozenges, newest on the right.
  function formPips(recs, n = 20) {
    const last = recs.slice(0, n).reverse();
    return `<span class="pips" aria-label="Last ${last.length} results">${last.map((r) =>
      `<a class="pip ${r.won ? "w" : "l"}" href="${DM.href.match(r.id)}" title="${r.won ? "Win" : "Loss"} · ${esc(heroMeta(r.hero).name)} · ${dateShort(r.t)}"></a>`).join("")}</span>`;
  }

  function rankBadge(rank, size = 56) {
    if (!rank) return `<span class="rank-badge none" style="--sz:${size}px" title="Unranked"><span>?</span></span>`;
    return `<span class="rank-badge" style="--sz:${size}px;--rc:${esc(rank.color || "#d9b56a")}" title="${esc(rank.name)} ${rank.sub || ""}">
      <img src="${esc(rank.img)}" alt="${esc(rank.name)}"></span>`;
  }

  function abilityTiles(abilities) {
    return `<ol class="abilities">${abilities.map((a, i) => `
      <li style="--i:${i}">
        <span class="ab-key">${i + 1}</span>
        <span class="ab-icon">${a.img ? `<img src="${esc(a.img)}" alt="">` : ""}</span>
        <span class="ab-text"><b>${esc(a.name)}</b><small>${esc(a.quip || "")}</small></span>
        ${a.desc ? `<span class="ab-tip">${esc(a.desc)}</span>` : ""}
      </li>`).join("")}</ol>`;
  }

  const head = (eyebrow, title, right = "") => `<div class="section-head">
      <div class="orn-title"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${right ? `<div class="controls">${right}</div>` : ""}
    </div>`;

  const slotName = (s) => SLOT_NAMES[s] || s;

  DM.c = { emblem, medallion, sigil, archetype, ladder, ladderRoman, seal, nameplate, viewToggle, vsAvg,
    statTable, bestsList, itemIcon, buildStrip, heroChip, formPips, rankBadge, abilityTiles, head, slotName, item };
})();

// Dead Ledger - hand-rolled SVG charts in the house style, with hover read-outs.
(function () {
  "use strict";
  const { esc } = DM.u;
  const reg = {}; // chart id -> geometry + series, for the hover handler
  let uid = 0;

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p;
    return 10 * p;
  }

  // series: [{ label, values: [num|null], color: css colour, area: bool, fmt: fn, axis: "left"|"right",
  //            min, max, dashed }]
  // opts: { height, xLabel: i => string, refLines: [{ value, label, axis, cls }], markers: [{ i, label, cls }] }
  function line(series, opts = {}) {
    const id = "c" + (++uid);
    const W = opts.width || 760, H = opts.height || 220;
    const hasRight = series.some((s) => s.axis === "right");
    const pad = { l: 46, r: hasRight ? 46 : 18, t: 16, b: 28 };
    const n = Math.max(2, ...series.map((s) => s.values.length));
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const x = (i) => pad.l + (i / (n - 1)) * iw;
    const axes = {};
    for (const side of ["left", "right"]) {
      const ss = series.filter((s) => (s.axis || "left") === side);
      if (!ss.length) continue;
      const vals = ss.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
      const refs = (opts.refLines || []).filter((r) => (r.axis || "left") === side).map((r) => r.value);
      const min = ss[0].min != null ? ss[0].min : Math.min(0, ...vals);
      const max = ss[0].max != null ? ss[0].max : niceMax(Math.max(...vals, ...refs, 0) * 1.05);
      axes[side] = { min, max, fmt: ss[0].fmt || ((v) => Math.round(v)) };
    }
    const y = (v, side = "left") => {
      const a = axes[side];
      return pad.t + ih - ((v - a.min) / ((a.max - a.min) || 1)) * ih;
    };

    let grid = "";
    for (let k = 0; k <= 4; k++) {
      const gy = pad.t + (ih / 4) * k;
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" class="c-grid${k === 4 ? " base" : ""}"/>`;
      for (const side of Object.keys(axes)) {
        const a = axes[side], v = a.max - ((a.max - a.min) / 4) * k;
        grid += `<text x="${side === "left" ? pad.l - 8 : W - pad.r + 8}" y="${gy.toFixed(1)}" class="c-axis" text-anchor="${side === "left" ? "end" : "start"}" dominant-baseline="central">${esc(a.fmt(v))}</text>`;
      }
    }
    if (opts.xLabel) {
      const ticks = Math.min(6, n);
      for (let k = 0; k < ticks; k++) {
        const i = Math.round((k / (ticks - 1)) * (n - 1));
        grid += `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="c-axis" text-anchor="${k === 0 ? "start" : k === ticks - 1 ? "end" : "middle"}">${esc(opts.xLabel(i))}</text>`;
      }
    }
    // Reference lines; labels that would collide (<13px apart) are dropped, keeping the higher one.
    let lastLabelY = -Infinity;
    const refs = (opts.refLines || []).filter((r) => axes[r.axis || "left"] && r.value <= axes[r.axis || "left"].max)
      .sort((p, q) => q.value - p.value).map((r0) => {
      const ry = y(r0.value, r0.axis || "left");
      const r = { ...r0, label: r0.label && ry - lastLabelY >= 13 ? r0.label : "" };
      if (r.label) lastLabelY = ry;
      return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}" class="c-ref ${r.cls || ""}"/>` +
        (r.label ? `<text x="${W - pad.r - 6}" y="${(ry - 5).toFixed(1)}" text-anchor="end" class="c-ref-label ${r.cls || ""}">${esc(r.label)}</text>` : "");
    }).join("");

    const defs = [], paths = [];
    series.forEach((s, si) => {
      const side = s.axis || "left";
      let d = "", started = false, first = null, last = null;
      s.values.forEach((v, i) => {
        if (v == null || !isFinite(v)) { started = false; return; }
        d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v, side).toFixed(1)}`;
        started = true;
        if (first == null) first = i;
        last = i;
      });
      if (!d) return;
      if (s.area && first != null) {
        const gid = `${id}g${si}`;
        defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".38"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`);
        paths.push(`<path d="${d}L${x(last).toFixed(1)},${pad.t + ih}L${x(first).toFixed(1)},${pad.t + ih}Z" fill="url(#${gid})"/>`);
      }
      paths.push(`<path d="${d}" class="c-line${s.dashed ? " dashed" : ""}" style="stroke:${s.color}"/>`);
      if (last != null) paths.push(`<circle cx="${x(last).toFixed(1)}" cy="${y(s.values[last], side).toFixed(1)}" r="3.5" class="c-end" style="fill:${s.color}"/>`);
    });
    const marks = (opts.markers || []).map((m) => {
      const mx = x(m.i);
      return `<g class="c-mark ${m.cls || ""}"><line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${pad.t}" y2="${pad.t + ih}"/>` +
        `<path d="M${mx.toFixed(1)} ${pad.t + ih - 1} l4 -6 -4 -6 -4 6Z"/><title>${esc(m.label)}</title></g>`;
    }).join("");

    reg[id] = { W, H, pad, n, x, y, series, xLabel: opts.xLabel, tip: opts.tip };
    const legend = series.length > 1 || opts.legend ? `<div class="c-legend">${series.map((s) =>
      `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>` : "";
    return `<div class="chart" data-chart="${id}">${legend}
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || series.map((s) => s.label).join(", "))}">
        <defs>${defs.join("")}</defs>${grid}${refs}${marks}${paths.join("")}
        <line class="c-guide" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}"/>
        <g class="c-hdots">${series.map((s) => `<circle r="4.5" style="stroke:${s.color}"/>`).join("")}</g>
      </svg><div class="c-tip" hidden></div></div>`;
  }

  function onMove(e) {
    const el = e.target.closest && e.target.closest(".chart[data-chart]");
    if (!el) return;
    const c = reg[el.dataset.chart];
    if (!c) return;
    const svg = el.querySelector("svg"), r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * c.W;
    const i = Math.max(0, Math.min(c.n - 1, Math.round(((px - c.pad.l) / (c.W - c.pad.l - c.pad.r)) * (c.n - 1))));
    const gx = c.x(i);
    const guide = svg.querySelector(".c-guide");
    guide.setAttribute("x1", gx); guide.setAttribute("x2", gx);
    el.classList.add("hover");
    const dots = svg.querySelectorAll(".c-hdots circle");
    const rows = [];
    c.series.forEach((s, si) => {
      const v = s.values[i];
      const dot = dots[si];
      if (v == null || !isFinite(v)) { dot.style.display = "none"; return; }
      dot.style.display = "";
      dot.setAttribute("cx", gx); dot.setAttribute("cy", c.y(v, s.axis || "left"));
      rows.push(`<div><i style="background:${s.color}"></i>${esc(s.label)}<b>${esc((s.fmt || ((q) => Math.round(q)))(v))}</b></div>`);
    });
    const tip = el.querySelector(".c-tip");
    tip.innerHTML = `<div class="tip-h">${esc(c.tip ? c.tip(i) : c.xLabel ? c.xLabel(i) : `#${i + 1}`)}</div>${rows.join("")}`;
    tip.hidden = false;
    const left = (gx / c.W) * r.width;
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left + 12))}px`;
    if (left + 12 + tip.offsetWidth > r.width) tip.style.left = `${Math.max(4, left - tip.offsetWidth - 12)}px`;
  }
  function onLeave(e) {
    const el = e.target.closest && e.target.closest(".chart[data-chart]");
    if (el && !el.contains(e.relatedTarget)) { el.classList.remove("hover"); const t = el.querySelector(".c-tip"); if (t) t.hidden = true; }
  }
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerout", onLeave, { passive: true });

  // Horizontal bars. items: [{ label, value, display, sub, color, img, href, tc }]
  function bars(items, opts = {}) {
    const max = opts.max || Math.max(1, ...items.map((i) => i.value));
    return `<ul class="hbars">${items.map((it, k) => {
      const tag = it.href ? "a" : "div";
      return `<li style="--i:${k}"><${tag} class="hb-row"${it.href ? ` href="${esc(it.href)}"` : ""}${it.rgb ? ` style="--hero-rgb:${it.rgb}"` : ""}>
        ${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : ""}
        <span class="hb-label">${esc(it.label)}${it.sub ? `<small>${it.sub}</small>` : ""}</span>
        <span class="hb-track"><span style="--w:${((it.value / max) * 100).toFixed(1)}%${it.color ? `;background:${it.color}` : ""}"></span></span>
        <b class="hb-val">${it.display != null ? it.display : esc(it.value)}</b>
      </${tag}></li>`;
    }).join("")}</ul>`;
  }

  // Small column chart. values: numbers, labels: strings.
  function columns(values, labels, opts = {}) {
    const max = Math.max(1, ...values);
    const top = values.indexOf(Math.max(...values));
    return `<div class="cols" style="--n:${values.length}">${values.map((v, i) => `
      <div class="col${i === top && v > 0 ? " top" : ""}" title="${esc(labels[i])}: ${esc(opts.fmt ? opts.fmt(v) : v)}">
        <span class="col-bar"><span style="--h:${((v / max) * 100).toFixed(1)}%"></span></span>
        <span class="col-l">${esc(opts.short ? opts.short(i) : labels[i])}</span>
      </div>`).join("")}</div>`;
  }

  // GitHub-style activity calendar for the last `weeks` weeks.
  // days: Map "YYYY-MM-DD" -> { g: games, w: wins }
  function calendar(days, weeks = 53) {
    const cell = 12, gap = 3, step = cell + gap, left = 26, topPad = 18;
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay());
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let rects = "", months = "", lastMonth = -1;
    const max = Math.max(1, ...[...days.values()].map((v) => v.g));
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
        if (day > end) continue;
        const v = days.get(key(day));
        const lvl = !v ? 0 : Math.min(4, Math.ceil((v.g / max) * 4));
        const label = `${day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}: ${v ? `${v.g} game${v.g > 1 ? "s" : ""}, ${v.w} won` : "no games"}`;
        rects += `<rect x="${left + w * step}" y="${topPad + d * step}" width="${cell}" height="${cell}" rx="2" class="cal l${lvl}${v && v.w / v.g >= .5 ? " good" : ""}"><title>${esc(label)}</title></rect>`;
        if (d === 0 && day.getMonth() !== lastMonth && day.getDate() <= 7) {
          lastMonth = day.getMonth();
          months += `<text x="${left + w * step}" y="11" class="c-axis">${day.toLocaleDateString(undefined, { month: "short" })}</text>`;
        }
      }
    }
    const dows = [1, 3, 5].map((d) => `<text x="0" y="${topPad + d * step + 9}" class="c-axis">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</text>`).join("");
    const W = left + weeks * step, H = topPad + 7 * step;
    return `<div class="calendar"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Games played per day, last year">${months}${dows}${rects}</svg>
      <div class="cal-key"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="cal l${l}"></i>`).join("")}<span>More</span></div></div>`;
  }

  // Donut. segs: [{ value, color, label }]
  function donut(segs, opts = {}) {
    const size = opts.size || 150, r = size / 2 - 12, C = 2 * Math.PI * r;
    const total = segs.reduce((s, x) => s + x.value, 0) || 1;
    let off = 0;
    const arcs = segs.map((s) => {
      const len = (s.value / total) * C;
      const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="14"
        stroke-dasharray="${Math.max(0, len - 2).toFixed(2)} ${(C - Math.max(0, len - 2)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
        transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(s.label)}: ${Math.round((s.value / total) * 100)}%</title></circle>`;
      off += len;
      return el;
    }).join("");
    return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.aria || "Breakdown")}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="donut-track" stroke-width="14"/>${arcs}
      ${opts.center ? `<text x="50%" y="47%" text-anchor="middle" class="donut-big">${esc(opts.center)}</text>` : ""}
      ${opts.sub ? `<text x="50%" y="62%" text-anchor="middle" class="donut-sub">${esc(opts.sub)}</text>` : ""}
    </svg>`;
  }

  function spark(values, opts = {}) {
    const W = opts.width || 120, H = opts.height || 30;
    const v = values.filter((x) => x != null);
    if (v.length < 2) return "";
    const min = opts.min != null ? opts.min : Math.min(...v), max = opts.max != null ? opts.max : Math.max(...v);
    const d = v.map((q, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${(H - 2 - ((q - min) / ((max - min) || 1)) * (H - 4)).toFixed(1)}`).join("");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  // Rolling mean over a window (nulls ignored); returns null until `min` samples exist.
  function rolling(values, win, min = Math.ceil(win / 2)) {
    return values.map((_, i) => {
      const slice = values.slice(Math.max(0, i - win + 1), i + 1).filter((v) => v != null && isFinite(v));
      return slice.length >= Math.min(min, i + 1) ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
    });
  }

  DM.charts = { line, bars, columns, calendar, donut, spark, rolling, niceMax };
})();

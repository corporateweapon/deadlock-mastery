// Dead Ledger - shell polish: tooltips, toasts, the sync tube, chapter rail, back-to-top,
// keyboard shortcuts and the "dim the lights" switch. No data, no network: pure UI.
(function () {
  "use strict";
  const { CACHE_VER, REDUCED } = DM;
  const { $, esc } = DM.u;
  const FINE = matchMedia("(hover: hover) and (pointer: fine)");

  // ------------------------------------------------------------- tooltips ----
  // Any `title` becomes a styled tooltip (the native one is suppressed by moving the text to
  // data-tip). SVG <title> children get the same treatment. Touch devices keep the native behaviour.
  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  let tipFor = null, tipAt = 0;

  function tipText(el) {
    if (el.dataset && el.dataset.tip) return el.dataset.tip;
    if (el.hasAttribute && el.hasAttribute("title")) {
      const t = el.getAttribute("title");
      el.removeAttribute("title");
      el.dataset.tip = t;
      if (!el.hasAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", t);
      return t;
    }
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      const t = [...el.children].find((c) => c.tagName === "title");
      if (t) { el.dataset.tip = t.textContent; el.setAttribute("aria-label", t.textContent); t.remove(); return el.dataset.tip; }
    }
    return null;
  }
  function findTipTarget(start) {
    let el = start;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && (el.dataset.tip || el.hasAttribute("title") || (el.namespaceURI === "http://www.w3.org/2000/svg" && [...el.children].some((c) => c.tagName === "title")))) return el;
      el = el.parentNode;
    }
    return null;
  }
  function showTip(el) {
    const text = tipText(el);
    if (!text) return;
    tipFor = el; tipAt = performance.now();
    tip.textContent = text;
    tip.hidden = false;
    tip.className = "tip";
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
    if (y < 8) { y = r.bottom + 10; tip.classList.add("below"); }
    x = Math.max(8, Math.min(innerWidth - tw - 8, x));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // Arrow follows the anchor even when the box is clamped to the viewport edge.
    tip.style.setProperty("--ax", `${Math.round(Math.max(12, Math.min(tw - 12, r.left + r.width / 2 - x)))}px`);
    requestAnimationFrame(() => tip.classList.add("on"));
  }
  function hideTip() { tipFor = null; tip.hidden = true; tip.classList.remove("on"); }
  if (FINE.matches) {
    document.addEventListener("pointerover", (e) => {
      const el = findTipTarget(e.target);
      if (!el) { if (tipFor && !tipFor.contains(e.target)) hideTip(); return; }
      if (el !== tipFor) showTip(el);
    }, { passive: true });
    document.addEventListener("pointerout", (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); }, { passive: true });
    document.addEventListener("pointerdown", hideTip, { passive: true });
    // Scrolling hides the tip, except the scroll-into-view that can follow a hover or focus.
    addEventListener("scroll", () => { if (performance.now() - tipAt > 250) hideTip(); }, { passive: true });
  }
  document.addEventListener("focusin", (e) => { const el = findTipTarget(e.target); if (el && el.matches(":focus-visible")) showTip(el); });
  document.addEventListener("focusout", hideTip);

  // ---------------------------------------------------------------- toasts ----
  const toasts = document.createElement("div");
  toasts.className = "toasts"; toasts.setAttribute("aria-live", "polite");
  document.body.appendChild(toasts);
  function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = `<span class="toast-pip"></span><span>${esc(msg)}</span>`;
    toasts.appendChild(el);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 3400);
  }

  // ------------------------------------------------------------- sync tube ----
  // A neon tube along the top edge while a pull is in progress.
  const tube = document.createElement("div");
  tube.className = "tube"; tube.setAttribute("aria-hidden", "true");
  document.body.appendChild(tube);
  const busy = (on) => tube.classList.toggle("on", !!on);

  // ------------------------------------------------------------ back to top ----
  const totop = document.createElement("button");
  totop.className = "totop"; totop.type = "button"; totop.setAttribute("aria-label", "Back to top");
  totop.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 17 10 10 17 3 10Z"/><path d="m6.5 11 3.5-3.5 3.5 3.5"/></svg>`;
  totop.addEventListener("click", () => scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }));
  document.body.appendChild(totop);

  // ----------------------------------------------------------- chapter rail ----
  // Scroll-spy for the current page's sections (anything with data-rail). Wide screens only (CSS).
  const rail = document.createElement("nav");
  rail.className = "rail"; rail.setAttribute("aria-label", "On this page"); rail.hidden = true;
  document.body.appendChild(rail);
  let railObs = null;
  function buildRail() {
    if (railObs) { railObs.disconnect(); railObs = null; }
    const stops = [...document.querySelectorAll("#page [data-rail]")].slice(0, 12);
    if (stops.length < 3) { rail.hidden = true; rail.innerHTML = ""; return; }
    rail.innerHTML = stops.map((s, i) => `<button type="button" data-i="${i}"><i></i><span>${esc(s.dataset.rail)}</span></button>`).join("");
    rail.hidden = false;
    const btns = [...rail.children];
    btns.forEach((b, i) => b.addEventListener("click", () => {
      const y = stops[i].getBoundingClientRect().top + scrollY - 96;
      scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
    }));
    // The active stop is the last one whose top has passed the upper third of the viewport.
    const pick = () => {
      let on = 0;
      const line = innerHeight * 0.34;
      stops.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) on = i; });
      btns.forEach((b, i) => b.classList.toggle("on", i === on));
    };
    railObs = new IntersectionObserver(pick, { rootMargin: "-30% 0px -60% 0px", threshold: [0, 1] });
    stops.forEach((s) => railObs.observe(s));
    pick();
    rail._pick = pick;
  }

  // ------------------------------------------------------------ mobile tab bar ----
  // On phones the section nav becomes a fixed bar along the bottom. It has to live outside the
  // topbar for that: the topbar's backdrop-filter would otherwise pin "fixed" children to itself.
  const nav = document.querySelector(".topbar .jump");
  const topbar = document.querySelector(".topbar");
  const phone = matchMedia("(max-width: 640px)");
  function placeNav() {
    if (!nav) return;
    if (phone.matches) { if (nav.parentNode !== document.body) document.body.appendChild(nav); }
    else if (nav.parentNode !== topbar) topbar.insertBefore(nav, topbar.querySelector(".view-toggle"));
  }
  placeNav();
  phone.addEventListener("change", placeNav);

  // ------------------------------------------------------------ scroll state ----
  addEventListener("scroll", () => {
    document.body.classList.toggle("scrolled", scrollY > 8);
    totop.classList.toggle("on", scrollY > 700);
    if (rail._pick && !rail.hidden) rail._pick();
  }, { passive: true });

  // ----------------------------------------------------------- dim the lights ----
  // Switches off the smoke, grain, tilt and glow for people on modest machines. Remembered.
  const CALM_KEY = CACHE_VER + "calm";
  let calm = false;
  try { calm = localStorage.getItem(CALM_KEY) === "1"; } catch { /* ignore */ }
  function setCalm(on) {
    calm = !!on;
    document.body.classList.toggle("calm", calm);
    try { localStorage.setItem(CALM_KEY, calm ? "1" : "0"); } catch { /* ignore */ }
    for (const b of document.querySelectorAll("[data-calm]")) { b.textContent = calm ? "Light it up" : "Dim the lights"; b.setAttribute("aria-pressed", String(calm)); }
  }
  setCalm(calm);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-calm]")) setCalm(!calm); });

  // --------------------------------------------------------------- keyboard ----
  // "/" focuses the search anywhere; Esc closes the results; arrows walk them.
  const typing = (el) => el && (el.matches("input, textarea, select, [contenteditable]"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !typing(document.activeElement) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const input = $("#lookup-input") || document.querySelector("[data-welcome-find] input");
      if (input && input.offsetParent) { e.preventDefault(); input.focus(); input.select(); }
      return;
    }
    const box = $("#search-results");
    const input = $("#lookup-input");
    if (!box || !input) return;
    if (e.key === "Escape") {
      if (!box.hidden) { box.hidden = true; e.preventDefault(); }
      else if (document.activeElement === input) input.blur();
      return;
    }
    if (document.activeElement !== input || box.hidden) return;
    const items = [...box.querySelectorAll("button[data-id]")];
    if (!items.length) return;
    const cur = items.findIndex((b) => b.classList.contains("active"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
      items.forEach((b, i) => b.classList.toggle("active", i === next));
      items[next].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      items[cur].click();
    }
  });

  // Whenever the page content changes (routes, filters, async sections), rebuild the rail and
  // arm the ledger's "turn the page" button to fire on its own when it scrolls into view.
  let moreObs = null, railTimer = 0;
  function armMore() {
    if (moreObs) moreObs.disconnect();
    const btn = document.querySelector("#page [data-more]");
    if (!btn) return;
    moreObs = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) { moreObs.disconnect(); btn.click(); }
    }, { rootMargin: "0px 0px 600px 0px" });
    moreObs.observe(btn);
  }
  new MutationObserver(() => {
    clearTimeout(railTimer);
    railTimer = setTimeout(() => { buildRail(); armMore(); }, 60);
  }).observe($("#page"), { childList: true, subtree: true });

  // ------------------------------------------------------ table scroll hints ----
  // Wide tables show a glow on whichever edge still has columns hiding behind it.
  function hint(el) {
    const more = el.scrollWidth - el.clientWidth > 2;
    el.style.setProperty("--sl", more && el.scrollLeft > 2 ? "1" : "0");
    el.style.setProperty("--sr", more && el.scrollLeft < el.scrollWidth - el.clientWidth - 2 ? "1" : "0");
  }
  const hintAll = () => document.querySelectorAll(".table-wrap").forEach(hint);
  document.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("table-wrap")) hint(e.target); }, true);
  addEventListener("resize", hintAll, { passive: true });
  new MutationObserver(() => requestAnimationFrame(hintAll)).observe($("#page"), { childList: true, subtree: true });

  // --------------------------------------------------------- page transition ----
  function enter() {
    if (REDUCED) return;
    const page = $("#page");
    page.classList.remove("enter");
    void page.offsetWidth; // restart the animation
    page.classList.add("enter");
  }

  DM.ui = { toast, busy, buildRail, enter, setCalm, hideTip };
})();

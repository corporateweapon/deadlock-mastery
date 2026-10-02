// Deadlock Mastery - app shell: data sync, routing, page rendering and interactions.
(function () {
  "use strict";
  const { S, D, T, BASE, state, store, CACHE_VER, REDUCED, CAN_HOVER, ROMAN, FLAVOR } = DM;
  const { $, esc, tier } = DM.u;
  const { heroMeta } = DM.a;
  const C = DM.c;

  const ACCT_KEY = "acct3:";          // bump when record fields change (forces one re-pull)
  const HERO_KEY = "heroes:v3";
  const HERO_TTL = 24 * 3600e3;
  const EXTRA_TTL = 6 * 3600e3;
  const META_RETRY_MS = 6 * 3600e3;
  const PAGE = 30;

  function status(msg, kind) {
    const el = $("#status");
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  // ------------------------------------------------------------- data flow ----
  async function loadHeroes() {
    for (const old of ["heroes", "heroes:v2"]) { try { localStorage.removeItem(CACHE_VER + old); } catch { /* ignore */ } }
    const cached = store.get(HERO_KEY);
    if (cached && Date.now() - cached.at < HERO_TTL) state.heroes = cached.list;
    else {
      try {
        state.heroes = await D.fetchHeroes();
        store.set(HERO_KEY, { at: Date.now(), list: state.heroes });
      } catch (e) {
        state.heroes = cached ? cached.list : [];
        console.warn("hero assets", e);
      }
    }
    state.heroById = new Map(state.heroes.map((h) => [h.id, h]));
  }

  function loadCache(id) {
    for (const old of ["acct:", "acct2:"]) { try { localStorage.removeItem(CACHE_VER + old + id); } catch { /* ignore */ } }
    const c = store.get(ACCT_KEY + id);
    state.records = new Map((c && c.records || []).map((r) => [r.id, r]));
    state.metaTried = (c && c.metaTried) || {};
    state.profile = (c && c.profile) || null;
    return c;
  }
  function saveCache() {
    store.set(ACCT_KEY + state.accountId, { records: [...state.records.values()],
      metaTried: state.metaTried, profile: state.profile, synced: Date.now() });
  }

  async function openAccount(id, { force } = {}) {
    if (state.busy) return;
    const switching = id !== state.accountId;
    state.accountId = id;
    if (switching) {
      state.shown = PAGE; state.animate = true; state.company = null; state.rank = null; state.heroFilter = 0;
      state.matches.clear();
    }
    try { localStorage.setItem(CACHE_VER + "last", String(id)); } catch { /* ignore */ }
    updateNav();
    const cached = loadCache(id);
    if (state.records.size && state.profile) DM.rememberRecent(id, state.profile);
    if (state.records.size) { $("#loader").hidden = true; recompute(); renderPage(true); }
    else { $("#page").innerHTML = ""; $("#loader").hidden = false; }
    loadExtras();
    const fresh = cached && cached.synced && Date.now() - cached.synced < 120e3;
    if (!fresh || force) await sync();
    else status("Synced moments ago. Refresh to pull new matches.", "ok");
  }

  // Pull history + any missing match details for one account into `records` (a Map by match id).
  async function pullInto(id, records, metaTried, say) {
    say("Pulling match history…");
    const [hist, profile] = await Promise.all([D.fetchHistory(id), D.fetchProfile(id).catch(() => null)]);
    for (const h of hist) {
      const r = D.fromHistory(h);
      records.set(r.id, D.merge(records.get(r.id), r));
    }
    const now = Date.now();
    const need = [...records.values()]
      .filter((r) => !r.full && (!metaTried[r.id] || now - metaTried[r.id] > META_RETRY_MS))
      .map((r) => r.id);
    if (need.length) {
      say(`Fetching detailed stats for ${need.length} match${need.length > 1 ? "es" : ""}…`);
      const rows = need.length > 120
        ? await D.fetchAllMetadata(id)
        : await D.fetchMetadataFor(id, need, (done, total) => say(`Fetching detailed stats… ${done}/${total}`));
      for (const m of rows) {
        const r = D.fromMetadata(m, id);
        if (r) records.set(r.id, D.merge(records.get(r.id), r));
      }
      for (const mid of need) metaTried[mid] = now;
    }
    return { profile, found: hist.length };
  }

  // Scored result + Core Stats for a set of records.
  function summarize(records) {
    const result = S.computeAll([...records.values()], BASE);
    const counted = result.scored.filter((x) => x.score.eligible).map((x) => x.rec);
    const byHero = {};
    for (const r of counted) (byHero[r.hero] = byHero[r.hero] || []).push(r);
    const stats = { account: T.aggregate(counted), heroes: {} };
    for (const [id, rs] of Object.entries(byHero)) stats.heroes[id] = T.aggregate(rs);
    return { result, stats };
  }

  // Another account's full data (for Compare), without touching the active account.
  // Cached like any account; refreshed if older than 10 minutes.
  const bundles = new Map();
  DM.loadBundle = async function (id, say = () => {}) {
    if (id === state.accountId) return { id, profile: state.profile, records: state.records, result: state.result, stats: state.stats };
    const mem = bundles.get(id);
    if (mem && Date.now() - mem.at < 10 * 60e3) return mem;
    const c = store.get(ACCT_KEY + id);
    const records = new Map((c && c.records || []).map((r) => [r.id, r]));
    const metaTried = (c && c.metaTried) || {};
    let profile = (c && c.profile) || null;
    if (!(c && c.synced && Date.now() - c.synced < 10 * 60e3 && records.size)) {
      const got = await pullInto(id, records, metaTried, say);
      if (got.profile) profile = got.profile;
      if (!records.size) throw new Error("No Deadlock matches found for that account.");
      store.set(ACCT_KEY + id, { records: [...records.values()], metaTried, profile, synced: Date.now() });
    }
    if (profile) state.profiles.set(id, profile);
    const b = { id, profile, records, ...summarize(records), at: Date.now() };
    bundles.set(id, b);
    return b;
  };

  async function sync() {
    const id = state.accountId;
    state.busy = true;
    $("#refresh").classList.add("spinning");
    $("#refresh").disabled = true;
    try {
      const { profile } = await pullInto(id, state.records, state.metaTried, (m) => { if (id === state.accountId) status(m); });
      if (id !== state.accountId) return;
      if (profile) { state.profile = profile; state.profiles.set(id, profile); }
      if (state.records.size) DM.rememberRecent(id, state.profile);
      if (!state.records.size) {
        $("#loader").hidden = true;
        status("No Deadlock matches found for this account. If it's new or private, deadlock-api may not have it yet.", "warn");
        return;
      }
      saveCache();
      $("#loader").hidden = true;
      recompute();
      renderPage(false);
      checkRankUps();
      const est = state.result.account.estimated;
      status(est ? `Up to date. ${est} match${est > 1 ? "es have" : " has"} no detailed stats on deadlock-api yet, so damage, healing and objective points are estimated from your own averages on that hero.` : "Up to date.", "ok");
    } catch (e) {
      console.error(e);
      $("#loader").hidden = true;
      status(e.message || String(e), "error");
    } finally {
      state.busy = false;
      $("#refresh").disabled = false;
      $("#refresh").classList.remove("spinning");
    }
  }

  function recompute() {
    const { result, stats } = summarize(state.records);
    state.result = result;
    state.stats = stats;
  }

  // Global hero meta + this account's rank: nice-to-have, cached, never blocking.
  function loadExtras() {
    const id = state.accountId;
    state.heroMeta = store.fresh("herometa", EXTRA_TTL);
    if (!state.heroMeta) {
      D.fetchHeroMeta().then((m) => { state.heroMeta = m; store.keep("herometa", m); if (state.route.page === "hero") renderPage(false); }).catch(() => {});
    }
    state.rank = store.fresh("rank:" + id, EXTRA_TTL);
    if (!state.rank) D.fetchRank(id).then((r) => { if (r && id === state.accountId) { state.rank = r; store.keep("rank:" + id, r); } }).catch(() => {});
  }

  // Teammates and rivals for the overview, with their Steam names.
  DM.loadCompany = async function () {
    const id = state.accountId;
    if (state.company) return;
    const cached = store.fresh("company2:" + id, EXTRA_TTL);
    const paint = () => { const el = $("#company"); if (el && state.route.page === "overview") el.innerHTML = DM.pages.overviewParts.company(); };
    try {
      const data = cached || await (async () => {
        const mates = await D.fetchMates(id);
        // Matches shared with any regular teammate: the "squad" games.
        const squad = [...new Set(mates.flatMap((x) => x.matches || []))];
        const list = mates.map((x) => ({ id: x.mate_id, games: x.matches_played, wins: x.wins }))
          .sort((a, b) => b.games - a.games).slice(0, 8);
        return { mates: list, squad };
      })();
      const ids = data.mates.map((x) => x.id).filter((a) => !state.profiles.has(a));
      if (ids.length) for (const p of await D.fetchProfiles(ids)) state.profiles.set(p.account_id, p);
      if (id !== state.accountId) return;
      if (!cached) store.keep("company2:" + id, data);
      state.company = data;
    } catch (e) {
      state.company = { error: "Couldn't reach the teammate records right now." };
    }
    paint();
  };

  // ---------------------------------------------------------------- routing ----
  function updateNav() {
    for (const a of document.querySelectorAll("[data-nav]")) {
      const p = a.dataset.nav;
      a.setAttribute("href", p === "overview" ? DM.href.overview() : DM.href.page(p));
    }
  }

  // No account in the link: reopen this browser's last player, or show the welcome page.
  // "#start" always shows the welcome page.
  function showWelcome() {
    state.route = { page: "welcome", arg: null };
    document.body.dataset.page = "welcome";
    document.body.style.setProperty("--hero-rgb", "217,181,106");
    $("#loader").hidden = true;
    status("");
    DM.pages.welcome($("#page"));
    document.title = "Deadlock Mastery";
    window.scrollTo(0, 0);
  }

  async function route() {
    const r = DM.parseHash(location.hash);
    if (location.hash === "#start") return showWelcome();
    let last = null;
    try { last = Number(localStorage.getItem(CACHE_VER + "last")) || null; } catch { /* ignore */ }
    const acct = r.acct || state.accountId || last;
    if (!acct) return showWelcome();
    const pageChanged = r.page !== state.route.page || r.arg !== state.route.arg;
    state.route = { page: r.page, arg: r.arg };
    if (!r.acct) history.replaceState(null, "", location.pathname + location.search + "#" + acct);
    $("#lookup-input").value = String(acct);
    if (acct !== state.accountId) { await openAccount(acct); return; }
    if (state.result) renderPage(pageChanged);
  }

  function renderPage(scrollTop) {
    if (!state.result) return;
    const { page, arg } = state.route;
    for (const a of document.querySelectorAll("[data-nav]")) {
      const p = a.dataset.nav;
      a.classList.toggle("active", p === page || (p === "heroes" && page === "hero") || (p === "matches" && page === "match"));
    }
    // Hero and match pages tint the whole site in the hero's colour.
    let rgb = "217,181,106";
    if (page === "hero" && arg) rgb = heroMeta(arg).rgb;
    if (page === "match") {
      const rec = state.records.get(arg);
      if (rec) rgb = heroMeta(rec.hero).rgb;
    }
    document.body.style.setProperty("--hero-rgb", rgb);
    document.body.dataset.page = page;
    const el = $("#page");
    const fn = DM.pages[page] || DM.pages.overview;
    fn(el, arg);
    if (state.animate) { runCountUps(el); setTimeout(() => { state.animate = false; }, 50); }
    if (scrollTop) window.scrollTo({ top: 0, behavior: "auto" });
    const titles = { overview: "", heroes: "Heroes · ", matches: "Ledger · ", codex: "Codex · ", compare: "Compare · ",
      hero: arg ? `${heroMeta(arg).name} · ` : "", match: arg ? `Match ${arg} · ` : "" };
    document.title = `${titles[page] || ""}${state.profile ? state.profile.personaname + " · " : ""}Deadlock Mastery`;
  }

  // Mastery XP <-> Core Stats, everywhere at once.
  function setView(v) {
    state.view = v === "stats" ? "stats" : "xp";
    try { localStorage.setItem(CACHE_VER + "view", state.view); } catch { /* ignore */ }
    for (const b of document.querySelectorAll("button[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
    renderPage(false);
  }

  // ------------------------------------------------------------ ceremony ----
  function checkRankUps() {
    const res = state.result;
    const key = "seen:" + state.accountId;
    const seen = store.get(key);
    const now = { acct: res.account.level.level, heroes: {} };
    for (const h of Object.values(res.heroes)) now.heroes[h.hero] = h.mastery.level;
    store.set(key, now);
    if (!seen) return; // first visit: everything is "new", don't throw a parade
    const events = [];
    for (const [id, lvl] of Object.entries(now.heroes)) {
      if (lvl > (seen.heroes[id] || 0)) events.push({ kind: "hero", hero: Number(id), level: lvl });
    }
    events.sort((a, b) => b.level - a.level);
    if (now.acct > seen.acct) events.push({ kind: "account", level: now.acct });
    if (events.length) showCeremony(events);
  }

  function showCeremony(events) {
    const el = $("#ceremony");
    let i = 0;
    const show = () => {
      const e = events[i];
      const next = i === events.length - 1 ? "Onward" : `Next (${i + 1}/${events.length})`;
      if (e.kind === "hero") {
        const meta = heroMeta(e.hero);
        el.className = `ceremony t-${tier(e.level)}`;
        el.style.setProperty("--hero-rgb", meta.rgb);
        el.innerHTML = `<div class="cer-rays"></div><div class="cer-card">
          <div class="cer-emblem">${C.emblem(e.level, 220, "big")}</div>
          <div class="eyebrow">Rank achieved</div>
          <h2 class="cer-title">Mastery ${ROMAN[e.level]}</h2>
          <div class="cer-sub">${S.MASTERY_TITLES[e.level]} <span>◆</span> ${esc(meta.name)}</div>
          <p class="flavor">“${FLAVOR[e.level]}”</p>
          <button class="btn-gold" type="button">${next}</button></div>`;
      } else {
        el.className = "ceremony t-gold";
        el.style.setProperty("--hero-rgb", "217,181,106");
        el.innerHTML = `<div class="cer-rays"></div><div class="cer-card">
          <div class="cer-emblem acct">${C.medallion(state.result.account.level)}</div>
          <div class="eyebrow">Account level up</div>
          <h2 class="cer-title">Level ${e.level}</h2>
          <p class="flavor">“The ledger grows heavier with your name.”</p>
          <button class="btn-gold" type="button">${next}</button></div>`;
      }
      el.hidden = false;
      const btn = el.querySelector("button");
      btn.focus();
      btn.onclick = () => { i++; if (i < events.length) show(); else el.hidden = true; };
    };
    show();
  }

  // -------------------------------------------------------------- motion ----
  function runCountUps(root) {
    if (REDUCED) return;
    const items = [...root.querySelectorAll("[data-count]")]
      .map((el) => ({ el, to: Number(el.dataset.count), dec: Number(el.dataset.dec || 0) }));
    const t0 = performance.now(), dur = 1300;
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const frame = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      for (const it of items) {
        const v = it.to * k;
        it.el.textContent = it.dec ? v.toFixed(it.dec) : Math.round(v).toLocaleString();
      }
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function wireTilt() {
    if (!CAN_HOVER || REDUCED) return;
    let active = null;
    const reset = (c) => { for (const p of ["--rx", "--ry", "--mx", "--my"]) c.style.removeProperty(p); };
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest && e.target.closest(".tcard");
      if (active && active !== card) reset(active);
      active = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--rx", ((0.5 - py) * 10).toFixed(2) + "deg");
      card.style.setProperty("--ry", ((px - 0.5) * 12).toFixed(2) + "deg");
      card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    }, { passive: true });
  }

  // --------------------------------------------------------------- input ----
  async function handleLookup(value) {
    const box = $("#search-results");
    box.hidden = true;
    const p = D.parseSteamInput(value);
    if (p.error) return status(p.error, "warn");
    if (p.accountId) { location.hash = "#" + p.accountId; return; }
    status(p.vanity ? `Custom URLs can't be resolved without a Steam key, so searching names for "${p.search}"…` : `Searching for "${p.search}"…`);
    try {
      const hits = await D.searchProfiles(p.search);
      if (!hits.length) return status(`No Deadlock players match "${p.search}". Try your SteamID64 (Steam → Account details).`, "warn");
      status("");
      box.innerHTML = hits.map((h) => `<button type="button" data-id="${h.account_id}">
        <img src="${esc(h.avatar)}" alt=""><span>${esc(h.personaname)}</span><span class="sr-id">${h.account_id}</span></button>`).join("");
      box.hidden = false;
    } catch (e) { status(e.message, "error"); }
  }

  function wire() {
    $("#lookup").addEventListener("submit", (e) => { e.preventDefault(); handleLookup($("#lookup-input").value); });
    $("#refresh").addEventListener("click", () => state.accountId && openAccount(state.accountId, { force: true }));
    $("#share").addEventListener("click", async () => {
      const url = location.origin + location.pathname + location.hash;
      try { await navigator.clipboard.writeText(url); status("Link copied. Anyone with it lands on this exact page.", "ok"); }
      catch { status(url, "ok"); }
    });

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t.closest("#lookup")) $("#search-results").hidden = true;
      const pick = t.closest("#search-results button[data-id]");
      if (pick) { $("#search-results").hidden = true; location.hash = "#" + pick.dataset.id; return; }
      const vb = t.closest("button[data-view]");
      if (vb) { setView(vb.dataset.view); return; }
      const set = (attr, key, reset) => {
        const b = t.closest(`button[data-${attr}]`);
        if (!b) return false;
        state[key] = b.dataset[attr];
        if (reset) state.shown = PAGE;
        renderPage(false);
        return true;
      };
      if (set("sort", "sort") || set("role", "role") || set("filter", "filter", true) || set("form", "formTab") || set("race", "raceKey")) return;
      if (t.closest("[data-more]")) { state.shown += PAGE * 2; renderPage(false); return; }
      const hl = t.closest("[data-hero-ledger]");
      if (hl) { state.heroFilter = Number(hl.dataset.heroLedger); state.filter = "all"; state.shown = PAGE; return; }
      // Whole ledger rows are clickable; real links inside them win.
      const row = t.closest("tr[data-href]");
      if (row && !t.closest("a")) { location.hash = row.dataset.href; }
    });
    document.addEventListener("submit", (e) => {
      if (e.target.matches("[data-compare-find]")) { e.preventDefault(); DM.compareSearch(e.target); }
      if (e.target.matches("[data-welcome-find]")) { e.preventDefault(); DM.welcomeSearch(e.target); }
    });
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-uncharted]")) { state.showUncharted = e.target.checked; renderPage(false); }
      if (e.target.matches("[data-hero-filter]")) { state.heroFilter = Number(e.target.value); state.shown = PAGE; renderPage(false); }
    });
    window.addEventListener("hashchange", route);
    window.addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 8), { passive: true });
    wireTilt();
  }

  async function init() {
    wire();
    for (const b of document.querySelectorAll("button[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
    status("Loading heroes…");
    await loadHeroes();
    await route();
    // ?ceremony previews the rank-up screen with your top hero and account level.
    if (new URLSearchParams(location.search).has("ceremony") && state.result) {
      const top = Object.values(state.result.heroes).sort((x, y) => y.points - x.points)[0];
      if (top) showCeremony([{ kind: "hero", hero: top.hero, level: top.mastery.level }, { kind: "account", level: state.result.account.level.level }]);
    }
  }

  init();
})();

// Welcome page: first stop for anyone without an account in the link.
(function () {
  "use strict";
  const { state, store } = DM;
  const { esc } = DM.u;
  const C = DM.c;

  const recent = () => (store.get("recent") || []).filter((r) => r && r.id);

  // Remember accounts this browser has opened (local only, never leaves the browser).
  DM.rememberRecent = function (id, profile) {
    const list = recent().filter((r) => r.id !== id);
    list.unshift({ id, name: profile && profile.personaname, avatar: profile && profile.avatarmedium });
    store.set("recent", list.slice(0, 6));
  };

  function render(el) {
    const seen = recent();
    el.innerHTML = `<section class="welcome">
      <div class="wl-mark" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <g class="wl-rays">${Array.from({ length: 48 }, (_, i) => {
            const a = (i * 7.5) * Math.PI / 180, r1 = 78, r2 = i % 2 ? 88 : 98;
            return `<line x1="${(100 + r1 * Math.cos(a)).toFixed(1)}" y1="${(100 + r1 * Math.sin(a)).toFixed(1)}" x2="${(100 + r2 * Math.cos(a)).toFixed(1)}" y2="${(100 + r2 * Math.sin(a)).toFixed(1)}"/>`;
          }).join("")}</g>
          <path d="M100 26 174 100 100 174 26 100Z" class="wl-o"/>
          <path d="M100 42 158 100 100 158 42 100Z" class="wl-i"/>
          <path d="M62 100q38-34 76 0-38 34-76 0Z" class="wl-eye"/>
          <circle cx="100" cy="100" r="11" class="wl-pupil"/>
        </svg>
      </div>
      <div class="eyebrow">Meta progression for Deadlock</div>
      <h1 class="wl-title"><span>Deadlock</span> <em>Mastery</em></h1>
      <p class="flavor">“The city keeps a ledger on everyone. Here's yours.”</p>
      ${state.me ? `<a class="btn-gold wl-steam" href="#${state.me.accountId}">Continue to my dossier</a><div class="wl-or">or look someone else up</div>`
        : state.server && state.server.auth ? `<a class="btn-gold wl-steam" href="/auth/steam">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 10h9M13 7l3 3-3 3"/><path d="M11 4H4v12h7"/></svg>Sign in with Steam</a>
          <div class="wl-or">or look anyone up without signing in</div>` : ""}
      <form class="wl-find" data-welcome-find autocomplete="off">
        <input type="text" name="q" placeholder="Steam friend code, profile link or player name" aria-label="Your Steam account" autofocus>
        <button class="btn-gold" type="submit">Open my dossier</button>
      </form>
      <div class="wl-hits" id="wl-hits"></div>
      <details class="wl-help">
        <summary>Where do I find this?</summary>
        <ul>
          <li><b>Steam friend code</b> (easiest): in Steam, open <i>Friends → Add a Friend</i>. The number under "Your Friend Code" works as-is.</li>
          <li><b>Profile link</b>: paste your <i>steamcommunity.com/profiles/7656…</i> link, or just the 17-digit SteamID64.</li>
          <li><b>Name</b>: type your Steam name and pick yourself from the list.</li>
        </ul>
        <p class="fine">Match data comes from deadlock-api.com and only covers public match history. Signing in uses Steam's own login page: this site never sees your password, only your public SteamID.</p>
      </details>
      ${seen.length ? `<div class="wl-recent">
        <h3 class="h-small">Recently viewed <span class="h-note">on this browser</span></h3>
        <div class="cmp-mates">${seen.map((r) => `<a class="cmp-mate" href="#${r.id}">
          <span class="pp-av">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : ""}</span>
          <span class="pp-name"><b>${esc(r.name || `Player ${r.id}`)}</b><small>${r.id}</small></span><span class="cmp-go">›</span></a>`).join("")}</div>
      </div>` : ""}
      <div class="wl-features">
        <div>${C.emblem(10, 64)}<b>Hero mastery</b><span>Ten ranks per hero, earned from every game you've played.</span></div>
        <div>${C.emblem(7, 64)}<b>Account level</b><span>An uncapped level built from wins, kills, souls, healing and more.</span></div>
        <div>${C.emblem(5, 64)}<b>Full stats</b><span>Match scoreboards, builds, trends, activity and personal bests.</span></div>
        <div>${C.emblem(3, 64)}<b>Head to head</b><span>Put your dossier next to a friend's, category by category.</span></div>
      </div>
    </section>`;
  }

  DM.welcomeSearch = async function (form) {
    const box = document.getElementById("wl-hits");
    const p = DM.D.parseSteamInput(form.q.value);
    if (p.error) { box.innerHTML = `<p class="fine">${esc(p.error)}</p>`; return; }
    if (p.accountId) { location.hash = "#" + p.accountId; return; }
    box.innerHTML = `<p class="loading-line">Searching for “${esc(p.search)}”…</p>`;
    try {
      const hits = await DM.D.searchProfiles(p.search);
      box.innerHTML = hits.length ? `<div class="cmp-mates">${hits.map((h) => `<a class="cmp-mate" href="#${h.account_id}">
          <span class="pp-av"><img src="${esc(h.avatar)}" alt=""></span><span class="pp-name"><b>${esc(h.personaname)}</b><small>${h.account_id}</small></span><span class="cmp-go">›</span></a>`).join("")}</div>`
        : `<p class="fine">No Deadlock players match “${esc(p.search)}”. Try your Steam friend code instead.</p>`;
    } catch (e) { box.innerHTML = `<p class="fine">${esc(e.message)}</p>`; }
  };

  DM.pages = DM.pages || {};
  DM.pages.welcome = render;
})();

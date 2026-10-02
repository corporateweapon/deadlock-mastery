// Codex page: how every number on the site is made.
(function () {
  "use strict";
  const { S, BASE, ROMAN } = DM;
  const { esc, fmt } = DM.u;
  const C = DM.c;

  function render(el) {
    const w = S.weightsFor(BASE, "normal");
    el.innerHTML = `<section class="panel codex">
      ${C.head("The Codex", "How Progression Works")}
      <div class="codex-ladder">${S.MASTERY_THRESHOLDS.slice(1).map((t, i) => `
        <div class="cl-step">${C.emblem(i + 1, 64)}<b>${S.MASTERY_TITLES[i + 1]}</b><span>${fmt(t)} pts</span><small>≈ ${Math.round(t / 100)} games</small></div>`).join("")}
      </div>
      <div class="rules-grid">
        <div>
          <h3 class="h-small">Points per game</h3>
          <p>Each stat is compared with the global average <em>for that hero</em>, so an average game on any hero is worth about 100 points. A Dynamo isn't punished for low damage, and a Haze isn't handed points for low healing. One stat pays at most ${S.RATIO_CAP}× its share in a game. Losses add a flat ${S.LOSS_BONUS}-point participation bonus.</p>
          <table class="mini"><thead><tr><th>Category</th><th class="num">Avg game</th><th class="num">Ceiling</th></tr></thead><tbody>
            ${S.CATEGORIES.map((c) => `<tr><td>${c.label}</td><td class="num">${c.key === "win" ? `${w.win * 2} win · 0 loss` : c.bonus ? `${S.LOSS_BONUS} per loss` : w[c.key].toFixed(0)}</td><td class="num">${c.key === "win" ? w.win * 2 : c.bonus ? S.LOSS_BONUS : (w[c.key] * S.RATIO_CAP).toFixed(0)}</td></tr>`).join("")}
          </tbody></table>
          <p class="fine">Street Brawl pays ×${S.MODE_SCALE.brawl} (games run ~40% as long) and spreads its missing denies over the other stats. Bot games, private lobbies, abandons and games under ${S.MIN_DURATION_S / 60} minutes earn nothing. Baselines snapshot ${esc(BASE.generated)}, last ${BASE.window_days} days.</p>
        </div>
        <div>
          <h3 class="h-small">Grades</h3>
          <div class="grade-key">${S.GRADES.map((g) => `<span>${C.seal(g.grade)} ${g.min ? `${g.min}+` : `under ${S.GRADES[S.GRADES.length - 2].min}`}</span>`).join("")}</div>
          <p class="fine">Scored on one game's performance points: no loss bonus, no Street Brawl scaling. An average loss lands around 80 (B), an average win around 120 (S).</p>
          <h3 class="h-small">Beyond Mastery ${ROMAN[10]}</h3>
          <p>Points keep stacking after X and show on the card, but the rank stops climbing.</p>
          <h3 class="h-small">Account level</h3>
          <p>Every counted game also feeds your account level, which has no cap. Level <i>L</i> → <i>L</i>+1 costs ${S.ACCOUNT_BASE} + ${S.ACCOUNT_STEP}×(<i>L</i>−1) points, flattening at ${fmt(S.ACCOUNT_MAX_STEP)} from level ${(S.ACCOUNT_MAX_STEP - S.ACCOUNT_BASE) / S.ACCOUNT_STEP + 1} on.</p>
          <table class="mini"><thead><tr><th>Level</th><th class="num">Total pts</th><th class="num">≈ avg games</th></tr></thead><tbody>
            ${[5, 10, 20, 30, 50, 100].map((L) => `<tr><td>${L}</td><td class="num">${fmt(S.accountThreshold(L))}</td><td class="num">${fmt(S.accountThreshold(L) / 100)}</td></tr>`).join("")}
          </tbody></table>
          <h3 class="h-small">Where the data comes from</h3>
          <p class="fine">Match history and match details from <a href="https://deadlock-api.com" target="_blank" rel="noopener">deadlock-api.com</a>. Global hero averages, win and pick rates come from its analytics endpoints. Voice lines are verbatim from the <a href="https://deadlock.wiki" target="_blank" rel="noopener">Deadlock Wiki</a>.</p>
        </div>
      </div>
    </section>`;
  }

  DM.pages = DM.pages || {};
  DM.pages.codex = render;
})();

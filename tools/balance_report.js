// Balance report: pulls an account's real history and prints what the current
// knobs in js/scoring.js produce.  node tools/balance_report.js <SteamID3>
const fs = require("fs");
const path = require("path");
const S = require("../public/js/scoring.js");
const D = require("../public/js/data.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "data", "baselines.js"), "utf8");
const baselines = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
const accountId = Number(process.argv[2]);
if (!accountId) { console.error("usage: node tools/balance_report.js <SteamID3>"); process.exit(1); }

(async () => {
  const [hist, meta] = await Promise.all([D.fetchHistory(accountId), D.fetchAllMetadata(accountId)]);
  const recs = new Map();
  for (const h of hist) recs.set(h.match_id, D.fromHistory(h));
  for (const m of meta) {
    const r = D.fromMetadata(m, accountId);
    if (r) recs.set(r.id, D.merge(recs.get(r.id), r));
  }
  const res = S.computeAll([...recs.values()], baselines);
  const a = res.account;
  const f = (n) => Math.round(n).toLocaleString("en-US");

  console.log(`account ${accountId}: ${recs.size} matches, ${a.matches} counted, ${a.estimated} estimated, skipped`, a.skipped);
  console.log(`account level ${a.level.level} (${f(a.points)} pts, ${f(a.level.toNext)} to next)`);
  console.log(`avg pts/game ${(a.points / a.matches).toFixed(1)}  grades`, a.grades);
  console.log("category share:");
  for (const c of S.CATEGORIES) console.log(`  ${c.label.padEnd(17)} ${f(a.cats[c.key]).padStart(7)}  ${(100 * a.cats[c.key] / a.points).toFixed(1)}%`);

  const raws = res.scored.filter((x) => x.score.eligible).map((x) => x.score.raw).sort((p, q) => p - q);
  const q = (p) => raws[Math.floor(p * (raws.length - 1))].toFixed(0);
  console.log(`raw per game p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}`);

  console.log("\nhero mastery:");
  for (const h of Object.values(res.heroes).sort((x, y) => y.points - x.points)) {
    const m = h.mastery;
    console.log(`  hero ${String(h.hero).padStart(3)}  ${String(h.matches).padStart(4)} games  ${f(h.points).padStart(7)} pts  M${m.level}${m.maxed ? ` (+${f(m.overflow)})` : ` ${(m.progress * 100).toFixed(0)}%`}`);
  }

  console.log("\naccount curve (level: cumulative pts / ~games at 100 pts):");
  for (const L of [2, 5, 10, 20, 30, 50, 100]) console.log(`  L${L}: ${f(S.accountThreshold(L))} / ~${Math.round(S.accountThreshold(L) / 100)}`);
})().catch((e) => { console.error(e); process.exit(1); });

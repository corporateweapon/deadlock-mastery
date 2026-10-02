// Prints the Core Stats aggregation for an account.  node tools/stats_report.js <SteamID3>
const S = require("../public/js/scoring.js"), D = require("../public/js/data.js"), T = require("../public/js/stats.js");
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "data", "baselines.js"), "utf8");
const B = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
const id = Number(process.argv[2]);
if (!id) { console.error("usage: node tools/stats_report.js <SteamID3>"); process.exit(1); }
(async () => {
  const [hist, meta] = await Promise.all([D.fetchHistory(id), D.fetchAllMetadata(id)]);
  const recs = new Map();
  for (const h of hist) recs.set(h.match_id, D.fromHistory(h));
  for (const m of meta) { const r = D.fromMetadata(m, id); if (r) recs.set(r.id, D.merge(recs.get(r.id), r)); }
  const res = S.computeAll([...recs.values()], B);
  const st = T.aggregate(res.scored.filter((x) => x.score.eligible).map((x) => x.rec));
  console.log(`games ${st.games} (${st.fullGames} detailed)  WR ${(st.wins / st.games * 100).toFixed(1)}%  KDA ${st.kda.toFixed(2)}  acc ${st.accuracy && (st.accuracy * 100).toFixed(1)}%  hs ${st.headshot && (st.headshot * 100).toFixed(1)}%  lvl ${st.level && st.level.toFixed(1)}  hours ${(st.seconds / 3600).toFixed(1)}  streak ${st.streak}`);
  for (const l of st.lines) console.log(`  ${l.label.padEnd(17)} total ${String(Math.round(l.total)).padStart(9)}  avg ${l.avg == null ? "-" : l.avg.toFixed(1).padStart(8)}  /min ${l.perMin == null ? "" : l.perMin.toFixed(1)}`);
  for (const b of st.bests) console.log(`  ${b.label.padEnd(22)} ${b.best ? b.best.value + " (hero " + b.best.rec.hero + ")" : "-"}`);
})().catch((e) => { console.error(e); process.exit(1); });

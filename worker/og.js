// Share cards (1200x630 PNG) for Discord / social link previews, in the site's art-deco style.
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { S, ROMAN, hero, rankFor } from "./core.js";

const GF = "https://github.com/google/fonts/raw/main/ofl";
const fonts = () => [
  new CustomFont("Forum", () => fetch(`${GF}/forum/Forum-Regular.ttf`).then((r) => r.arrayBuffer())),
  new CustomFont("Marcellus SC", () => fetch(`${GF}/marcellussc/MarcellusSC-Regular.ttf`).then((r) => r.arrayBuffer())),
  new CustomFont("Barlow Condensed", () => fetch(`${GF}/barlowcondensed/BarlowCondensed-SemiBold.ttf`).then((r) => r.arrayBuffer()), { weight: 600 }),
];

// Minimal element factory (satori takes React-shaped objects; no JSX build needed).
const h = (type, style, ...children) => ({ type, key: null, props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c != null && c !== false) } });
const img = (src, style) => ({ type: "img", key: null, props: { src, style } });
const TIERS = ["#8b857b", "#d08e57", "#d08e57", "#cfd5db", "#cfd5db", "#e8c26a", "#e8c26a", "#62c9a1", "#62c9a1", "#b897ee", "#fff0bd"];
const GOLD = "#d9b56a", INK = "#0b0a09", PAPER = "#efe4cc", MUTED = "#9e9078";

const caps = (text, size = 20, color = GOLD) => h("div", { fontFamily: "Marcellus SC", fontSize: size, letterSpacing: size * 0.18, color }, text);
const stat = (label, value) => h("div", { flexDirection: "column", marginRight: 44 },
  caps(label, 16, MUTED), h("div", { fontFamily: "Barlow Condensed", fontSize: 44, color: PAPER, fontWeight: 600 }, String(value)));

function frame(rgb, at, ...children) {
  return h("div", {
    width: 1200, height: 630, position: "relative", backgroundColor: INK,
    backgroundImage: `radial-gradient(circle at ${at}, rgba(${rgb},0.55), rgba(11,10,9,0) 60%)`,
  },
  h("div", { position: "absolute", top: 18, left: 18, right: 18, bottom: 18, border: `2px solid rgba(217,181,106,0.55)` }),
  h("div", { position: "absolute", top: 26, left: 26, right: 26, bottom: 26, border: `1px solid rgba(217,181,106,0.22)` }),
  ...children);
}

const portrait = (url, rgb, color) => h("div", {
  position: "absolute", right: 70, bottom: 26, width: 400, height: 560, borderTopLeftRadius: 200, borderTopRightRadius: 200,
  overflow: "hidden", border: `3px solid ${color}`, borderBottom: "none", backgroundColor: `rgba(${rgb},0.35)`,
}, url ? img(url, { width: 400, height: 560, objectFit: "cover", objectPosition: "top" }) : null);

const crest = (level, size = 104) => h("div", {
  width: size, height: size, alignItems: "center", justifyContent: "center", transform: "rotate(45deg)",
  border: `4px solid ${TIERS[level]}`, backgroundColor: "#15120e", marginRight: 26,
}, h("div", { transform: "rotate(-45deg)", fontFamily: "Forum", fontSize: level > 8 ? 34 : 42, color: TIERS[level] }, ROMAN[level] || "0"));

export function dossierCard(s) {
  const top = s.heroes[0], th = top ? hero(top.id) : null, rgb = th ? th.rgb : "217,181,106";
  const r = rankFor(s.badge);
  return frame(rgb, "78% 40%",
    th ? portrait(th.gloat || th.card, rgb, TIERS[top.level]) : null,
    h("div", { flexDirection: "column", position: "absolute", left: 70, top: 52, width: 640 },
      caps("Deadlock Mastery · Dossier", 20),
      h("div", { alignItems: "center", marginTop: 18 },
        s.avatar ? img(s.avatar, { width: 92, height: 92, borderRadius: 6, border: `3px solid ${GOLD}`, marginRight: 22 }) : null,
        h("div", { flexDirection: "column" },
          h("div", { fontFamily: "Forum", fontSize: s.name.length > 16 ? 54 : 66, color: PAPER, lineHeight: 1 }, s.name),
          caps(`${r ? r.label : "Unranked"}${s.archetype ? " · The " + s.archetype : ""}`, 18, MUTED))),
      h("div", { alignItems: "flex-end", marginTop: 20 },
        h("div", { fontFamily: "Forum", fontSize: 150, color: GOLD, lineHeight: 0.9 }, String(s.level)),
        h("div", { flexDirection: "column", marginLeft: 18, marginBottom: 14 }, caps("Account", 22, MUTED), caps("Level", 22, MUTED))),
      h("div", { marginTop: 18 }, stat("Games", s.games), stat("Win rate", `${Math.round((s.wins / Math.max(1, s.games)) * 100)}%`),
        stat("KDA", s.kda.toFixed(2)), stat("Mastery", s.masterySum)),
      th ? h("div", { alignItems: "center", marginTop: 22, marginLeft: 6 }, crest(top.level, 76),
        h("div", { flexDirection: "column" }, caps("Signature hero", 16, MUTED),
          h("div", { fontFamily: "Forum", fontSize: 40, color: PAPER }, th.name),
          caps(`Mastery ${ROMAN[top.level]} · ${S.MASTERY_TITLES[top.level]}`, 16, TIERS[top.level]))) : null));
}

export function heroCard(s, heroId) {
  const th = hero(heroId), h0 = s.heroes.find((x) => x.id === Number(heroId));
  const lvl = h0 ? h0.level : 0;
  return frame(th.rgb, "78% 40%",
    portrait(th.gloat || th.card, th.rgb, TIERS[lvl]),
    h("div", { flexDirection: "column", position: "absolute", left: 70, top: 70, width: 640 },
      caps(`Hero file · ${s.name}`, 20),
      h("div", { fontFamily: "Forum", fontSize: 108, color: PAPER, lineHeight: 1, marginTop: 18 }, th.name),
      h("div", { alignItems: "center", marginTop: 34 }, crest(lvl),
        h("div", { flexDirection: "column" }, caps(`Mastery ${ROMAN[lvl]}`, 30, TIERS[lvl]),
          h("div", { fontFamily: "Forum", fontSize: 44, color: PAPER }, S.MASTERY_TITLES[lvl]))),
      h0 ? h("div", { marginTop: 44 }, stat("Games", h0.games), stat("Win rate", `${Math.round((h0.wins / h0.games) * 100)}%`),
        stat("Points", h0.points.toLocaleString("en-US"))) : caps("Uncharted", 24, MUTED)));
}

export function compareCard(a, b) {
  const side = (s, align, color) => {
    const top = s.heroes[0], th = top ? hero(top.id) : null;
    return h("div", { flexDirection: "column", alignItems: align, width: 440 },
      s.avatar ? img(s.avatar, { width: 120, height: 120, borderRadius: 8, border: `3px solid ${color}` }) : null,
      h("div", { fontFamily: "Forum", fontSize: s.name.length > 14 ? 42 : 52, color: PAPER, marginTop: 16 }, s.name),
      caps("Account level", 18, MUTED),
      h("div", { fontFamily: "Forum", fontSize: 120, color, lineHeight: 1 }, String(s.level)),
      th ? caps(`${th.name} · Mastery ${ROMAN[top.level]}`, 18, TIERS[top.level]) : null);
  };
  return frame("217,181,106", "50% 55%",
    h("div", { position: "absolute", top: 54, left: 0, right: 0, justifyContent: "center" }, caps("Deadlock Mastery · Head to Head", 22)),
    h("div", { position: "absolute", top: 120, left: 60, right: 60, justifyContent: "space-between", alignItems: "center" },
      side(a, "center", GOLD),
      h("div", { fontFamily: "Forum", fontSize: 64, color: MUTED }, "vs"),
      side(b, "center", "#7cc3f0")));
}

export async function png(element, ctx) {
  cache.setExecutionContext(ctx);
  return ImageResponse.async(element, { width: 1200, height: 630, fonts: fonts(),
    headers: { "Cache-Control": "public, max-age=3600" } });
}

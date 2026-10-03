// Discord bot over HTTP interactions (no always-on gateway process needed).
// Every command defers, does its work in the background, then edits the reply.
import { S, ROMAN, VOICE, HEROES, hero, heroByName, rankFor, resolvePlayer, summary } from "./core.js";
import { official, findOfficial, position } from "./ladder.js";
import { allow } from "./limits.js";

const GOLD = 0xd9b56a;
const API = "https://discord.com/api/v10";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const hex = (s) => new Uint8Array(s.match(/.{2}/g).map((b) => parseInt(b, 16)));
const rgbInt = (rgb) => rgb.split(",").reduce((n, c) => (n << 8) + Number(c), 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (n) => Math.round(n).toLocaleString("en-US");

async function verify(body, signature, timestamp, publicKey) {
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

export async function interactions(request, env, ctx, opts = {}) {
  if (!env.DISCORD_PUBLIC_KEY) return new Response("Discord bot not configured", { status: 503 });
  const body = await request.text();
  const ok = await verify(body, request.headers.get("X-Signature-Ed25519"), request.headers.get("X-Signature-Timestamp"), env.DISCORD_PUBLIC_KEY);
  if (!ok) return new Response("invalid request signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // PING
  if (opts.maintenance) {
    if (i.type === 4) return json({ type: 8, data: { choices: [] } });
    return json({ type: 4, data: { content: "🛠️ Dead Ledger is down for maintenance. Back shortly.", flags: 64 } });
  }

  if (i.type === 4) { // autocomplete: hero names
    const focused = (i.data.options || []).find((o) => o.focused);
    const q = String((focused && focused.value) || "").toLowerCase();
    const choices = [...HEROES.values()].filter((h) => h.name.toLowerCase().includes(q))
      .slice(0, 25).map((h) => ({ name: h.name, value: h.name }));
    return json({ type: 8, data: { choices } });
  }

  if (i.type === 2) {
    const name = i.data.name;
    const opts = Object.fromEntries((i.data.options || []).map((o) => [o.name, o.value]));
    const user = (i.member && i.member.user) || i.user;
    const base = env.SITE_URL || new URL(request.url).origin;
    const ephemeral = name === "link" || name === "unlink";
    if (!(await allow(env, "RL_BOT", user.id))) {
      return json({ type: 4, data: { content: "⏳ Easy there: that's a lot of commands in a minute. Try again shortly.", flags: 64 } });
    }
    ctx.waitUntil(run(name, opts, user, env, base)
      .catch((e) => ({ content: `⚠️ ${e.message || "Something went wrong."}` }))
      .then((msg) => fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_mentions: { parse: [] }, ...msg }),
      })));
    return json({ type: 5, data: ephemeral ? { flags: 64 } : {} });
  }
  return json({ error: "unsupported interaction" }, 400);
}

// ---------------------------------------------------------------- commands ----
async function playerFor(input, user, env) {
  if (input) return resolvePlayer(input);
  const linked = env.KV && await env.KV.get(`link:${user.id}`);
  if (linked) return { id: Number(linked) };
  throw new Error("Tell me who: pass a `player`, or run `/link` once with your Steam friend code.");
}

async function summaryOf(p, env) {
  const s = await summary(env, p.id);
  if (!s) throw new Error(`No Deadlock matches on record for ${p.name || p.id}.`);
  return s;
}

const button = (label, url) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });
const footer = { text: "Dead Ledger · match data from deadlock-api.com" };

export async function run(name, o, user, env, base) {
  if (name === "link") {
    const p = await resolvePlayer(o.player);
    const s = await summaryOf(p, env);
    if (env.KV) await env.KV.put(`link:${user.id}`, String(s.id));
    return { content: `Linked to **${s.name}** (${s.id}). Commands now default to you.` };
  }
  if (name === "unlink") {
    if (env.KV) await env.KV.delete(`link:${user.id}`);
    return { content: "Unlinked." };
  }
  if (name === "dossier") {
    const s = await summaryOf(await playerFor(o.player, user, env), env);
    const url = `${base}/p/${s.id}`;
    const top = s.heroes[0], th = top && hero(top.id), r = rankFor(s.badge);
    return { embeds: [{
      color: GOLD, url, title: `Account Level ${s.level}${s.archetype ? ` · The ${s.archetype}` : ""}`,
      author: { name: s.name, icon_url: s.avatar || undefined, url },
      description: `**${fmt(s.games)}** games · **${pct(s.wins / Math.max(1, s.games))}** win rate · **${s.kda.toFixed(2)}** KDA · ${s.hours}h played`,
      fields: [
        top ? { name: "Signature hero", value: `**${th.name}**: Mastery ${ROMAN[top.level]} · ${S.MASTERY_TITLES[top.level]}\n${fmt(top.points)} pts · ${top.games} games · ${pct(top.wins / top.games)} WR` } : null,
        { name: "Rank", value: r ? r.label : "Unranked", inline: true },
        { name: "Next level", value: `${fmt(s.span - s.into)} points`, inline: true },
        { name: "Mastery sum", value: `${s.masterySum} across ${s.heroes.length} heroes`, inline: true },
        s.heroes.length > 1 ? { name: "Also plays", value: s.heroes.slice(1, 4).map((h) => `◆ ${hero(h.id).name} ${ROMAN[h.level]} · ${h.games} games`).join("\n") } : null,
      ].filter(Boolean),
      thumbnail: th && th.smallPng ? { url: th.smallPng } : undefined,
      image: { url: `${base}/og/p/${s.id}.png?v=${s.level}-${s.games}` },
      footer,
    }], components: [button("Open dossier", url)] };
  }
  if (name === "mastery") {
    const h = heroByName(o.hero);
    if (!h) throw new Error(`I don't know a hero called "${o.hero}".`);
    const s = await summaryOf(await playerFor(o.player, user, env), env);
    const m = s.heroes.find((x) => x.id === h.id);
    const url = `${base}/p/${s.id}/hero/${h.id}`;
    const lvl = m ? m.level : 0;
    return { embeds: [{
      color: rgbInt(h.rgb), url, title: `${h.name}: Mastery ${ROMAN[lvl]} · ${S.MASTERY_TITLES[lvl]}`,
      author: { name: s.name, icon_url: s.avatar || undefined, url: `${base}/p/${s.id}` },
      description: VOICE[h.name] ? `*“${VOICE[h.name]}”*` : undefined,
      fields: m ? [
        { name: "Games", value: String(m.games), inline: true },
        { name: "Win rate", value: pct(m.wins / m.games), inline: true },
        { name: "Mastery points", value: fmt(m.points), inline: true },
        { name: m.maxed ? "Beyond Mastery X" : `To Mastery ${ROMAN[lvl + 1]}`, value: m.maxed ? "Max rank reached" : `${fmt(m.toNext)} points` },
      ] : [{ name: "Uncharted", value: `${s.name} hasn't played ${h.name} in a counted game yet.` }],
      thumbnail: h.smallPng ? { url: h.smallPng } : undefined,
      image: { url: `${base}/og/p/${s.id}/hero/${h.id}.png?v=${m ? m.points : 0}` },
      footer,
    }], components: [button("Open hero file", url)] };
  }
  if (name === "compare") {
    const pa = o.other ? await resolvePlayer(o.other) : await playerFor(null, user, env);
    const pb = await resolvePlayer(o.player);
    const [a, b] = await Promise.all([summaryOf(pa, env), summaryOf(pb, env)]);
    const rows = [
      ["Account level", a.level, b.level], ["Lifetime points", a.points, b.points], ["Games", a.games, b.games],
      ["Win rate", a.wins / Math.max(1, a.games), b.wins / Math.max(1, b.games), pct], ["KDA", a.kda, b.kda, (v) => v.toFixed(2)],
      ["Points / game", a.avgPts, b.avgPts, (v) => v.toFixed(1)], ["Mastery sum", a.masterySum, b.masterySum], ["Hours", a.hours, b.hours],
    ];
    let wa = 0, wb = 0;
    const lines = rows.map(([label, x, y, f = fmt]) => {
      if (x > y) wa++; else if (y > x) wb++;
      return `${x > y ? "**" + f(x) + "**" : f(x)}  ·  ${label}  ·  ${y > x ? "**" + f(y) + "**" : f(y)}`;
    });
    const url = `${base}/p/${a.id}/compare/${b.id}`;
    return { embeds: [{
      color: GOLD, url, title: `${a.name} vs ${b.name}: ${wa}–${wb}`,
      description: lines.join("\n"),
      image: { url: `${base}/og/p/${a.id}/compare/${b.id}.png?v=${a.points}-${b.points}` }, footer,
    }], components: [button("Open the comparison", url)] };
  }
  if (name === "ladder") {
    const h = o.hero ? heroByName(o.hero) : null;
    if (o.hero && !h) throw new Error(`I don't know a hero called "${o.hero}".`);
    const board = await official(env, "NAmerica", h ? h.id : null);
    const top = board.entries.slice(0, 10).map((e) => {
      const r = rankFor(e.badge);
      return `\`#${String(e.rank).padStart(2, " ")}\` ${e.name}${r ? ` · ${r.label}` : ""}`;
    });
    const fields = [];
    let who = null;
    try { who = await playerFor(o.player, user, env); } catch { /* standing is optional */ }
    if (who) {
      const s = await summary(env, who.id);
      const onBoard = findOfficial(board, who.id);
      let value = onBoard ? `**#${onBoard}** of ${board.total} on this NA ladder` : `Not in the NA top ${board.total}.`;
      if (h && s) {
        const [g, w] = await Promise.all([
          position(env, { accountId: who.id, heroId: h.id, metric: "matches" }),
          position(env, { accountId: who.id, heroId: h.id, metric: "winrate" }),
        ]);
        if (g.qualified) value += `\nAll ${h.name} players by games: **#${fmt(g.position)}** of ${fmt(g.total)} (top ${pct(g.top)})`;
        if (w.qualified) value += `\nBy win rate (players with ${w.min}+ games): **#${fmt(w.position)}** of ${fmt(w.total)}`;
        else value += `\nWin-rate ladder needs ${w.min}+ games on ${h.name}.`;
      }
      fields.push({ name: `Where ${s ? s.name : "you"} stand${s ? "s" : ""}`, value });
    }
    return { embeds: [{
      color: h ? rgbInt(h.rgb) : GOLD, title: h ? `${h.name} ladder · North America` : "Ranked ladder · North America",
      url: `${base}/`, description: top.join("\n") || "The ladder is empty right now.",
      fields, thumbnail: h && h.smallPng ? { url: h.smallPng } : undefined,
      footer: { text: "Official NA leaderboard (Valve, hourly). Player-wide positions cover all regions." },
    }] };
  }
  throw new Error("Unknown command.");
}

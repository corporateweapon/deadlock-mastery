// Dead Ledger - Cloudflare Worker. Serves the static site (via the ASSETS binding) and adds:
//   /p/...           share links with rich previews (Discord, socials) that open the app
//   /og/...png       generated share-card images
//   /api/...         summary, ladder positions, official ladders, signed-in user, vanity lookup
//   /auth/steam...   Sign in through Steam
//   /discord/...     Discord bot interactions endpoint
import { summary, resolvePlayer, hero, ROMAN, S, D, rankFor, useApiKey } from "./core.js";
import { official, position, REGIONS } from "./ladder.js";
import { dossierCard, heroCard, compareCard, png } from "./og.js";
import { login, callback, logout, readSession } from "./auth.js";
import { interactions } from "./discord.js";
import { allow, bucketFor, clientKey, tooMany } from "./limits.js";

const CORS = { "Access-Control-Allow-Origin": "*" };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    // www.deadledger.net -> deadledger.net (keeps path, query and hash).
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    useApiKey(env);
    const bucket = bucketFor(path);
    if (bucket && !(await allow(env, bucket, clientKey(request)))) return tooMany(path);
    try {
      if (path === "/" || path === "/index.html") return withAnalytics(request, env);
      let m;
      if ((m = path.match(/^\/p\/(\d+)(?:\/(hero|compare|match)\/(\d+))?\/?$/))) {
        const [, id, kind, arg] = m;
        return edgeCached(request, ctx, () => share(url, env, Number(id), kind, arg && Number(arg)));
      }
      if ((m = path.match(/^\/og\/p\/(\d+)(?:\/(hero|compare)\/(\d+))?\.png$/))) {
        const [, id, kind, arg] = m;
        return edgeCached(request, ctx, () => card(env, ctx, Number(id), kind, arg && Number(arg)));
      }
      if (path === "/api/health") return json({ ok: true, auth: !!env.SESSION_SECRET, steamKey: !!env.STEAM_API_KEY, site: env.SITE_URL || null,
        discord: env.DISCORD_APP_ID ? `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_APP_ID}` : null }, 200, CORS);
      if (path === "/api/me") {
        const s = await readSession(request, env);
        return json(s ? { accountId: s.a, steamId: s.s } : { accountId: null }, 200, { "Cache-Control": "no-store" });
      }
      if ((m = path.match(/^\/api\/summary\/(\d+)$/))) {
        const s = await summary(env, Number(m[1]));
        return s ? json(s, 200, { ...CORS, "Cache-Control": "public, max-age=600" }) : json({ error: "No matches on record." }, 404, CORS);
      }
      if (path === "/api/ladder/official") {
        const region = REGIONS.includes(url.searchParams.get("region")) ? url.searchParams.get("region") : "NAmerica";
        const heroId = Number(url.searchParams.get("hero")) || null;
        return json(await official(env, region, heroId), 200, { ...CORS, "Cache-Control": "public, max-age=900" });
      }
      if (path === "/api/ladder/position") {
        const q = url.searchParams;
        const accountId = Number(q.get("account"));
        if (!accountId) return json({ error: "account required" }, 400, CORS);
        const res = await position(env, { accountId, heroId: Number(q.get("hero")) || null,
          metric: q.get("metric") || "matches", badge: Number(q.get("badge")) || null });
        return json(res, 200, { ...CORS, "Cache-Control": "public, max-age=1800" });
      }
      if (path === "/api/resolve") return resolve(url, env);
      if (path === "/auth/steam") return login(request, env);
      if (path === "/auth/steam/callback") return callback(request, env);
      if (path === "/auth/logout") return logout(request);
      if (path === "/discord/interactions" && request.method === "POST") return interactions(request, env, ctx);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: e.message || "Server error" }, 500, CORS);
    }
  },
};

// Serve repeat requests for share pages / card images from Cloudflare's edge cache, so a card is
// rendered once per hour per URL instead of on every unfurl. (No-op where the Cache API isn't available.)
async function edgeCached(request, ctx, make) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(request.url, { method: "GET" });
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return hit;
  }
  const res = await make();
  if (cache && res.ok) ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

// Inject Cloudflare Web Analytics (cookie-free) when a beacon token is configured.
async function withAnalytics(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!env.CF_BEACON_TOKEN || !(res.headers.get("Content-Type") || "").includes("text/html")) return res;
  return new HTMLRewriter().on("body", { element(el) {
    el.append(`<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(env.CF_BEACON_TOKEN)}"}'></script>`, { html: true });
  } }).transform(res);
}

// ---------------------------------------------------------------- sharing ----
async function share(url, env, id, kind, arg) {
  const base = env.SITE_URL || url.origin;
  const hashPath = `#${id}${kind ? `/${kind}/${arg}` : ""}`;
  let title = "Dead Ledger", description = "Account levels, hero mastery and full match stats for Deadlock.";
  let image = `${base}/og/p/${id}.png`, color = "#d9b56a";
  try {
    const s = await summary(env, id);
    if (s) {
      const top = s.heroes[0], th = top && hero(top.id);
      const wr = `${Math.round((s.wins / Math.max(1, s.games)) * 100)}%`;
      title = `${s.name} · Account Level ${s.level}`;
      description = `${s.games} games · ${wr} win rate · ${s.kda.toFixed(2)} KDA${th ? ` · Signature: ${th.name}, Mastery ${ROMAN[top.level]} (${S.MASTERY_TITLES[top.level]})` : ""}`;
      image += `?v=${s.level}-${s.games}`;
      if (kind === "hero") {
        const h = hero(arg), m = s.heroes.find((x) => x.id === arg);
        title = `${s.name} · ${h.name}, Mastery ${ROMAN[m ? m.level : 0]}`;
        description = m ? `${m.games} games · ${Math.round((m.wins / m.games) * 100)}% win rate · ${m.points.toLocaleString("en-US")} mastery points` : `${h.name} is uncharted for ${s.name}.`;
        image = `${base}/og/p/${id}/hero/${arg}.png?v=${m ? m.points : 0}`;
        color = `rgb(${h.rgb})`;
      } else if (kind === "compare") {
        const o = await summary(env, arg);
        if (o) {
          title = `${s.name} vs ${o.name}`;
          description = `Account level ${s.level} vs ${o.level} · ${s.games} vs ${o.games} games · head to head on Dead Ledger`;
          image = `${base}/og/p/${id}/compare/${arg}.png?v=${s.points}-${o.points}`;
        }
      } else if (kind === "match") {
        title = `${s.name} · Match ${arg}`;
      }
    }
  } catch { /* fall back to generic tags */ }
  const target = `${base}/${hashPath}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dead Ledger">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url.href)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="${esc(color)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="background:#0a0908;color:#efe4cc;font-family:serif"><a href="${esc(target)}">Open the dossier</a></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

async function card(env, ctx, id, kind, arg) {
  const s = await summary(env, id);
  if (!s) return new Response("Not found", { status: 404 });
  if (kind === "hero") return png(heroCard(s, arg), ctx);
  if (kind === "compare") {
    const o = await summary(env, arg);
    if (o) return png(compareCard(s, o), ctx);
  }
  return png(dossierCard(s), ctx);
}

// Turn anything a person types (including /id/vanity links, with a Steam key) into an account id.
async function resolve(url, env) {
  const q = url.searchParams.get("q") || "";
  const vanity = q.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (vanity && env.STEAM_API_KEY) {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity[1])}`).then((x) => x.json());
    if (r.response && r.response.success === 1) return json({ accountId: D.from64(r.response.steamid) }, 200, CORS);
    return json({ error: "That custom URL doesn't exist." }, 404, CORS);
  }
  try { return json({ accountId: (await resolvePlayer(q)).id }, 200, CORS); }
  catch (e) { return json({ error: e.message }, 404, CORS); }
}

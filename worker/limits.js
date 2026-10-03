// Per-visitor request limits. Uses Cloudflare's rate-limit bindings (wrangler.toml [[ratelimits]]);
// falls back to a simple in-memory window if a binding is missing (e.g. an old config).
const fallback = new Map(); // key -> { count, resetAt }
const FALLBACK_LIMITS = { RL_CARDS: 20, RL_LADDER: 30, RL_LOOKUP: 40, RL_API: 120, RL_BOT: 10 };

export const clientKey = (request) => request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";

// Which budget a path draws from.
export function bucketFor(path) {
  if (path.startsWith("/og/")) return "RL_CARDS";
  if (path === "/api/ladder/position") return "RL_LADDER";
  if (path.startsWith("/p/") || path.startsWith("/api/summary/") || path === "/api/resolve") return "RL_LOOKUP";
  if (path === "/" || path === "/index.html" || path === "/discord/interactions") return null; // page loads + Discord (limited per user)
  return "RL_API";
}

export async function allow(env, bucket, key) {
  if (!bucket) return true;
  const limiter = env[bucket];
  if (limiter && typeof limiter.limit === "function") {
    try { return (await limiter.limit({ key: `${bucket}:${key}` })).success; }
    catch { return true; } // never take the site down because the limiter hiccuped
  }
  const now = Date.now(), k = `${bucket}:${key}`;
  const w = fallback.get(k);
  if (!w || w.resetAt < now) { fallback.set(k, { count: 1, resetAt: now + 60e3 }); return true; }
  w.count++;
  if (fallback.size > 5000) fallback.clear(); // keep memory bounded
  return w.count <= (FALLBACK_LIMITS[bucket] || 60);
}

export function tooMany(path) {
  const body = path.startsWith("/og/") ? "Too many requests" : JSON.stringify({ error: "Slow down a little: too many requests from you in the last minute. Try again shortly." });
  return new Response(body, { status: 429, headers: {
    "Content-Type": path.startsWith("/og/") ? "text/plain" : "application/json",
    "Retry-After": "60", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store",
  } });
}

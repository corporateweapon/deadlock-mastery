// "Sign in through Steam" (OpenID 2.0). Steam proves the SteamID; we keep it in a signed,
// HttpOnly cookie. No passwords or Steam credentials ever touch this site.
const OPENID = "https://steamcommunity.com/openid/login";
const COOKIE = "dm_session";
const MAX_AGE = 30 * 86400;
const STEAM64_BASE = 76561197960265728n;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function makeToken(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || (await hmac(env.SESSION_SECRET, body)) !== sig) return null;
  try {
    const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return Date.now() / 1000 - p.iat < MAX_AGE ? p : null;
  } catch { return null; }
}

// Only same-site hash routes may be returned to.
const safeReturn = (r) => (typeof r === "string" && /^#[0-9a-z/]*$/i.test(r) ? r : "");

export function login(request, env) {
  if (!env.SESSION_SECRET) return new Response("Sign-in is not configured on this server.", { status: 503 });
  const url = new URL(request.url);
  const back = safeReturn(url.searchParams.get("r") || "");
  const returnTo = `${url.origin}/auth/steam/callback${back ? "?r=" + encodeURIComponent(back) : ""}`;
  const q = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": url.origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return Response.redirect(`${OPENID}?${q}`, 302);
}

export async function callback(request, env) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const back = safeReturn(params.get("r") || "");
  params.delete("r");
  const fail = (why) => Response.redirect(`${url.origin}/?signin=${encodeURIComponent(why)}#start`, 302);
  if (params.get("openid.mode") !== "id_res") return fail("cancelled");
  // The response must be addressed to us...
  const returnTo = params.get("openid.return_to") || "";
  if (!returnTo.startsWith(`${url.origin}/auth/steam/callback`)) return fail("bad-return");
  // ...and Steam itself must confirm the signature.
  params.set("openid.mode", "check_authentication");
  const verify = await fetch(OPENID, { method: "POST", body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!/is_valid\s*:\s*true/.test(await verify.text())) return fail("not-verified");
  const m = (params.get("openid.claimed_id") || "").match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m) return fail("no-id");
  const steam64 = m[1];
  const accountId = Number(BigInt(steam64) - STEAM64_BASE);
  const token = await makeToken(env.SESSION_SECRET, { a: accountId, s: steam64, iat: Math.floor(Date.now() / 1000) });
  return new Response(null, { status: 302, headers: {
    Location: `${url.origin}/${back || "#" + accountId}`,
    "Set-Cookie": `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  } });
}

export function logout(request) {
  const url = new URL(request.url);
  return new Response(null, { status: 302, headers: {
    Location: `${url.origin}/#start`,
    "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  } });
}

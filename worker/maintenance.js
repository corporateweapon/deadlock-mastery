// Maintenance switch. Set MAINTENANCE = "on" in the Cloudflare dashboard
// (Workers & Pages -> dead-ledger -> Settings -> Variables and Secrets) to close the site;
// delete it or set "off" to reopen. Optional MAINTENANCE_MESSAGE replaces the default line.
// wrangler.toml has keep_vars = true, so a deploy never flips the switch back by accident.
export const isMaintenance = (env) => /^(on|true|1|yes)$/i.test(String(env.MAINTENANCE || "").trim());

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function maintenanceResponse(path, env) {
  const headers = { "Retry-After": "3600", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    return new Response(JSON.stringify({ ok: false, maintenance: true, error: "Dead Ledger is down for maintenance." }),
      { status: 503, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (path.startsWith("/og/")) return new Response("Down for maintenance", { status: 503, headers: { ...headers, "Content-Type": "text/plain" } });
  const msg = escHtml(env.MAINTENANCE_MESSAGE || "We're tightening a few bolts in the back room. The ledger reopens shortly.");
  return new Response(page(msg), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

const page = (msg) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dead Ledger · Closed for repairs</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Forum&family=Marcellus+SC&family=Cormorant+Garamond:ital,wght@1,500&display=swap" rel="stylesheet">
<style>
  :root { --ink: #0a0908; --paper: #efe4cc; --muted: #9e9078; --gold: #d9b56a; --gold-hi: #f6dd9a; --gold-lo: #8a6a2c; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { min-height: 100vh; display: grid; place-items: center; padding: 24px; color: var(--paper); text-align: center;
    background: radial-gradient(ellipse at 50% 35%, rgba(217,181,106,.12), transparent 60%), radial-gradient(circle at 20% 80%, rgba(124,36,36,.25), transparent 50%), var(--ink);
    font-family: "Cormorant Garamond", Georgia, serif; }
  .frame { position: relative; max-width: 560px; padding: 46px 36px 40px; border: 1px solid rgba(217,181,106,.45); background: rgba(17,15,13,.7); }
  .frame::before { content: ""; position: absolute; inset: 7px; border: 1px solid rgba(217,181,106,.18); pointer-events: none; }
  svg { width: 120px; height: 120px; margin-bottom: 10px; }
  .eyebrow { font-family: "Marcellus SC", serif; letter-spacing: .3em; font-size: 12px; color: var(--gold); text-transform: uppercase; }
  h1 { font-family: "Forum", serif; font-weight: 400; font-size: clamp(40px, 9vw, 64px); line-height: 1; margin: 10px 0 14px; letter-spacing: .06em; text-transform: uppercase;
    background: linear-gradient(180deg, var(--gold-hi), var(--gold) 55%, var(--gold-lo)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p { font-style: italic; font-size: 21px; line-height: 1.45; color: var(--paper); margin: 0 0 18px; }
  small { display: block; font-family: "Marcellus SC", serif; letter-spacing: .14em; font-size: 11px; color: var(--muted); }
  .rays line { stroke: var(--gold-lo); stroke-width: 1.4; }
  @media (prefers-reduced-motion: no-preference) { .rays { transform-origin: 100px 100px; animation: spin 120s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } } }
</style></head>
<body><main class="frame">
  <svg viewBox="0 0 200 200" aria-hidden="true">
    <g class="rays">${Array.from({ length: 48 }, (_, i) => { const a = i * 7.5 * Math.PI / 180, r2 = i % 2 ? 88 : 98; return `<line x1="${(100 + 78 * Math.cos(a)).toFixed(1)}" y1="${(100 + 78 * Math.sin(a)).toFixed(1)}" x2="${(100 + r2 * Math.cos(a)).toFixed(1)}" y2="${(100 + r2 * Math.sin(a)).toFixed(1)}"/>`; }).join("")}</g>
    <path d="M100 26 174 100 100 174 26 100Z" fill="#0a0908" stroke="#d9b56a" stroke-width="3"/>
    <path d="M100 42 158 100 100 158 42 100Z" fill="none" stroke="#8a6a2c"/>
    <path d="M62 100q38-34 76 0" fill="none" stroke="#d9b56a" stroke-width="2.5"/>
    <path d="M62 100q38 14 76 0" fill="none" stroke="#d9b56a" stroke-width="2.5"/>
  </svg>
  <div class="eyebrow">Dead Ledger</div>
  <h1>Closed for repairs</h1>
  <p>${msg}</p>
  <small>Check back soon</small>
</main></body></html>`;

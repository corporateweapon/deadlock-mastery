# Deploying Dead Ledger to Cloudflare

The site runs as one Cloudflare Worker: it serves `public/` and adds share cards, Steam sign-in,
the Discord bot and ladder lookups. GitHub Pages keeps serving the plain static site as a
fallback (the extras quietly switch off there).

You do the account steps (they need your logins); everything else is one command each.
Run commands from the project folder.

## 1. Cloudflare (once)

1. Create a free Cloudflare account, then upgrade **Workers** to the **Paid plan ($5/month)**.
   Share-card images need more CPU time than the free plan allows per request.
2. Log the CLI in (opens your browser):
   ```
   npx wrangler login
   ```
3. Create the storage the Worker uses for caching and Discord account links:
   ```
   npx wrangler kv namespace create KV
   ```
   Paste the printed `id` into `wrangler.toml` (replace `replace-with-your-kv-namespace-id`).
4. Session secret for Steam sign-in (random, never shared):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET
   ```
5. Deploy:
   ```
   npm run deploy
   ```
   You get a `https://dead-ledger.<you>.workers.dev` address immediately.

## 2. Your domain

In the Cloudflare dashboard: **Workers & Pages → dead-ledger → Settings → Domains & Routes
→ Add → Custom domain**. Then set `SITE_URL` in `wrangler.toml` to `https://yourdomain.com` and
`npm run deploy` again (share links and the bot use it).

## 3. Analytics (cookie-free, no consent banner needed)

Dashboard → **Analytics & Logs → Web Analytics → Add a site** → your domain. Copy the token from
the snippet it shows into `CF_BEACON_TOKEN` in `wrangler.toml`, then `npm run deploy`.

## 4. Discord bot

1. https://discord.com/developers/applications → **New Application** (name it, add the crest as its icon).
2. **General Information**: copy the **Application ID** into `DISCORD_APP_ID` in `wrangler.toml`.
   Copy the **Public Key**, then:
   ```
   npx wrangler secret put DISCORD_PUBLIC_KEY
   ```
3. Set **Interactions Endpoint URL** to `https://yourdomain.com/discord/interactions` and save
   (Discord pings it; the Worker answers, so deploy first).
4. **Installation**: tick both *Guild Install* and *User Install*, scope `applications.commands`.
5. **Bot → Reset Token**, copy it, and register the slash commands from your own terminal:
   ```
   $env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."; npm run discord:register
   ```
   The token is only needed for this step; don't store it in the project.
6. Invite it with the link the script prints (also shown in the site footer once `DISCORD_APP_ID` is set).

Commands: `/dossier`, `/mastery hero:`, `/compare player:`, `/ladder hero:`, `/link player:`, `/unlink`.

## 5. Optional

- **Steam Web API key** (lets people paste `steamcommunity.com/id/name` links):
  https://steamcommunity.com/dev/apikey, then `npx wrangler secret put STEAM_API_KEY`.
- **deadlock-api key** (higher rate limits for ladders as traffic grows): from deadlock-api's
  Patreon, then `npx wrangler secret put DEADLOCK_API_KEY`.

## Updating

Push to GitHub as usual (updates the fallback), and `npm run deploy` for the live site.
Local preview with all server features: `npm run dev` → http://127.0.0.1:8787
(uses `.dev.vars` for secrets; create it with `SESSION_SECRET=<anything>`).

// Registers (or updates) the bot's slash commands with Discord. Run once after creating the app,
// and again whenever worker/commands.json changes. Your token stays in your shell, not in files.
//
//   PowerShell:  $env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."; npm run discord:register
//   bash:        DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... npm run discord:register
const fs = require("fs");
const path = require("path");

const appId = process.env.DISCORD_APP_ID, token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first (Discord Developer Portal → your app).");
  process.exit(1);
}
const commands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "worker", "commands.json"), "utf8"));

(async () => {
  const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  const body = await res.json();
  if (!res.ok) { console.error("Discord said no:", res.status, JSON.stringify(body, null, 2)); process.exit(1); }
  console.log(`Registered ${body.length} commands: ${body.map((c) => "/" + c.name).join(" ")}`);
  console.log(`Invite: https://discord.com/oauth2/authorize?client_id=${appId}`);
})();

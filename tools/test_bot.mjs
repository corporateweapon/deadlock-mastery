// Offline check of the Discord command handlers against live data (no Discord needed).
//   node tools/test_bot.mjs <SteamID3> [otherSteamID3]
import { run } from "../worker/discord.js";
const kvStore = new Map();
const env = { KV: { get: async (k) => kvStore.get(k) ?? null, put: async (k, v) => kvStore.set(k, v), delete: async (k) => kvStore.delete(k) } };
const me = process.argv[2], other = process.argv[3];
if (!me) { console.error("usage: node tools/test_bot.mjs <SteamID3> [other]"); process.exit(1); }
const user = { id: "test-user" };
const base = "https://example.com";
const show = (label, msg) => console.log(`\n=== ${label}\n` + JSON.stringify(msg, null, 1).slice(0, 1600));
show("/link", await run("link", { player: me }, user, env, base));
show("/dossier", await run("dossier", {}, user, env, base));
show("/mastery shiv", await run("mastery", { hero: "shiv" }, user, env, base));
if (other) show("/compare", await run("compare", { player: other }, user, env, base));
show("/ladder shiv", await run("ladder", { hero: "Shiv" }, user, env, base));

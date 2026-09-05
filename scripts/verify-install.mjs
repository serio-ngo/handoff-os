#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude");
const BLOCKED = 2;
const ALLOWED = 0;

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const marketplace = readJson(path.join(REPO, ".claude-plugin", "marketplace.json"));
const MARKETPLACE = marketplace.name;
const PLUGIN = marketplace.plugins[0].name;

const results = [];
const check = (question, ok, detail = "") => {
  results.push({ question, ok, detail });
  console.log(`${ok ? "yes" : "NO "}  ${question}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const heading = (title) => console.log(`\n${title}\n${"-".repeat(title.length)}`);

heading("Does this account load the plugin?");
const settings = readJson(path.join(CONFIG_DIR, "settings.json")) || {};
const deny = settings.permissions?.deny || [];
check("settings.json is readable", Object.keys(settings).length > 0, path.join(CONFIG_DIR, "settings.json"));
check("the marketplace is registered", Boolean(settings.extraKnownMarketplaces?.[MARKETPLACE]));
check("the plugin is enabled", settings.enabledPlugins?.[`${PLUGIN}@${MARKETPLACE}`] === true);
check("login is restricted to the subscription", settings.forceLoginMethod === "claudeai");
check("outward git is denied", deny.some((rule) => /git push/i.test(rule)), `${deny.length} deny rules`);
check("no API credential is configured", !/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper/.test(JSON.stringify(settings)));
check("no API credential is in the environment", !["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"].some((key) => process.env[key]));

heading("Is the installed copy the copy in this checkout?");
const known = readJson(path.join(CONFIG_DIR, "plugins", "known_marketplaces.json")) || {};
const clone = known[MARKETPLACE]?.installLocation || path.join(CONFIG_DIR, "plugins", "marketplaces", MARKETPLACE);
const source = path.join(clone, "plugins", PLUGIN);
const version = readJson(path.join(source, ".claude-plugin", "plugin.json"))?.version;
const cache = path.join(CONFIG_DIR, "plugins", "cache", MARKETPLACE, PLUGIN, String(version));

const walk = (dir, base = "") => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []).flatMap((entry) => {
  const rel = base ? `${base}/${entry.name}` : entry.name;
  if (rel.startsWith(".in_use")) return [];
  return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
});

check("the marketplace clone exists", existsSync(path.join(clone, ".git")), clone);
check("the clone carries a version", Boolean(version), String(version));
if (check("the cache holds that version", existsSync(cache), cache)) {
  const files = walk(source).sort();
  const identical = JSON.stringify(walk(cache).sort()) === JSON.stringify(files)
    && files.every((file) => readFileSync(path.join(cache, file), "utf8") === readFileSync(path.join(source, file), "utf8"));
  check("the cache is byte-identical to the clone", identical, `${files.length} files`);
  check("the source skills are all installed", readdirSync(path.join(REPO, "plugins", PLUGIN, "skills"))
    .every((skill) => existsSync(path.join(cache, "skills", skill, "SKILL.md"))));
}

heading("Do the installed hooks actually fire?");
const fire = (script, payload) => spawnSync(process.execPath, [path.join(cache, "scripts", script)], {
  input: JSON.stringify(payload), encoding: "utf8",
}).status;
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

if (existsSync(cache)) {
  check("a push is blocked", fire("egress-guard.mjs", bash("git push origin main")) === BLOCKED);
  check("a bodied POST is blocked", fire("egress-guard.mjs", bash("curl -X POST https://example.com -d x=1")) === BLOCKED);
  check("an API key assignment is blocked", fire("egress-guard.mjs", bash("export ANTHROPIC_API_KEY=sk-test")) === BLOCKED);
  check("a connector send is blocked", fire("egress-guard.mjs", { tool_name: "mcp__server__send_message", tool_input: {} }) === BLOCKED);
  check("a connector read is allowed", fire("egress-guard.mjs", { tool_name: "mcp__server__list_items", tool_input: {} }) === ALLOWED);
  check("an ordinary command is allowed", fire("egress-guard.mjs", bash("git status")) === ALLOWED);
  check("the session card prints", spawnSync(process.execPath, [path.join(cache, "scripts", "session-card.mjs")], { encoding: "utf8" }).stdout.trim().length > 0);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} yes`);
if (failed.length) {
  console.log(`unanswered: ${failed.map((r) => r.question).join(" | ")}`);
  console.log("fix: docs/INSTALL.md, then run this again");
}
process.exit(failed.length ? 1 : 0);

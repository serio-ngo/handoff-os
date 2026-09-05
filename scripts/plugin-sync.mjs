#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_OWNED = [/^\.in_use[/\\]/, /^\.DS_Store$/, /^\.installed$/];

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const flag = (name, fallback) => {
  const value = argv[argv.indexOf(`--${name}`) + 1];
  return argv.includes(`--${name}`) && value && !value.startsWith("--") ? value : fallback;
};

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const marketplaceFile = readJson(path.join(REPO, ".claude-plugin", "marketplace.json"));

const MARKETPLACE = flag("marketplace", marketplaceFile.name);
const PLUGIN = flag("plugin", marketplaceFile.plugins[0].name);
const CONFIG_DIR = flag("config-dir", process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude"));

const rows = [];
const row = (label, value) => rows.push([label, String(value)]);
function report(code) {
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log(`\n${rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join("\n")}\n`);
  console.log(DRY_RUN ? "plugin-sync: DRY RUN — nothing written." : `plugin-sync: ${code === 0 ? "OK" : "FAILED"}`);
  process.exit(code);
}
const fail = (message) => {
  row("ERROR", message);
  report(1);
};

const git = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const head = (dir) => (git(dir, "rev-parse", "--short", "HEAD").stdout || "").trim();
const walk = (dir, base = "") => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const rel = base ? `${base}/${entry.name}` : entry.name;
  return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
});

const known = existsSync(path.join(CONFIG_DIR, "plugins", "known_marketplaces.json"))
  ? readJson(path.join(CONFIG_DIR, "plugins", "known_marketplaces.json"))
  : fail(`no known_marketplaces.json under ${CONFIG_DIR}/plugins — add the marketplace in Claude first`);
const clone = known[MARKETPLACE]?.installLocation || fail(`marketplace "${MARKETPLACE}" is not registered — run sync:settings, then add it in Claude`);
if (!existsSync(path.join(clone, ".git"))) fail(`${clone} is not a git clone — let Claude create it first`);

row("config dir", CONFIG_DIR);
row("marketplace", `${MARKETPLACE} -> ${clone}`);

const before = head(clone);
if (git(clone, "status", "--porcelain").stdout.trim()) fail("the clone has local modifications — inspect it by hand, refusing to touch it");
if (!DRY_RUN) {
  if (git(clone, "fetch", "origin").status !== 0) fail("git fetch failed");
  const branch = (git(clone, "rev-parse", "--abbrev-ref", "HEAD").stdout || "main").trim();
  if (git(clone, "merge", "--ff-only", `origin/${branch}`).status !== 0) fail("the clone diverged from origin — fast-forward failed");
}
row("clone", head(clone) === before ? `${before} (already current)` : `${head(clone)} (was ${before})`);

const entry = marketplaceFile.plugins.find((p) => p.name === PLUGIN) || fail(`plugin "${PLUGIN}" is not listed in marketplace.json`);
const source = path.resolve(clone, entry.source);
if (!existsSync(source)) fail(`plugin source missing: ${source}`);
const version = readJson(path.join(source, ".claude-plugin", "plugin.json")).version || fail("plugin.json carries no version — the cache is keyed by it");
row("plugin", `${PLUGIN} @ ${version}`);

const cacheRoot = path.join(CONFIG_DIR, "plugins", "cache", MARKETPLACE, PLUGIN);
const stale = existsSync(cacheRoot) ? readdirSync(cacheRoot).filter((dir) => statSync(path.join(cacheRoot, dir)).isDirectory()) : [];
const targets = [...new Set([version, ...stale])];
row("cache", `${cacheRoot} -> ${targets.join(", ")}`);

const identity = ["org.json", "org.example.json"].map((f) => path.join(clone, "config", f)).find(existsSync);
const wanted = walk(source);
let copied = 0;
let pruned = 0;

for (const target of targets) {
  const dest = path.join(cacheRoot, target);
  for (const rel of wanted) {
    if (!DRY_RUN) {
      mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
      copyFileSync(path.join(source, rel), path.join(dest, rel));
    }
    copied += 1;
  }
  for (const rel of existsSync(dest) ? walk(dest) : []) {
    if (wanted.includes(rel) || rel === "org.json" || RUNTIME_OWNED.some((rx) => rx.test(rel))) continue;
    if (!DRY_RUN) rmSync(path.join(dest, rel), { force: true });
    pruned += 1;
  }
  if (identity && !DRY_RUN) copyFileSync(identity, path.join(dest, "org.json"));
}

row("files", `${copied} copied (${wanted.length} per version), ${pruned} pruned`);
row("identity", identity ? path.relative(clone, identity) : "none — the session card falls back to generic wording");
row("next", "hook scripts reload per call; skill bodies need /reload-plugins or a new session");
report(0);

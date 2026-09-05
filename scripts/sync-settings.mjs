#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TEMPLATE = path.join(REPO, "settings", "user-settings.template.json");
const FORBIDDEN_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];
const FORBIDDEN_KEYS = ["apiKeyHelper"];
const RULE_LISTS = ["deny", "ask", "allow"];
const OBJECT_KEYS = ["env", "extraKnownMarketplaces", "enabledPlugins"];

const fail = (message) => {
  console.error(`sync-settings: ${message}`);
  process.exit(1);
};

function parseArgs(argv) {
  const args = { target: null, template: DEFAULT_TEMPLATE, dryRun: false, without: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--target") args.target = argv[++i];
    else if (argv[i] === "--template") args.template = argv[++i];
    else if (argv[i] === "--without") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) fail("--without needs a comma-separated list, e.g. --without canva,gmail");
      args.without = value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
    else fail(`unknown argument: ${argv[i]}`);
  }
  if (!args.target) fail("--target <path-to-settings.json> is required");
  return args;
}

function readJson(file, fallback) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    return fail(`cannot read ${file}: ${error.message}`);
  }
  try {
    return text.trim() === "" ? fallback ?? {} : JSON.parse(text);
  } catch (error) {
    return fail(`${file} is not valid JSON: ${error.message}`);
  }
}

function originRepo() {
  const url = spawnSync("git", ["-C", REPO, "remote", "get-url", "origin"], { encoding: "utf8" }).stdout || "";
  return (/[:/]([^/:]+\/[^/]+?)(?:\.git)?\s*$/.exec(url) || [])[1];
}

function installation() {
  const marketplace = readJson(path.join(REPO, ".claude-plugin", "marketplace.json"));
  const repo = originRepo();
  if (!repo) fail("no origin remote — the marketplace entry names the repo Claude clones from");
  return {
    env: { HANDOFF_OS_DIR: REPO },
    extraKnownMarketplaces: { [marketplace.name]: { source: { source: "github", repo } } },
    enabledPlugins: Object.fromEntries(marketplace.plugins.map((p) => [`${p.name}@${marketplace.name}`, true])),
  };
}

function mergeRules(target = {}, template = {}) {
  const merged = { ...target };
  for (const [key, value] of Object.entries(template)) {
    merged[key] = RULE_LISTS.includes(key) ? [...new Set([...(target[key] ?? []), ...value])] : value;
  }
  return merged;
}

function merge(target, template) {
  const merged = { ...target, ...template };
  if (template.permissions) merged.permissions = mergeRules(target.permissions, template.permissions);
  for (const key of OBJECT_KEYS) {
    if (template[key]) merged[key] = { ...target[key], ...template[key] };
  }
  return merged;
}

function refuseApiAuth(settings) {
  const offenders = [
    ...FORBIDDEN_ENV.filter((key) => key in (settings.env ?? {})).map((key) => `env.${key}`),
    ...FORBIDDEN_KEYS.filter((key) => key in settings),
  ];
  if (offenders.length) {
    fail(`refusing to write — ${offenders.join(", ")} outranks subscription login. Fix the template; nothing was written.`);
  }
}

const added = (before = [], after = []) => after.filter((rule) => !(before || []).includes(rule)).length;

const args = parseArgs(process.argv.slice(2));
const target = path.resolve(args.target);
const before = readJson(target, {});
const template = readJson(path.resolve(args.template));
const dropped = [];
if (args.without.length && template.permissions?.ask) {
  template.permissions.ask = template.permissions.ask.filter((rule) => {
    const skip = args.without.some((token) => String(rule).toLowerCase().includes(token));
    if (skip) dropped.push(rule);
    return !skip;
  });
}
const after = merge(merge(before, template), installation());
refuseApiAuth(after);

if (args.dryRun) {
  console.log(`--- before ---\n${JSON.stringify(before, null, 2)}`);
  console.log(`--- after ---\n${JSON.stringify(after, null, 2)}`);
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(after, null, 2)}\n`, "utf8");
}

const counts = RULE_LISTS.map((key) => `${key}+=${added(before.permissions?.[key], after.permissions?.[key])}`);
console.log(`sync-settings: ${counts.join(" ")} target=${target}${args.dryRun ? " (dry-run, nothing written)" : ""}`);
if (dropped.length) console.log(`sync-settings: without ${dropped.join(", ")}`);

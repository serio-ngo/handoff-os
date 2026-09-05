#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRACKERS = ["monday", "github", "markdown"];

const FIELDS = [
  ["orgName", "Org display name", "Example Org"],
  ["addressAs", "How the agent addresses you", "Captain"],
  ["language", "Reply language (iso code)", "en"],
  ["publicUrl", "Public facts page (empty = none)", "https://example.org/about"],
  ["tracker", `Work tracker (${TRACKERS.join("/")})`, "monday"],
  ["docStore", "Doc store", "Google Drive"],
  ["brandTools", "Design tools", "Canva"],
];

function fail(message) {
  console.error(`setup: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { nonInteractive: false, target: resolve(REPO, "config", "org.json") };
  const known = new Set(FIELDS.map(([key]) => key));
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--non-interactive") args.nonInteractive = true;
    else if (arg === "--target") {
      if (argv[i + 1] === undefined) fail("--target needs a path");
      args.target = resolve(argv[++i]);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!known.has(key)) fail(`unknown argument: ${arg}`);
      args[key] = argv[++i] ?? "";
    }
    else fail(`unknown argument: ${arg}`);
  }
  return args;
}

function checkTracker(value) {
  if (!TRACKERS.includes(value)) fail(`tracker must be one of ${TRACKERS.join(", ")}, got "${value}"`);
}

async function askAll() {
  const rl = createInterface({ input: stdin, output: stdout });
  const out = {};
  try {
    for (const [key, label, fallback] of FIELDS) {
      for (;;) {
        const answer = ((await rl.question(`${label} [${fallback}]: `)).trim() || fallback);
        if (key === "tracker" && !TRACKERS.includes(answer)) {
          console.log(`setup: tracker must be one of ${TRACKERS.join(", ")}`);
          continue;
        }
        out[key] = answer;
        break;
      }
    }
  } finally {
    rl.close();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let values;
  if (args.nonInteractive) {
    values = {};
    for (const [key, , fallback] of FIELDS) values[key] = args[key] ?? fallback;
  } else {
    values = await askAll();
  }
  checkTracker(values.tracker);
  mkdirSync(dirname(args.target), { recursive: true });
  writeFileSync(args.target, JSON.stringify(values, null, 2) + "\n", "utf8");
  console.log(`setup: wrote ${args.target}`);
  console.log("setup: next — node scripts/sync-settings.mjs --target <settings.json> --dry-run");
}

await main();

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "./content-hash.mjs";
import { generateManifest } from "./docs-manifest.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUMPS = {
  major: ([major]) => [major + 1, 0, 0],
  minor: ([major, minor]) => [major, minor + 1, 0],
  patch: ([major, minor, patch]) => [major, minor, patch + 1],
  stamp: (parts) => parts,
};

const fail = (message) => {
  console.error(`release: ${message}`);
  process.exit(1);
};

const [bump, ...rest] = process.argv.slice(2);
const note = rest.join(" ").trim();
if (!BUMPS[bump]) fail(`usage: node scripts/release.mjs <${Object.keys(BUMPS).join("|")}> "one-line note"`);
if (!note) fail("a one-line note is required — it becomes the changelog entry");

const suite = spawnSync(process.execPath, ["--test", "--test-skip-pattern=regenerated artefacts"], {
  cwd: REPO, stdio: "inherit",
});
if (suite.status !== 0) fail("the suite is red — fix it, then release");

const manifestPath = path.join(REPO, "plugins", "handoff-os", ".claude-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = BUMPS[bump](manifest.version.split(".").map(Number)).join(".");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

writeFileSync(path.join(REPO, "docs", "MANIFEST.md"), generateManifest(), "utf8");

const packagePath = path.join(REPO, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
pkg.version = manifest.version;
pkg.contentHash = contentHash();
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

const changelogPath = path.join(REPO, "CHANGELOG.md");
const previous = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8").replace(/^# Changelog\n/, "") : "";
const today = new Date().toISOString().slice(0, 10);
writeFileSync(changelogPath, `# Changelog\n\n## ${manifest.version} — ${today}\n- ${note}\n${previous}`, "utf8");

console.log(`release: ${manifest.version} stamped ${pkg.contentHash}`);
console.log("release: next — review the diff, commit, push, then npm run sync:plugin");

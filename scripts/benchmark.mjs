#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.argv[2] || process.cwd();
const slug = REPO.replace(/[\\/:]/g, '-');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects', slug);

const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.jsonl') ? [full] : []);
}) : []);

function usage(file) {
  const totals = { input: 0, output: 0, cache: 0, turns: 0 };
  let lines;
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { return totals; }
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const u = entry.message && entry.message.usage;
    if (!u) continue;
    totals.turns += 1;
    totals.input += Number(u.input_tokens || 0) + Number(u.cache_creation_input_tokens || 0);
    totals.output += Number(u.output_tokens || 0);
    totals.cache += Number(u.cache_read_input_tokens || 0);
  }
  return totals;
}

const add = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cache: a.cache + b.cache, turns: a.turns + b.turns });
const ZERO = { input: 0, output: 0, cache: 0, turns: 0 };
const num = (n) => Number(n).toLocaleString('en-US');
const row = (label, value) => console.log(`  ${label.padEnd(30)}${String(value).padStart(16)}`);

const since = Number(process.env.HANDOFF_BENCH_DAYS || 7) * 864e5;
const files = walk(PROJECTS).filter((f) => {
  try { return Date.now() - statSync(f).mtimeMs < since; } catch { return false; }
});
const main = files.filter((f) => !f.includes(`${path.sep}subagents${path.sep}`));
const subs = files.filter((f) => f.includes(`${path.sep}subagents${path.sep}`));

const mainTotals = main.map(usage).reduce(add, ZERO);
const subTotals = subs.map(usage).reduce(add, ZERO);
const delegated = subTotals.input + subTotals.output;
const kept = mainTotals.input + mainTotals.output;

console.log(`\nhandoff-os benchmark — ${path.basename(REPO)}, last ${since / 864e5} day(s)`);
console.log(`  transcripts: ${main.length} main, ${subs.length} subagent\n`);
row('main context tokens', num(kept));
row('delegated to subagents', num(delegated));
row('cache reads (main)', num(mainTotals.cache));
row('delegation ratio', delegated + kept ? `${((delegated / (delegated + kept)) * 100).toFixed(1)}%` : 'n/a');

const month = new Date().toISOString().slice(0, 7);
const ledger = path.join(REPO, 'audit', `${month}.jsonl`);
const saved = { agents: 0, blocked: 0, rereads: 0, slices: 0, tokens: 0 };
if (existsSync(ledger)) {
  for (const line of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.action !== 'read-budget') continue;
    const t = /(\d+) agents, (\d+) blocked, (\d+) re-reads, (\d+) slices/.exec(entry.target || '');
    if (t) { saved.agents += +t[1]; saved.blocked += +t[2]; saved.rereads += +t[3]; saved.slices += +t[4]; }
    const k = /~(\d+) tokens saved/.exec(entry.result || '');
    if (k) saved.tokens += +k[1];
  }
}
console.log(`\n  guard ledger, ${month}`);
row('subagents dispatched', num(saved.agents));
row('operations blocked', num(saved.blocked));
row('re-reads blocked', num(saved.rereads));
row('large reads sliced', num(saved.slices));
row('tokens kept out of context', `~${num(saved.tokens)}`);
console.log();

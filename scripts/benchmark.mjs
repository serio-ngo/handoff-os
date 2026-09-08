#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const flags = { write: false, days: Number(process.env.HANDOFF_BENCH_DAYS || 7) };
let REPO = process.cwd();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--days') flags.days = Number(argv[++i] || flags.days);
  else if (!argv[i].startsWith('--')) REPO = argv[i];
}
REPO = path.resolve(REPO);
const slug = REPO.replace(/[\\/:]/g, '-');
const HOME_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const candidates = [path.join(HOME_PROJECTS, slug)];
if (existsSync(HOME_PROJECTS)) {
  const base = path.basename(REPO);
  for (const name of readdirSync(HOME_PROJECTS)) {
    const full = path.join(HOME_PROJECTS, name);
    if (full !== candidates[0] && name.includes(base)) candidates.push(full);
  }
}

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
const compactTok = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n));
const row = (label, value) => console.log(`  ${label.padEnd(30)}${String(value).padStart(16)}`);

const since = flags.days * 864e5;
const files = candidates.flatMap(walk).filter((f) => {
  try { return Date.now() - statSync(f).mtimeMs < since; } catch { return false; }
});
const main = files.filter((f) => !f.includes(`${path.sep}subagents${path.sep}`));
const subs = files.filter((f) => f.includes(`${path.sep}subagents${path.sep}`));

const mainTotals = main.map(usage).reduce(add, ZERO);
const subTotals = subs.map(usage).reduce(add, ZERO);
const delegated = subTotals.input + subTotals.output;
const kept = mainTotals.input + mainTotals.output;

console.log(`\nhandoff-os benchmark — ${path.basename(REPO)}, last ${flags.days} day(s)`);
console.log(`  transcripts: ${main.length} main, ${subs.length} subagent\n`);
row('main context tokens', num(kept));
row('delegated to subagents', num(delegated));
row('cache reads (transcripts)', num(mainTotals.cache));
row('delegation ratio', delegated + kept ? `${((delegated / (delegated + kept)) * 100).toFixed(1)}%` : 'n/a');

const cutoff = Date.now() - since;
const auditDir = path.join(REPO, 'audit');
const ledgers = existsSync(auditDir)
  ? readdirSync(auditDir).filter((n) => /^\d{4}-\d{2}\.jsonl$/.test(n)).map((n) => path.join(auditDir, n))
  : [];
const saved = { agents: 0, blocked: 0, rereads: 0, slices: 0, tokens: 0, cache: 0 };
for (const ledger of ledgers) {
  for (const line of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.action !== 'read-budget') continue;
    if (entry.ts && Date.parse(entry.ts) < cutoff) continue;
    const t = /(\d+) agents, (\d+) blocked, (\d+) re-reads, (\d+) slices/.exec(entry.target || '');
    if (t) { saved.agents += +t[1]; saved.blocked += +t[2]; saved.rereads += +t[3]; saved.slices += +t[4]; }
    const k = /~([\d,.]+)(k?)\s+tokens?\s+saved/.exec(entry.result || '');
    if (k) saved.tokens += Math.round(parseFloat(k[1].replace(/,/g, '')) * (k[2] ? 1000 : 1));
    const c = /(\d[\d,]*)\s+cache-read/.exec(entry.result || '');
    if (c) saved.cache += Number(c[1].replace(/,/g, ''));
  }
}
console.log(`\n  guard ledger, last ${flags.days} day(s)`);
row('subagents dispatched', num(saved.agents));
row('operations blocked', num(saved.blocked));
row('re-reads blocked', num(saved.rereads));
row('large reads sliced', num(saved.slices));
row('tokens saved', `~${num(saved.tokens)}`);
row('cache reads (ledger, billed)', num(saved.cache));
console.log();

const OPEN = '<!-- handoff-stats -->';
const CLOSE = '<!-- /handoff-stats -->';
const statsBlock = () => {
  const actions = saved.blocked + saved.rereads + saved.slices + saved.agents;
  if (!actions && !saved.tokens) return [`No measured sessions in the last ${flags.days} days yet.`];
  return [
    `Last ${flags.days} days, ${main.length} sessions: ~${compactTok(saved.tokens)} tok saved across ${num(actions)} guard actions (${num(saved.blocked)} blocked, ${num(saved.rereads)} re-reads, ${num(saved.slices)} large reads sliced, ${num(saved.agents)} subagents dispatched).`,
    `Cache reads in the same window: ${num(saved.cache)} (billed at reduced price, not counted as saved). Method: blocked whole-file bytes / 4.`,
  ];
};

if (flags.write) {
  const file = path.join(REPO, 'README.md');
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { text = null; }
  if (text === null) {
    console.log(`  benchmark: no README at ${file}, leaving it alone`);
  } else {
    const lines = text.split('\n');
    const open = lines.indexOf(OPEN);
    const close = lines.indexOf(CLOSE);
    if (open < 0 || close < open) {
      console.log(`  benchmark: no handoff-stats markers in ${file}, leaving it alone`);
    } else {
      const next = [...lines.slice(0, open + 1), ...statsBlock(), ...lines.slice(close)];
      writeFileSync(file, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
      console.log(`  benchmark: README stats block refreshed (${flags.days}d window)`);
    }
  }
}

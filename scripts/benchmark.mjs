#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const flags = { write: false, days: 0 };
let REPO = process.cwd();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--days') flags.days = Number(argv[i += 1] || 0);
  else if (!argv[i].startsWith('--')) REPO = argv[i];
}
REPO = path.resolve(REPO);

const auditDir = path.join(REPO, 'audit');
const ledgers = existsSync(auditDir)
  ? readdirSync(auditDir).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort()
    .map((name) => path.join(auditDir, name))
  : [];

const cutoff = flags.days ? Date.now() - flags.days * 864e5 : 0;
const t = { agents: 0, denies: 0, rereads: 0, slices: 0, deduped: 0, deferred: 0, read: 0, turns: 0 };

for (const file of ledgers) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.action !== 'read-budget') continue;
    if (cutoff && entry.ts && Date.parse(entry.ts) < cutoff) continue;
    t.turns += 1;
    const counts = /(\d+) agents, (\d+) blocked, (\d+) re-reads, (\d+) slices/.exec(entry.target || '');
    if (counts) {
      t.agents += +counts[1]; t.denies += +counts[2]; t.rereads += +counts[3]; t.slices += +counts[4];
    }
    const toks = /~(\d+) tok deduped, (\d+) tok deferred, (\d+) tok read/.exec(entry.result || '');
    if (toks) { t.deduped += +toks[1]; t.deferred += +toks[2]; t.read += +toks[3]; }
  }
}

const num = (n) => Number(n || 0).toLocaleString('en-US');
const tokc = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n));
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const row = (label, value) => console.log(`  ${label.padEnd(34)}${String(value).padStart(12)}`);
const rule = (name, fired, effect) => console.log(`  ${name.padEnd(22)}${num(fired).padStart(6)}   ${effect}`);

const volume = t.deduped + t.read;
const actions = t.denies + t.rereads + t.slices + t.agents;
const window = flags.days ? `last ${flags.days} day(s)` : 'all recorded turns';

console.log(`\nhandoff-os benchmark — ${path.basename(REPO)}, ${window}`);
console.log(`  source: audit/*.jsonl, ${t.turns} recorded turn(s)`);
console.log('  token counts are file bytes / 4, an estimate, not a measurement\n');

console.log('  context');
row('duplicate tok removed', `~${tokc(t.deduped)}`);
row('share of whole-file read tok', `${share(t.deduped, volume)}%`);
row('tok deferred to slice or scout', `~${tokc(t.deferred)}`);
row('tok admitted to context', `~${tokc(t.read)}`);

console.log('\n  rules, and what each one does');
rule('re-read dedup', t.rereads, 'drops a byte-identical file already in context');
rule('whole-file cap', t.slices, 'defers a large file to a slice or to scout');
rule('denies', t.denies, 'egress lock plus the session read ceiling');
rule('subagent dispatch', t.agents, 'moves reading off the main thread');
console.log();

const OPEN = '<!-- handoff-stats -->';
const CLOSE = '<!-- /handoff-stats -->';
const statsBlock = () => {
  if (!actions) return [`No measured turns recorded yet (${window}).`];
  const headline = volume || t.deferred
    ? `Measured over ${num(t.turns)} recorded turns: ~${tokc(t.deduped)} duplicate tokens removed, `
      + `${share(t.deduped, volume)}% of all whole-file read volume, and ~${tokc(t.deferred)} tokens `
      + `deferred to a slice or to the scout agent.`
    : `Measured over ${num(t.turns)} recorded turns. Token figures start accumulating from the next turn.`;
  return [
    headline,
    `Guard actions: ${num(actions)} — ${num(t.rereads)} re-reads dropped, ${num(t.slices)} large files `
    + `deferred, ${num(t.denies)} denies, ${num(t.agents)} subagents dispatched. Token counts are file `
    + `bytes / 4, an estimate. Source: this repository's own audit ledger, no session transcripts.`,
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
      console.log('  benchmark: README stats block refreshed');
    }
  }
}

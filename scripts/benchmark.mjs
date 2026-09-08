#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const flags = { write: false, days: 0, eval: false, json: false };
let REPO = process.cwd();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--eval') flags.eval = true;
  else if (argv[i] === '--json') flags.json = true;
  else if (argv[i] === '--days') flags.days = Number(argv[i += 1] || 0);
  else if (!argv[i].startsWith('--')) REPO = argv[i];
}
REPO = path.resolve(REPO);

const num = (n) => Number(n || 0).toLocaleString('en-US');
const tokc = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n));
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');

function runEval() {
  const corpusFile = path.join(REPO, 'eval', 'guard-corpus.jsonl');
  const external = process.env.HANDOFF_EVAL_GUARD;
  const own = path.join('plugins', 'handoff-os', 'scripts', 'guard.mjs');
  const cmd = (external || `${process.execPath} ${path.join(REPO, own)}`).split(/\s+/);
  const guardLabel = external || own.split(path.sep).join('/');
  const cases = readFileSync(corpusFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const probe = mkdtempSync(path.join(tmpdir(), 'handoff-eval-'));
  const env = { ...process.env, HANDOFF_OS_DIR: probe };
  const rows = cases.map((c) => {
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: `eval-${String(c.id).replace(/[^A-Za-z0-9_-]/g, '')}`,
      cwd: probe,
      tool_name: c.tool,
      tool_input: c.input || {},
    };
    const run = spawnSync(cmd[0], [...cmd.slice(1)], { input: JSON.stringify(payload), encoding: 'utf8', env });
    const blocked = run.status === 2;
    return { ...c, blocked, hit: blocked === (c.want === 'block') };
  });

  const held = rows.filter((r) => !r.known_gap);
  const adversarial = rows.filter((r) => r.known_gap);
  const tp = held.filter((r) => r.want === 'block' && r.blocked).length;
  const fn = held.filter((r) => r.want === 'block' && !r.blocked).length;
  const fp = held.filter((r) => r.want === 'allow' && r.blocked).length;
  const tn = held.filter((r) => r.want === 'allow' && !r.blocked).length;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn ? fp / (fp + tn) : 0;
  const caught = adversarial.filter((r) => r.blocked).length;
  const cats = [...new Set(held.map((r) => r.category))].sort().map((cat) => {
    const inCat = held.filter((r) => r.category === cat);
    return {
      category: cat,
      caught: inCat.filter((r) => r.want === 'block' && r.blocked).length,
      dangerous: inCat.filter((r) => r.want === 'block').length,
      false_positives: inCat.filter((r) => r.want === 'allow' && r.blocked).length,
      benign: inCat.filter((r) => r.want === 'allow').length,
    };
  });
  const misses = held.filter((r) => !r.hit);
  const stamp = new Date().toISOString().slice(0, 10);
  const report = {
    run: stamp,
    guard: guardLabel,
    cases: rows.length,
    confusion: { tp, fp, tn, fn },
    recall, precision, f1, fpr,
    adversarial: { caught, cases: adversarial.length },
    categories: cats,
    misses: misses.map((m) => ({ id: m.id, got: m.blocked ? 'block' : 'allow', want: m.want, note: m.note })),
    evasions: adversarial.map((m) => ({ id: m.id, got: m.blocked ? 'block' : 'allow', note: m.note })),
  };

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return misses.length ? 1 : 0;
  }

  const p1 = (n) => `${Math.round(n * 100)}%`;
  console.log(`\nhandoff-os guard eval — ${rows.length} cases`);
  console.log('  corpus: eval/guard-corpus.jsonl');
  console.log(`  guard:  ${guardLabel}, exit 2 = blocked\n`);
  console.log(`  held-out set              blocked   allowed`);
  console.log(`  dangerous ${String(tp + fn).padStart(3)} case(s)  ${String(tp).padStart(7)}   ${String(fn).padStart(7)}`);
  console.log(`  benign    ${String(fp + tn).padStart(3)} case(s)  ${String(fp).padStart(7)}   ${String(tn).padStart(7)}\n`);
  console.log(`  recall               ${`${tp}/${tp + fn}`.padStart(7)}  ${p1(recall).padStart(5)}`);
  console.log(`  precision            ${`${tp}/${tp + fp}`.padStart(7)}  ${p1(precision).padStart(5)}`);
  console.log(`  false-positive rate  ${`${fp}/${fp + tn}`.padStart(7)}  ${p1(fpr).padStart(5)}`);
  console.log(`  f1                            ${f1.toFixed(2).padStart(9)}`);
  console.log('\n  by category (caught / dangerous · false / benign)');
  for (const cat of cats) {
    console.log(`  ${cat.category.padEnd(10)}${String(cat.caught).padStart(3)} / ${String(cat.dangerous).padEnd(4)}  ${String(cat.false_positives).padStart(3)} / ${cat.benign}`);
  }
  if (misses.length) {
    console.log('\n  misses');
    for (const m of misses) console.log(`  ${m.id.padEnd(12)}got ${m.blocked ? 'block' : 'allow'}, want ${m.want}`);
  }
  console.log(`\n  adversarial set — known evasions, scored apart: ${caught}/${adversarial.length} caught`);
  for (const m of adversarial) console.log(`  ${m.id.padEnd(12)}${(m.blocked ? 'blocked' : 'allowed').padEnd(8)}${m.note}`);
  console.log();

  if (flags.write) {
    const file = path.join(REPO, 'docs', 'BENCHMARK.md');
    const OPEN = '<!-- eval-results -->';
    const CLOSE = '<!-- /eval-results -->';
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { text = null; }
    if (text === null) return console.log(`  eval: no BENCHMARK.md at ${file}, leaving it alone`), misses.length ? 1 : 0;
    const lines = text.split('\n');
    const open = lines.indexOf(OPEN);
    const close = lines.indexOf(CLOSE);
    if (open < 0 || close < open) return console.log(`  eval: no eval-results markers in ${file}, leaving it alone`), misses.length ? 1 : 0;
    const block = [
      `Run ${stamp} · ${rows.length} cases · guard \`${guardLabel}\` · exit 2 = blocked.`,
      '',
      '| Metric | Value |',
      '|---|---|',
      `| Recall | ${tp}/${tp + fn} (${p1(recall)}) |`,
      `| Precision | ${tp}/${tp + fp} (${p1(precision)}) |`,
      `| False-positive rate | ${fp}/${fp + tn} (${p1(fpr)}) |`,
      `| F1 | ${f1.toFixed(2)} |`,
      `| Adversarial caught | ${caught}/${adversarial.length} (${p1(adversarial.length ? caught / adversarial.length : 0)}) |`,
      '',
      `Confusion matrix: TP ${tp} · FN ${fn} · FP ${fp} · TN ${tn}. Adversarial cases are scored apart, never folded in.`,
      '',
      '| Category | Caught / dangerous | False / benign |',
      '|---|---|---|',
      ...cats.map((c) => `| ${c.category} | ${c.caught}/${c.dangerous} | ${c.false_positives}/${c.benign} |`),
      '',
      ...misses.map((m) => `- Miss ${m.id}: got ${m.blocked ? 'block' : 'allow'}, want ${m.want} — ${m.note}.`),
      ...adversarial.map((m) => `- \`${m.id}\` ${m.blocked ? 'now caught' : 'still open'} — ${m.note}.`),
    ];
    writeFileSync(file, `${[...lines.slice(0, open + 1), ...block, ...lines.slice(close)].join('\n').replace(/\n+$/, '')}\n`, 'utf8');
    console.log('  eval: BENCHMARK.md results block refreshed');
  }
  return misses.length ? 1 : 0;
}

if (flags.eval) process.exit(runEval());

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

const row = (label, value) => console.log(`  ${label.padEnd(34)}${String(value).padStart(12)}`);
const rule = (name, fired, effect) => console.log(`  ${name.padEnd(22)}${num(fired).padStart(6)}   ${effect}`);

const volume = t.deduped + t.read;
const actions = t.denies + t.rereads + t.slices + t.agents;
const window = flags.days ? `last ${flags.days} day(s)` : 'all recorded turns';

console.log(`\nhandoff-os benchmark — ${path.basename(REPO)}, ${window}`);
console.log(`  source: audit/*.jsonl, ${t.turns} recorded turn(s)`);
console.log('  token counts are file bytes / 4, an estimate, not a measurement\n');

console.log('  context');
row('duplicate tok removed (estimate)', `~${tokc(t.deduped)}`);
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
  if (!actions) return [`No ledger turns recorded yet (${window}). Method and limits: docs/BENCHMARK.md.`];
  return [
    `Ledger estimate over ${num(t.turns)} recorded turns, not a measured saving. Method: docs/BENCHMARK.md.`,
    `Guard actions: ${num(actions)} — ${num(t.rereads)} re-reads dropped, ${num(t.slices)} large files `
    + `deferred, ${num(t.denies)} denies, ${num(t.agents)} subagents dispatched. Token counts are file `
    + `bytes / 4, an estimate from this repository's own audit ledger, which is local-only and gitignored.`,
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

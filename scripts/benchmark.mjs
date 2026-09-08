#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homedir } from 'node:os';
import { MODES } from '../eval/baselines.mjs';
import { usage } from '../plugins/handoff-os/scripts/verify.mjs';
import { inventory, inventoryBlock, writeBlock } from './generate.mjs';

const flags = { write: false, days: 0, eval: false, compare: false, latency: false, json: false };
let REPO = process.cwd();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--eval') flags.eval = true;
  else if (argv[i] === '--compare') flags.compare = true;
  else if (argv[i] === '--latency') flags.latency = true;
  else if (argv[i] === '--json') flags.json = true;
  else if (argv[i] === '--days') flags.days = Number(argv[i += 1] || 0);
  else if (!argv[i].startsWith('--')) REPO = argv[i];
}
REPO = path.resolve(REPO);

const num = (n) => Number(n || 0).toLocaleString('en-US');
const tokc = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n);
};
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const rate = (a, t) => (t ? `${a}/${t} (${Math.round((a / t) * 100)}%)` : 'n/a');
const percent = (a, t) => (t ? Math.round((a / t) * 100) : 0);
const OWN = 'plugins/handoff-os/scripts/guard.mjs';

const corpus = () => readFileSync(path.join(REPO, 'eval', 'guard-corpus.jsonl'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

const payloadFor = (c, probe) => JSON.stringify({
  hook_event_name: 'PreToolUse',
  session_id: `eval-${String(c.id).replace(/[^A-Za-z0-9_-]/g, '')}`,
  cwd: probe,
  tool_name: c.tool,
  tool_input: c.input || {},
});

function score(cmd, cases) {
  const probe = mkdtempSync(path.join(tmpdir(), 'handoff-eval-'));
  const env = {
    ...process.env,
    HANDOFF_OS_DIR: probe,
    POLICY_FILE: path.join(REPO, 'settings', 'policy.json'),
  };
  const rows = cases.map((c) => {
    const run = spawnSync(cmd[0], cmd.slice(1), { input: payloadFor(c, probe), encoding: 'utf8', env });
    return { ...c, blocked: run.status === 2 };
  });
  const held = rows.filter((r) => !r.known_gap);
  const gaps = rows.filter((r) => r.known_gap);
  const n = (want, blocked) => held.filter((r) => r.want === want && r.blocked === blocked).length;
  const tp = n('block', true);
  const fn = n('block', false);
  const fp = n('allow', true);
  const tn = n('allow', false);
  return {
    cases: rows.length,
    tp,
    fn,
    fp,
    tn,
    recall: percent(tp, tp + fn),
    precision: percent(tp, tp + fp),
    fpRate: percent(fp, fp + tn),
    f1: tp ? Number(((2 * tp) / (2 * tp + fp + fn)).toFixed(2)) : 0,
    gapsCaught: gaps.filter((r) => r.blocked).length,
    gapsTotal: gaps.length,
    misses: held.filter((r) => r.blocked !== (r.want === 'block')),
    gaps,
  };
}

function mergeScores(root, patch) {
  const file = path.join(root, 'eval', 'scores.json');
  let current = {};
  try { current = JSON.parse(readFileSync(file, 'utf8')); } catch { current = {}; }
  writeFileSync(file, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`, 'utf8');
  console.log('  wrote eval/scores.json');
}

const ownCmd = () => (process.env.HANDOFF_EVAL_GUARD
  ? process.env.HANDOFF_EVAL_GUARD.split(/\s+/)
  : [process.execPath, path.join(REPO, OWN)]);

function latency(cases = 90) {
  const cmd = ownCmd();
  const probe = mkdtempSync(path.join(tmpdir(), 'handoff-lat-'));
  const env = { ...process.env, HANDOFF_OS_DIR: probe };
  const shapes = [
    { id: 'lat-allow', tool: 'Bash', input: { command: 'git status' } },
    { id: 'lat-block', tool: 'Bash', input: { command: 'git merge main' } },
    { id: 'lat-mcp', tool: 'mcp__gmail__get_thread', input: { id: '1' } },
  ];
  const times = [];
  for (let i = 0; i < cases; i += 1) {
    const shape = shapes[i % shapes.length];
    const start = process.hrtime.bigint();
    spawnSync(cmd[0], cmd.slice(1), { input: payloadFor({ ...shape, id: `${shape.id}-${i}` }, probe), encoding: 'utf8', env });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  const at = (f) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * f))]);
  return { samples: times.length, medianMs: at(0.5), p95Ms: at(0.95) };
}

function evalBlock(result, label) {
  return [
    `Run ${new Date().toISOString().slice(0, 10)} · ${result.cases} cases · guard \`${label}\` · exit 2 = blocked.`, '',
    '| Metric | Value |', '|---|---|',
    `| Recall | ${rate(result.tp, result.tp + result.fn)} |`,
    `| Precision | ${rate(result.tp, result.tp + result.fp)} |`,
    `| False-positive rate | ${rate(result.fp, result.fp + result.tn)} |`,
    `| F1 | ${result.f1.toFixed(2)} |`,
    `| Known bypasses caught | ${rate(result.gapsCaught, result.gapsTotal)} |`, '',
    `Confusion: TP ${result.tp} · FN ${result.fn} · FP ${result.fp} · TN ${result.tn}. Bypasses scored apart.`, '',
    ...result.misses.map((m) => `- Miss \`${m.id}\`: got ${m.blocked ? 'block' : 'allow'}, want ${m.want}.`),
    ...result.gaps.map((m) => `- \`${m.id}\` ${m.blocked ? 'caught' : 'open'} — ${m.note}.`),
  ];
}

function compareBlock(own, baselines) {
  const line = (name, s) => `| ${name} | ${s.recall}% | ${s.fpRate}% | ${s.f1.toFixed(2)} |`;
  return [
    `| Guard | Caught | Wrongly blocked | F1 |`, '|---|---|---|---|',
    ...Object.entries(baselines).map(([mode, s]) => line(MODES[mode], s)),
    line('**handoff-os**', own),
    '',
    `${own.cases} cases, ${new Date().toISOString().slice(0, 10)}; the comparators are mechanism baselines in `
    + '`eval/baselines.mjs`, not vendor code. [Method](docs/BENCHMARK.md).',
  ];
}

function run() {
  const cases = corpus();
  const label = process.env.HANDOFF_EVAL_GUARD || OWN;
  const own = score(ownCmd(), cases);

  const baselines = {};
  if (flags.compare) {
    for (const mode of Object.keys(MODES)) {
      baselines[mode] = score([process.execPath, path.join(REPO, 'eval', 'baselines.mjs'), mode], cases);
    }
  }
  const lat = flags.latency || flags.compare ? latency() : null;

  if (flags.json) {
    console.log(JSON.stringify({ own, baselines, latency: lat }, (k, v) => (k === 'misses' || k === 'gaps' ? undefined : v)));
  } else {
    console.log(`\n${evalBlock(own, label).join('\n')}\n`);
    if (flags.compare) console.log(`${compareBlock(own, baselines).join('\n')}\n`);
    if (lat) console.log(`  hook cost: ${lat.medianMs} ms median, ${lat.p95Ms} ms p95 over ${lat.samples} calls\n`);
  }

  if (flags.write) {
    console.log(`  ${writeBlock(path.join(REPO, 'docs', 'BENCHMARK.md'), '<!-- eval-results -->', '<!-- /eval-results -->', evalBlock(own, label))}`);
    if (flags.compare) {
      console.log(`  ${writeBlock(path.join(REPO, 'README.md'), '<!-- guard-scores -->', '<!-- /guard-scores -->', compareBlock(own, baselines))}`);
      const inv = inventory(REPO);
      mergeScores(REPO, {
        generated: new Date().toISOString().slice(0, 10),
        version: JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')).version,
        cases: own.cases,
        recall: own.recall,
        precision: own.precision,
        fpRate: own.fpRate,
        f1: own.f1,
        confusion: { tp: own.tp, fn: own.fn, fp: own.fp, tn: own.tn },
        bypassesOpen: own.gapsTotal - own.gapsCaught,
        bypassesTotal: own.gapsTotal,
        logicLines: inv.logicLines,
        dependencies: inv.dependencies,
        baselines: Object.fromEntries(Object.entries(baselines)
          .map(([mode, s]) => [mode, { recall: s.recall, fpRate: s.fpRate, f1: s.f1 }])),
      });
      console.log(`  ${writeBlock(path.join(REPO, 'README.md'), '<!-- inventory -->', '<!-- /inventory -->', inventoryBlock(inv))}`);
    }
  }
  return own.misses.length ? 1 : 0;
}

if (flags.eval || flags.compare || flags.latency) process.exit(run());

const auditDir = path.join(REPO, 'audit');
const ledgers = existsSync(auditDir)
  ? readdirSync(auditDir).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort()
    .map((name) => path.join(auditDir, name))
  : [];

const cutoff = flags.days ? Date.now() - flags.days * 864e5 : 0;
const t = {
  agents: 0, denies: 0, rereads: 0, slices: 0, queries: 0, caps: 0,
  deduped: 0, deferred: 0, offload: 0, read: 0, fresh: 0, cacheRead: 0, turns: 0,
};

for (const file of ledgers) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.action !== 'read-budget') continue;
    if (cutoff && entry.ts && Date.parse(entry.ts) < cutoff) continue;
    t.turns += 1;
    const counts = /(\d+) agents, (\d+) blocked, (\d+) re-reads, (\d+) slices(?:, (\d+) queries, (\d+) caps)?/
      .exec(entry.target || '');
    if (counts) {
      t.agents += +counts[1]; t.denies += +counts[2]; t.rereads += +counts[3]; t.slices += +counts[4];
      t.queries += +(counts[5] || 0); t.caps += +(counts[6] || 0);
    }
    const result = entry.result || '';
    const now = /dedup (\d+) tok, defer (\d+) tok, offload (\d+) tok, admitted (\d+) tok, fresh (\d+) tok, cache-read (\d+) tok/
      .exec(result);
    if (now) {
      t.deduped += +now[1]; t.deferred += +now[2]; t.offload += +now[3];
      t.read += +now[4]; t.fresh += +now[5]; t.cacheRead += +now[6];
    } else {
      // Lines written by earlier versions, kept so the history still counts.
      const old = /~(\d+) tok deduped, (\d+) tok deferred, (\d+) tok read/.exec(result);
      if (old) { t.deduped += +old[1]; t.deferred += +old[2]; t.read += +old[3]; }
      const older = /~(\d+) tokens saved, (\d+) cache-read/.exec(result);
      if (older) { t.deferred += +older[1]; t.cacheRead += +older[2]; }
    }
  }
}

// Ledger lines written before the Stop hook recorded billing carry no `fresh` count, so fall back to
// the transcripts Claude Code keeps for this project. Measured either way, never estimated.
function fromTranscripts(root) {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'),
    'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  const out = { fresh: 0, cacheRead: 0, sessions: 0 };
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const one = usage(path.join(dir, name));
    if (!one.turns) continue;
    out.sessions += 1;
    out.fresh += one.fresh;
    out.cacheRead += one.cacheRead;
  }
  return out;
}

const row = (label, value, extra = '') => console.log(`  ${label.padEnd(36)}${String(value).padStart(11)}${extra && `   ${extra}`}`);
const rule = (name, fired, effect) => console.log(`  ${name.padEnd(22)}${num(fired).padStart(6)}   ${effect}`);

const billing = t.fresh ? { fresh: t.fresh, cacheRead: t.cacheRead, sessions: 0 } : fromTranscripts(REPO);
t.fresh = billing.fresh;
t.cacheRead = billing.cacheRead;

const kept = t.deduped + t.deferred + t.offload;
const readVolume = kept + t.read;
const keptPct = share(kept, readVolume);
const resend = t.fresh ? t.cacheRead / t.fresh : 0;
const avoided = Math.round(kept * resend);
const actions = t.denies + t.rereads + t.slices + t.queries + t.caps + t.agents;
const window = flags.days ? `last ${flags.days} day(s)` : 'all recorded turns';

console.log(`\nhandoff-os — context kept out of the main thread, ${window}`);
console.log(`  source: audit/*.jsonl, ${t.turns} recorded turn(s)\n`);

row('read volume the session asked for', `~${tokc(readVolume)}`, 'tok');
row('kept out of context', `~${tokc(kept)}`, `tok   ${keptPct}% of read volume`);
row('  re-read dedup', `~${tokc(t.deduped)}`, 'tok   file was already in context, unchanged');
row('  whole-file cap', `~${tokc(t.deferred)}`, 'tok   over 24KB, a slice or scout instead');
row('  moved to a subagent', `~${tokc(t.offload)}`, 'tok   read under a scout, never in this thread');
row('admitted to the main thread', `~${tokc(t.read)}`, `tok   ${100 - keptPct}% of read volume`);
console.log('  token counts above are file bytes / 4, an estimate, never billing');

if (t.fresh) {
  console.log(`\n  real billing, measured${billing.sessions ? ` across ${billing.sessions} session transcript(s)` : ' from the ledger'}`);
  row('fresh tokens', num(t.fresh), 'tok   input + output + cache write');
  row('cache-read tokens', num(t.cacheRead), 'tok');
  row('context re-send ratio', `${resend.toFixed(1)}x`, 'every fresh token re-read this often');
  row('cache-read likely avoided', `~${tokc(avoided)}`, 'tok   kept tokens at that ratio, an estimate');
}

console.log('\n  guard actions');
rule('re-read dedup', t.rereads, 'a byte-identical file already in context');
rule('whole-file cap', t.slices, 'a large file deferred to a slice or scout');
rule('repeat query', t.queries, 'a Grep or Glob already answered this session');
rule('runaway query cap', t.caps, 'a content Grep with no head_limit');
rule('subagent dispatch', t.agents, 'reading moved off the main thread');
rule('denies', t.denies, 'egress lock plus the session read ceiling');
console.log();

const OPEN = '<!-- handoff-stats -->';
const CLOSE = '<!-- /handoff-stats -->';
const statsBlock = () => {
  if (!actions) return [`No ledger turns recorded yet (${window}). Method: docs/BENCHMARK.md.`];
  return [
    `| Measured over ${num(t.turns)} turns | Tokens | Share |`,
    '|---|---|---|',
    `| Read volume the session asked for | ~${tokc(readVolume)} | 100% |`,
    `| **Kept out of context** | **~${tokc(kept)}** | **${keptPct}%** |`,
    `| — re-read dedup | ~${tokc(t.deduped)} | ${share(t.deduped, readVolume)}% |`,
    `| — whole-file cap | ~${tokc(t.deferred)} | ${share(t.deferred, readVolume)}% |`,
    `| — moved to a subagent | ~${tokc(t.offload)} | ${share(t.offload, readVolume)}% |`,
    `| Admitted to the main thread | ~${tokc(t.read)} | ${100 - keptPct}% |`,
    '',
    ...(t.fresh ? [
      `| Measured billing${billing.sessions ? `, ${billing.sessions} session transcripts` : ''} | Tokens |`,
      '|---|---|',
      `| Fresh — input + output + cache write | ${num(t.fresh)} |`,
      `| Cache-read | ${num(t.cacheRead)} |`,
      `| **Context re-send ratio** | **${resend.toFixed(1)}×** |`,
      `| Cache-read avoided, kept × ratio | ~${tokc(avoided)} |`,
      '',
    ] : []),
    `Guard actions: ${num(actions)}. Token counts are file bytes / 4 from this repo's own local `
    + 'ledger, an estimate; the billing figures are measured. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).',
  ];
};

if (flags.write) {
  console.log(`  ${writeBlock(path.join(REPO, 'README.md'), OPEN, CLOSE, statsBlock())}`);
  mergeScores(REPO, {
    keptPct,
    keptTokens: kept,
    readVolumeTokens: readVolume,
    offloadTokens: t.offload,
    resendRatio: Number(resend.toFixed(1)),
    ledgerTurns: t.turns,
  });
}

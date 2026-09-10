#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homedir } from 'node:os';
import { MODES } from '../eval/baselines.mjs';
import { BYTE_COUNTERS, COUNTERS } from '../plugins/handoff-os/scripts/ledger.mjs';
import { usage } from '../plugins/handoff-os/scripts/verify.mjs';
import { inventory, inventoryBlock, writeBlock } from './generate.mjs';

const flags = { write: false, eval: false, compare: false, latency: false, replay: false };
let REPO = process.cwd();
const REPOS = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--eval') flags.eval = true;
  else if (argv[i] === '--compare') flags.compare = true;
  else if (argv[i] === '--latency') flags.latency = true;
  else if (argv[i] === '--replay') flags.replay = true;
  else if (!argv[i].startsWith('--')) REPOS.push(path.resolve(argv[i]));
}
if (!REPOS.length) REPOS.push(REPO);
REPO = REPOS[0];

const num = (n) => Number(n || 0).toLocaleString('en-US');
const tok4 = (bytes) => Math.round(bytes / 4);
const tokc = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n);
};
const share = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const rate = (a, t) => (t ? `${a}/${t} (${Math.round((a / t) * 100)}%)` : 'n/a');
const percent = (a, t) => (t ? Math.round((a / t) * 100) : 0);
const taxOf = (inv) => ({
  card: Math.round(inv.cardChars / 4),
  skills: Math.round(inv.skillChars / 4),
  agents: Math.round(inv.agentChars / 4),
  total: Math.round(inv.contextChars / 4),
});
const row = (label, value, extra = '') => console.log(`  ${label.padEnd(36)}${String(value).padStart(11)}${extra && `   ${extra}`}`);
const rule = (name, fired, effect) => console.log(`  ${name.padEnd(22)}${num(fired).padStart(6)}   ${effect}`);
const OWN = 'plugins/handoff-os/scripts/guard.mjs';
const ORIGINS = ['spec', 'probe', 'regression'];

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
    origins: Object.fromEntries(ORIGINS.map((origin) => [origin, held.filter((r) => r.origin === origin).length])),
  };
}

const provenance = (origins) => `${origins.spec} of ${ORIGINS.reduce((sum, key) => sum + origins[key], 0)} scored `
  + `cases are \`spec\` (rule-derived), ${origins.probe} \`probe\`, ${origins.regression} \`regression\`; `
  + 'recall here is a regression check, not a detection rate.';

function mergeScores(root, patch) {
  const file = path.join(root, 'eval', 'scores.json');
  let current = {};
  try { current = JSON.parse(readFileSync(file, 'utf8')); } catch { current = {}; }
  const next = { ...current, ...patch };
  delete next.latencyMedianMs;
  delete next.latencyP95Ms;
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
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
    '', provenance(result.origins),
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
    '', provenance(own.origins),
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
  const tax = taxOf(inventory(REPO));

  console.log(`\n${evalBlock(own, label).join('\n')}\n`);
  if (flags.compare) console.log(`${compareBlock(own, baselines).join('\n')}\n`);
  console.log('  context tax — what the plugin itself costs the window');
  row('session card', `~${tokc(tax.card)}`, 'tok   always in context');
  row('skill descriptions', `~${tokc(tax.skills)}`, 'tok   always in context');
  row('agent descriptions', `~${tokc(tax.agents)}`, 'tok   always in context');
  row('total footprint', `~${tokc(tax.total)}`, 'tok   chars / 4, an estimate');
  if (lat) console.log(`  spawn ${lat.medianMs} ms median, ${lat.p95Ms} ms p95 over ${lat.samples} calls — machine-specific, not published\n`);

  if (flags.write) {
    console.log(`  ${writeBlock(path.join(REPO, 'docs', 'BENCHMARK.md'), '<!-- eval-results -->', '<!-- /eval-results -->', evalBlock(own, label))}`);
    if (flags.compare) {
      console.log(`  ${writeBlock(path.join(REPO, 'README.md'), '<!-- guard-scores -->', '<!-- /guard-scores -->', compareBlock(own, baselines))}`);
      const inv = inventory(REPO);
      mergeScores(REPO, {
        generated: new Date().toISOString().slice(0, 10),
        version: JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')).version,
        cases: own.cases,
        taxTokens: tax.total,
        recall: own.recall,
        precision: own.precision,
        fpRate: own.fpRate,
        f1: own.f1,
        confusion: { tp: own.tp, fn: own.fn, fp: own.fp, tn: own.tn },
        bypassesOpen: own.gapsTotal - own.gapsCaught,
        bypassesTotal: own.gapsTotal,
        origins: own.origins,
        logicLines: inv.logicLines,
        contextTokens: tax.total,
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

const transcriptDir = (root) => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'),
  'projects', root.replace(/[^A-Za-z0-9]/g, '-'));

const REPLAY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash']);
const REPLAY_RULES = [
  [/is unchanged and already in context/, 're-read dedup'],
  [/whole-file limit/, 'whole-file cap'],
  [/over the \d+KB ceiling/, 'session ceiling'],
  [/already ran and nothing has been written/, 'repeat query'],
  [/set head_limit/, 'runaway query cap'],
  [/FAN-OUT CAP/, 'fan-out cap'],
  [/DISPATCH BUDGET/, 'dispatch budget'],
  [/EGRESS LOCK/, 'egress lock'],
];

// Re-feeds every judged tool call from this project's real Claude Code transcripts to the guard, in
// order, one sandbox per session. Open-loop: a refusal cannot change what the agent did next, so the
// refusal count is what the guard would have caught on that exact stream, not a counterfactual.
function replay(root) {
  const dir = transcriptDir(root);
  const out = { sessions: 0, calls: 0, judged: 0, blocked: 0, rules: {}, kept: 0, admitted: 0, fresh: 0, cacheRead: 0 };
  if (!existsSync(dir)) return out;
  const guard = path.join(root, OWN);
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const session = name.replace(/\.jsonl$/, '');
    const probe = mkdtempSync(path.join(tmpdir(), 'handoff-replay-'));
    const env = { ...process.env, HANDOFF_OS_DIR: probe, CLAUDE_PROJECT_DIR: root };
    let seen = false;
    for (const line of readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/)) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const u = entry.message?.usage;
      if (u) {
        out.fresh += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
        out.cacheRead += u.cache_read_input_tokens || 0;
      }
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part?.type !== 'tool_use') continue;
        seen = true;
        out.calls += 1;
        if (!REPLAY_TOOLS.has(part.name)) continue;
        out.judged += 1;
        const run = spawnSync(process.execPath, [guard], {
          encoding: 'utf8',
          env,
          input: JSON.stringify({
            hook_event_name: 'PreToolUse',
            session_id: session,
            cwd: root,
            agent_type: entry.isSidechain ? 'handoff-os:scout' : 'main',
            tool_name: part.name,
            tool_input: part.input || {},
          }),
        });
        if (run.status !== 2) continue;
        out.blocked += 1;
        const rule = (REPLAY_RULES.find(([rx]) => rx.test(run.stderr || '')) || [null, 'other'])[1];
        out.rules[rule] = (out.rules[rule] || 0) + 1;
      }
    }
    if (seen) out.sessions += 1;
    const ledger = path.join(probe, '.claude', `.session-${session}.json`);
    if (!existsSync(ledger)) continue;
    const { saved } = JSON.parse(readFileSync(ledger, 'utf8'));
    out.kept += (saved.bytes || 0) + (saved.deferred || 0) + (saved.offload || 0);
    out.admitted += saved.read || 0;
  }
  return out;
}

const BYTES = new Set([...BYTE_COUNTERS, 'read']);
const zeroT = () => ({ ...Object.fromEntries(COUNTERS.map((key) => [key, 0])), fresh: 0, cacheRead: 0, turns: 0 });

function collect(root) {
  const auditDir = path.join(root, 'audit');
  const ledgers = existsSync(auditDir)
    ? readdirSync(auditDir).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort()
      .map((name) => path.join(auditDir, name))
    : [];

  const t = zeroT();
  const marks = [];

  for (const file of ledgers) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line) continue;
      let entry;
      let saved;
      let real;
      try {
        entry = JSON.parse(line);
        if (entry.action !== 'read-budget') continue;
        saved = JSON.parse(entry.target);
        real = JSON.parse(entry.result);
      } catch { continue; }
      t.turns += 1;
      for (const key of COUNTERS) t[key] += BYTES.has(key) ? tok4(saved[key] || 0) : Number(saved[key] || 0);
      t.fresh += Number(real.fresh || 0);
      t.cacheRead += Number(real.cacheRead || 0);
      marks.push({
        turn: Number(real.turns || 0),
        kept: tok4(BYTE_COUNTERS.reduce((sum, key) => sum + Number(saved[key] || 0), 0)),
      });
    }
  }

  const billing = t.fresh
    ? { fresh: t.fresh, cacheRead: t.cacheRead, sessions: 0 }
    : fromTranscripts(root);
  t.fresh = billing.fresh;
  t.cacheRead = billing.cacheRead;
  return { t, billing, notResent: resends(marks), stamped: marks.length };
}

const parts = REPOS.map(collect);
const t = zeroT();
const billing = { fresh: 0, cacheRead: 0, sessions: 0 };
let notResent = 0;
let stamped = 0;
for (const part of parts) {
  for (const key of Object.keys(t)) t[key] += part.t[key];
  billing.fresh += part.billing.fresh;
  billing.cacheRead += part.billing.cacheRead;
  billing.sessions += part.billing.sessions;
  notResent += part.notResent;
  stamped += part.stamped;
}

// Ledger lines written before the Stop hook recorded billing carry no `fresh` count, so fall back to
// the transcripts Claude Code keeps for this project. Measured either way, never estimated.
function fromTranscripts(root) {
  const dir = transcriptDir(root);
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

const kept = t.bytes + t.deferred + t.offload;
const readVolume = kept + t.read;
const keptPct = share(kept, readVolume);
const tax = taxOf(inventory(REPO));
const net = kept - tax.total;
const resend = t.fresh ? t.cacheRead / t.fresh : 0;
const actions = t.blocked + t.rereads + t.slices + t.queries + t.caps + t.agents;

// A byte refused at turn N is a byte the turns after it never re-send. Turn stamps restart with
// each session, so a drop in the count closes one session and opens the next.
function resends(rows) {
  let total = 0;
  for (let i = 0, start = 0; i < rows.length; i += 1) {
    if (i < rows.length - 1 && rows[i + 1].turn > rows[i].turn) continue;
    for (let j = start; j <= i; j += 1) total += rows[j].kept * (rows[i].turn - rows[j].turn);
    start = i + 1;
  }
  return total;
}

console.log('\nhandoff-os — context kept out of the main thread, all recorded turns');
console.log(`  source: ${REPOS.length > 1 ? `${REPOS.length} repos` : 'audit/*.jsonl'}, ${t.turns} recorded turn(s)\n`);

row('read volume the session asked for', `~${tokc(readVolume)}`, 'tok');
row('kept out', `~${tokc(kept)}`, `tok   ${keptPct}% of read volume`);
row('  re-read dedup', `~${tokc(t.bytes)}`, 'tok   file was already in context, unchanged');
row('  whole-file cap', `~${tokc(t.deferred)}`, 'tok   over 24KB, a slice or scout instead');
row('  moved to a subagent', `~${tokc(t.offload)}`, 'tok   read under a scout, never in this thread');
row('admitted to the main thread', `~${tokc(t.read)}`, `tok   ${100 - keptPct}% of read volume`);
console.log('  token counts above are file bytes / 4, an estimate, never billing');
console.log('\n  context tax — what the plugin itself costs the window');
row('session card', `~${tokc(tax.card)}`, 'tok   always in context');
row('skill descriptions', `~${tokc(tax.skills)}`, 'tok   always in context');
row('agent descriptions', `~${tokc(tax.agents)}`, 'tok   always in context');
row('total footprint', `~${tokc(tax.total)}`, 'tok   chars / 4, an estimate');
row('net kept out minus footprint', `~${tokc(net)}`, 'tok   rot avoided less tax');

if (t.fresh) {
  console.log(`\n  real billing, measured${billing.sessions ? ` across ${billing.sessions} session transcript(s)` : ' from the ledger'}`);
  row('fresh tokens', num(t.fresh), 'tok   input + output + cache write');
  row('cache-read tokens', num(t.cacheRead), 'tok');
  row('context re-send ratio', `${resend.toFixed(1)}x`, 'every fresh token re-read this often');
}
console.log(`
  re-sends the refusals removed${stamped ? '' : ' — no turn-stamped ledger line yet'}`);
if (stamped) row('kept tok x turns that followed', `~${tokc(notResent)}`, 'tok   summed per block, per session');

const REPLAY_OPEN = '<!-- handoff-replay -->';
const REPLAY_CLOSE = '<!-- /handoff-replay -->';
if (flags.replay) {
  const rs = REPOS.map((root) => replay(root));
  const r = {
    sessions: 0, calls: 0, judged: 0, blocked: 0, rules: {}, kept: 0, admitted: 0, fresh: 0, cacheRead: 0,
  };
  for (const one of rs) {
    r.sessions += one.sessions; r.calls += one.calls; r.judged += one.judged; r.blocked += one.blocked;
    r.kept += one.kept; r.admitted += one.admitted; r.fresh += one.fresh; r.cacheRead += one.cacheRead;
    for (const [name, count] of Object.entries(one.rules)) r.rules[name] = (r.rules[name] || 0) + count;
  }
  const pct = (part) => share(part, r.judged);
  const rules = Object.entries(r.rules).sort((a, b) => b[1] - a[1]);
  const scope = REPOS.length > 1 ? ` across ${REPOS.length} repos` : '';
  console.log(`\n  trace replay — ${num(r.judged)} judged call(s) from ${r.sessions} real session(s)${scope}`);
  row('refused', num(r.blocked), `${pct(r.blocked)}% of judged calls`);
  for (const [rule, count] of rules) row(`  ${rule}`, num(count), `${pct(count)}%`);
  row('bytes kept out', `~${tokc(tok4(r.kept))}`, 'tok');
  row('bytes admitted', `~${tokc(tok4(r.admitted))}`, 'tok');
  if (flags.write) {
    console.log(`  ${writeBlock(path.join(REPO, 'README.md'), REPLAY_OPEN, REPLAY_CLOSE, [
      `| The maintainer's ${num(r.sessions)} sessions${scope} — run it on yours | Count | Share of judged |`,
      '|---|---|---|',
      `| Tool calls recorded | ${num(r.calls)} | — |`,
      `| Judged by the guard | ${num(r.judged)} | 100% |`,
      `| **Refused** | **${num(r.blocked)}** | **${pct(r.blocked)}%** |`,
      ...rules.map(([rule, count]) => `| — ${rule} | ${num(count)} | ${pct(count)}% |`),
      '',
      'Every `Read`, `Grep`, `Glob` and `Bash` call from this machine\'s Claude Code transcripts, re-fed '
      + 'to the guard in order, one sandbox per session. Open-loop: a refusal cannot change what the '
      + 'agent did next, so this is what the guard catches on that exact stream, not a counterfactual. '
      + 'Reproduce with `npm run benchmark:replay`.',
    ])}`);
  }
}

console.log('\n  guard actions');
rule('re-read dedup', t.rereads, 'a byte-identical file already in context');
rule('deferred to slice or scout', t.slices, 'over the file cap or the session ceiling');
rule('repeat query', t.queries, 'a Grep or Glob already answered this session');
rule('runaway query cap', t.caps, 'a content Grep with no head_limit');
rule('subagent dispatch', t.agents, 'reading moved off the main thread');
rule('scout used', t.scouts, 'a lookup answered off-thread');
rule('runner used', t.runners, 'a verdict back, never the log');
rule('blocked', t.blocked, 'egress lock, dispatch budget and fan-out cap');
console.log();

const OPEN = '<!-- handoff-stats -->';
const CLOSE = '<!-- /handoff-stats -->';
const statsBlock = () => {
  if (!actions) return ['No ledger turns recorded yet. Method: docs/BENCHMARK.md.'];
  return [
    `| Measured over ${num(t.turns)} turns | Tokens | Share |`,
    '|---|---|---|',
    `| Read volume the session asked for | ~${tokc(readVolume)} | 100% |`,
    `| **Kept out** | **~${tokc(kept)}** | **${keptPct}%** |`,
    `| — re-read dedup | ~${tokc(t.bytes)} | ${share(t.bytes, readVolume)}% |`,
    `| — whole-file cap | ~${tokc(t.deferred)} | ${share(t.deferred, readVolume)}% |`,
    `| — moved to a subagent | ~${tokc(t.offload)} | ${share(t.offload, readVolume)}% |`,
    `| Admitted to the main thread | ~${tokc(t.read)} | ${100 - keptPct}% |`,
    '',
    `| Context tax — the plugin's own footprint | Tokens |`,
    '|---|---|',
    `| Session card, always in context | ~${tokc(tax.card)} |`,
    `| Skill descriptions, always in context | ~${tokc(tax.skills)} |`,
    `| Agent descriptions, always in context | ~${tokc(tax.agents)} |`,
    `| **Total footprint** | **~${tokc(tax.total)}** |`,
    '| Per turn, on top of that | **0** (since 1.6.0) |',
    `| **Net kept out minus footprint** | **~${tokc(net)}** |`,
    '',
    ...(t.fresh ? [
      `| Measured billing${billing.sessions ? `, ${billing.sessions} session transcripts` : ''} | Tokens |`,
      '|---|---|',
      `| Fresh — input + output + cache write | ${num(t.fresh)} |`,
      `| Cache-read | ${num(t.cacheRead)} |`,
      `| **Context re-send ratio** | **${resend.toFixed(1)}×** |`,
      ...(stamped ? [`| Re-sends removed, kept × turns that followed | ~${tokc(notResent)} |`] : []),
      '',
    ] : []),
    `Guard actions: ${num(actions)}${t.scouts || t.runners ? ` (used ${num(t.scouts)} scout, ${num(t.runners)} runner)` : ''}. Token counts are file bytes / 4 from this repo's own local `
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
    taxTokens: tax.total,
    repos: REPOS.length,
    resendRatio: Number(resend.toFixed(1)),
    resendsRemoved: notResent,
    ledgerTurns: t.turns,
  });
}

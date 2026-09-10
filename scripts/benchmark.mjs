#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homedir } from 'node:os';
import { MODES } from '../eval/baselines.mjs';
import { BYTE_COUNTERS, COUNTERS } from '../plugins/handoff-os/scripts/ledger.mjs';
import { SPAWN_TOOLS } from '../plugins/handoff-os/scripts/patterns.mjs';
import { usage } from '../plugins/handoff-os/scripts/verify.mjs';
import { inventory, inventoryBlock, writeBlock } from './generate.mjs';

const flags = { write: false, eval: false, compare: false, latency: false, replay: false, ab: false };
const AB = {
  tasks: 'eval/tasks.jsonl', n: Infinity, model: 'claude-haiku-4-5-20251001', dryRun: false, out: 'eval/ab-results.json',
  task: null, micro: true, maxTurns: 12, timeoutMs: 15 * 60 * 1000, budgetUsd: 5, seed: 20260910, keep: false, render: false,
  claude: process.env.HANDOFF_AB_CLAUDE || 'claude', pluginDir: null,
};
const AB_VALUE = { '--tasks': 'tasks', '--n': 'n', '--model': 'model', '--out': 'out', '--task': 'task', '--max-turns': 'maxTurns', '--timeout': 'timeoutMs', '--budget': 'budgetUsd', '--seed': 'seed', '--plugin-dir': 'pluginDir' };
let REPO = process.cwd();
const REPOS = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--write') flags.write = true;
  else if (argv[i] === '--eval') flags.eval = true;
  else if (argv[i] === '--compare') flags.compare = true;
  else if (argv[i] === '--latency') flags.latency = true;
  else if (argv[i] === '--replay') flags.replay = true;
  else if (argv[i] === 'ab') flags.ab = true;
  else if (argv[i] === '--dry-run') AB.dryRun = true;
  else if (argv[i] === '--no-micro') AB.micro = false;
  else if (argv[i] === '--keep') AB.keep = true;
  else if (argv[i] === '--render') AB.render = true;
  else if (AB_VALUE[argv[i]]) {
    const key = AB_VALUE[argv[i]];
    const value = argv[i + 1];
    AB[key] = typeof AB[key] === 'number' ? Number(value) : value;
    i += 1;
  }
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

const AB_OPEN = '<!-- handoff-ab -->';
const AB_CLOSE = '<!-- /handoff-ab -->';
const AB_DOC_OPEN = '<!-- ab-results -->';
const AB_DOC_CLOSE = '<!-- /ab-results -->';
const AB_TOOLS = 'Read,Grep,Glob,Bash,Edit,Write,Agent,Task';
const AB_STRIP = ['CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD', 'CLAUDE_ADDITIONAL_DIRECTORIES', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_COORDINATOR_MODE', 'CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS',
  'CLAUDE_CODE_TERMINAL_MCP_TOOLS', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_REMOTE',
  'CLAUDE_CODE_REMOTE_SESSION_ID', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_MEMORY_STORES',
  'CLAUDE_COWORK_MEMORY_PATH_OVERRIDE', 'CLAUDE_CODE_EXTRA_METADATA', 'CLAUDE_CODE_DISABLE_BUILTIN_ANTMCP',
  'CLAUDE_CODE_REMOTE_HERMETIC_MODE', 'CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'HANDOFF_OS_DIR'];
// PRICES: USD per 1M tokens · https://platform.claude.com/docs/en/about-claude/pricing · read 2026-09-10 via the claude-api skill (table cached 2026-06-24) · cache write 1.25x (5m) or 2x (1h) of input · cache read 0.1x
const PRICES = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-5': { input: 5, output: 25 },
};
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;
const AB_RULES = [
  [/whole-file limit/, 'whole-file'],
  [/over the \d+KB ceiling/, 'ceiling'],
  [/is unchanged and already in context/, 're-read'],
  [/already ran and nothing has been written/, 'repeat-query'],
  [/set head_limit/, 'runaway-query'],
  [/FAN-OUT CAP/, 'fan-out'],
  [/DISPATCH BUDGET/, 'dispatch'],
  [/EGRESS LOCK/, 'egress-lock'],
  [/Verify gate/, 'gated'],
  [/SCOUT CONTRACT/, 'citation'],
];
const AB_MICRO = [
  { id: 'micro-a', prompt: 'Read src/big.js in full and report its line count.', check: 'true', expect_guard: ['whole-file'] },
  { id: 'micro-b', prompt: 'Dispatch 6 parallel subagents, one per file under src/, to summarize each file in one line.', check: 'true', expect_guard: ['fan-out', 'dispatch'] },
];

const priceOf = (model) => {
  const key = Object.keys(PRICES).find((name) => String(model).startsWith(name));
  return key ? { ...PRICES[key], key } : null;
};

const usd = (u, price) => (price
  ? ((u.input * price.input) + (u.output * price.output) + (u.cache5m * CACHE_WRITE_5M * price.input)
    + (u.cache1h * CACHE_WRITE_1H * price.input) + (u.cacheRead * CACHE_READ * price.input)) / 1e6
  : null);

const zeroUsage = () => ({ input: 0, output: 0, cache5m: 0, cache1h: 0, cacheRead: 0, requests: 0 });

function addUsage(t, u) {
  const creation = Number(u.cache_creation_input_tokens || 0);
  const oneHour = Number(u.cache_creation?.ephemeral_1h_input_tokens || 0);
  t.input += Number(u.input_tokens || 0);
  t.output += Number(u.output_tokens || 0);
  t.cache1h += oneHour;
  t.cache5m += Math.max(0, creation - oneHour);
  t.cacheRead += Number(u.cache_read_input_tokens || 0);
  t.requests += 1;
}

const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n') : '');

function parseStream(stdout) {
  const out = {
    usage: zeroUsage(), guard: {}, spawnRequested: 0, spawnBlocked: 0, toolCalls: 0, subagentMessages: 0,
    cliCostUsd: null, turns: 0, durationMs: 0, result: '', subtype: null, spawned: null,
  };
  const seen = new Set();
  const spawnIds = new Set();
  for (const line of String(stdout).split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'assistant') {
      const key = event.request_id || event.message?.id || event.uuid;
      if (event.parent_tool_use_id) out.subagentMessages += 1;
      if (event.message?.usage && !seen.has(key)) { seen.add(key); addUsage(out.usage, event.message.usage); }
      for (const part of event.message?.content || []) {
        if (part?.type !== 'tool_use') continue;
        out.toolCalls += 1;
        if (SPAWN_TOOLS.includes(part.name)) { out.spawnRequested += 1; spawnIds.add(part.id); }
      }
    } else if (event.type === 'user') {
      for (const part of event.message?.content || []) {
        if (part?.type === 'text' && /Verify gate/.test(part.text || '')) out.guard.gated = (out.guard.gated || 0) + 1;
        if (part?.type !== 'tool_result') continue;
        const text = textOf(part.content);
        if (!/hook error/i.test(text)) continue;
        const rule = (AB_RULES.find(([rx]) => rx.test(text)) || [null, 'other'])[1];
        out.guard[rule] = (out.guard[rule] || 0) + 1;
        if (spawnIds.has(part.tool_use_id)) out.spawnBlocked += 1;
      }
    } else if (event.type === 'system') {
      const text = JSON.stringify(event);
      for (const [rx, rule] of AB_RULES) {
        if (rule === 'gated' && rx.test(text)) out.guard.gated = (out.guard.gated || 0) + 1;
      }
    } else if (event.type === 'result') {
      if (typeof event.total_cost_usd === 'number') out.cliCostUsd = Math.max(out.cliCostUsd || 0, event.total_cost_usd);
      out.turns += Number(event.num_turns || 0);
      out.durationMs += Number(event.duration_ms || 0);
      if (event.result) out.result = String(event.result);
      out.subtype = event.subtype || null;
      if (event.subagent_stats) out.spawned = Number(event.subagent_stats.spawned || 0);
    }
  }
  return out;
}

const STUB_STREAM = [
  JSON.stringify({ type: 'assistant', request_id: 'dry', message: { id: 'dry', role: 'assistant', content: [{ type: 'text', text: 'dry-run' }], usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
  JSON.stringify({ type: 'result', subtype: 'dry-run', total_cost_usd: 0, num_turns: 0, duration_ms: 0, result: 'dry-run' }),
].join('\n');

function ledgerOf(dir) {
  const stateDir = path.join(dir, '.claude');
  const out = {};
  if (!existsSync(stateDir)) return out;
  for (const name of readdirSync(stateDir).filter((f) => /^\.session-.*\.json$/.test(f))) {
    let state;
    try { state = JSON.parse(readFileSync(path.join(stateDir, name), 'utf8')); } catch { continue; }
    for (const bucket of [state.saved, state.lifetime]) {
      for (const [key, value] of Object.entries(bucket || {})) {
        if (typeof value === 'number') out[key] = (out[key] || 0) + value;
      }
    }
  }
  return out;
}

function sh(command, cwd, env = process.env) {
  return spawnSync('sh', ['-c', command], { cwd, env, encoding: 'utf8', timeout: 120000 });
}

function runArm(task, arm, opts) {
  const dir = mkdtempSync(path.join(tmpdir(), `handoff-ab-${task.id}-${arm}-`));
  cpSync(path.join(REPO, 'eval', 'fixture'), dir, { recursive: true });
  for (const cmd of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=ab@fixture', '-c', 'user.name=ab', 'commit', '-q', '-m', 'fixture']]) {
    spawnSync('git', cmd, { cwd: dir, encoding: 'utf8' });
  }
  if (task.setup) sh(task.setup, dir);
  const env = { ...process.env, HANDOFF_OS_DIR: dir, HANDOFF_STATS: '1' };
  for (const key of AB_STRIP) delete env[key];
  env.HANDOFF_OS_DIR = dir;
  const args = ['-p', task.prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', String(opts.maxTurns),
    '--model', opts.model, '--strict-mcp-config', '--setting-sources', 'project', '--allowedTools', AB_TOOLS];
  if (arm === 'A') args.push('--plugin-dir', abPluginDir(opts));
  const started = Date.now();
  let stdout = STUB_STREAM;
  let error = null;
  if (!opts.dryRun) {
    const run = spawnSync(opts.claude, args, { cwd: dir, env, encoding: 'utf8', timeout: opts.timeoutMs, maxBuffer: 256 * 1024 * 1024 });
    stdout = run.stdout || '';
    if (run.error) error = run.error.code === 'ETIMEDOUT' ? 'timeout' : String(run.error.message || run.error);
    else if (run.status !== 0) error = `exit ${run.status}${run.stderr ? `: ${run.stderr.trim().slice(0, 300)}` : ''}`;
  }
  const parsed = parseStream(stdout);
  const resultFile = `${dir}.result.txt`;
  writeFileSync(resultFile, parsed.result, 'utf8');
  const check = sh(task.check, dir, { ...env, AB_RESULT: resultFile });
  const price = priceOf(opts.model);
  const u = parsed.usage;
  const row = {
    task: task.id,
    arm,
    plugin: arm === 'A',
    pass: check.status === 0,
    error,
    turns: parsed.turns,
    requests: u.requests,
    toolCalls: parsed.toolCalls,
    durationMs: opts.dryRun ? 0 : Date.now() - started,
    input: u.input,
    output: u.output,
    cacheWrite5m: u.cache5m,
    cacheWrite1h: u.cache1h,
    cacheRead: u.cacheRead,
    billedRaw: u.input + u.cache5m + u.cache1h + u.cacheRead,
    billedWeighted: Math.round(u.input + (u.cache5m * CACHE_WRITE_5M) + (u.cache1h * CACHE_WRITE_1H) + (u.cacheRead * CACHE_READ)),
    costUsd: usd(u, price),
    cliCostUsd: parsed.cliCostUsd,
    guard: parsed.guard,
    spawnRequested: parsed.spawnRequested,
    spawnBlocked: parsed.spawnBlocked,
    spawned: parsed.spawned,
    subagentMessages: parsed.subagentMessages,
    ledger: arm === 'A' ? ledgerOf(dir) : {},
    result: parsed.result.slice(0, 400),
  };
  if (!opts.keep) {
    rmSync(dir, { recursive: true, force: true });
    rmSync(resultFile, { force: true });
  }
  return row;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function bootstrap(pairs, pick, resamples = 10000, seed = 42) {
  const deltas = pairs.map(([a, b]) => pick(a) - pick(b));
  const base = pairs.map(([, b]) => pick(b));
  if (!deltas.length) return { n: 0, mean: null, ci95: [null, null], pct: null, pctCi95: [null, null] };
  const next = rng(seed);
  const means = [];
  const pcts = [];
  for (let r = 0; r < resamples; r += 1) {
    let sumD = 0;
    let sumB = 0;
    for (let i = 0; i < deltas.length; i += 1) {
      const j = Math.floor(next() * deltas.length);
      sumD += deltas[j];
      sumB += base[j];
    }
    means.push(sumD / deltas.length);
    pcts.push(sumB ? (sumD / sumB) * 100 : 0);
  }
  means.sort((a, b) => a - b);
  pcts.sort((a, b) => a - b);
  const at = (xs, f) => xs[Math.min(xs.length - 1, Math.floor(xs.length * f))];
  const total = base.reduce((a, b) => a + b, 0);
  return {
    n: deltas.length,
    mean: mean(deltas),
    ci95: [at(means, 0.025), at(means, 0.975)],
    pct: total ? (deltas.reduce((a, b) => a + b, 0) / total) * 100 : null,
    pctCi95: [at(pcts, 0.025), at(pcts, 0.975)],
  };
}

const sumGuard = (rows) => rows.reduce((acc, row) => {
  for (const [rule, count] of Object.entries(row.guard || {})) acc[rule] = (acc[rule] || 0) + count;
  return acc;
}, {});

const fmtPct = (x) => (x === null || x === undefined ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);
const fmtUsd = (x) => (x === null || x === undefined ? 'n/a' : `${x < 0 ? '−' : '+'}$${Math.abs(x).toFixed(4)}`);
const fmtCi = (ci, f) => (ci[0] === null ? '' : ` [${f(ci[0])}, ${f(ci[1])}]`);

function abReadmeBlock(r) {
  if (r.dryRun) return [`Not run. Dry-run pipeline check on ${r.generated}, ${r.n} tasks, model \`${r.model}\`. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md), Track B.`];
  const a = r.aggregate;
  const guard = Object.entries(a.guardEventsA).sort((x, y) => y[1] - x[1]);
  return [
    `| Paired runs, ${r.n} tasks × 2 arms, ${r.generated}, model \`${r.model}\` | Value |`,
    '|---|---|',
    `| Δ billed tokens, with − without, cache-read at 0.1× | **${fmtPct(a.billedWeighted.pct)}**${fmtCi(a.billedWeighted.pctCi95, fmtPct)} |`,
    `| Δ billed tokens, raw sum of input + cache write + cache read | ${fmtPct(a.billedRaw.pct)}${fmtCi(a.billedRaw.pctCi95, fmtPct)} |`,
    `| Δ output tokens | ${fmtPct(a.output.pct)}${fmtCi(a.output.pctCi95, fmtPct)} |`,
    `| Δ cost per task, list price | **${fmtUsd(a.costUsd.mean)}**${fmtCi(a.costUsd.ci95, fmtUsd)} |`,
    `| Pass rate, with plugin | ${a.passA}/${r.n} |`,
    `| Pass rate, without plugin | ${a.passB}/${r.n} |`,
    `| Guard events, with plugin | ${guard.length ? guard.map(([rule, count]) => `${rule} ${count}`).join(' · ') : 'none'} |`,
    `| Plugin footprint, always in context | ~${tokc(r.plugin.footprintTokens)} tok |`,
    `| Total spend, both arms | $${a.spendUsd.toFixed(2)} |`,
    '',
    'Same prompt, same model, same fixture, arms in random order per task; 95% CI by bootstrap over paired '
    + 'differences. Negative Δ means the plugin arm billed less. Reproduce with `npm run benchmark:ab`. '
    + 'Per-task rows: `eval/ab-results.json`. Method: [docs/BENCHMARK.md](docs/BENCHMARK.md).',
  ];
}

function abDocBlock(r) {
  const a = r.aggregate;
  const status = r.dryRun ? `Not run: dry-run on ${r.generated}` : `Run on ${r.generated} · model \`${r.model}\` · N = ${r.n}${r.stopped ? ` · stopped: ${r.stopped}` : ''}`;
  const lines = [
    `| Status | ${status} |`, '|---|---|',
    `| Plugin | ${r.plugin.version}, footprint ~${tokc(r.plugin.footprintTokens)} tok |`,
    `| Prices | ${r.prices.source.replace(/https?:\/\/[^\s,]+/, (url) => `<${url}>`)} |`,
    '',
  ];
  if (!r.dryRun) {
    lines.push(
      '| Aggregate | Mean Δ (with − without) | 95% CI | Δ % |', '|---|---|---|---|',
      `| Billed tokens, cache-read at 0.1× | ${Math.round(a.billedWeighted.mean)} | ${a.billedWeighted.ci95.map(Math.round).join(' … ')} | ${fmtPct(a.billedWeighted.pct)}${fmtCi(a.billedWeighted.pctCi95, fmtPct)} |`,
      `| Billed tokens, raw | ${Math.round(a.billedRaw.mean)} | ${a.billedRaw.ci95.map(Math.round).join(' … ')} | ${fmtPct(a.billedRaw.pct)}${fmtCi(a.billedRaw.pctCi95, fmtPct)} |`,
      `| Output tokens | ${Math.round(a.output.mean)} | ${a.output.ci95.map(Math.round).join(' … ')} | ${fmtPct(a.output.pct)}${fmtCi(a.output.pctCi95, fmtPct)} |`,
      `| Cost, USD | ${fmtUsd(a.costUsd.mean)} | ${a.costUsd.ci95.map((x) => fmtUsd(x)).join(' … ')} | ${fmtPct(a.costUsd.pct)}${fmtCi(a.costUsd.pctCi95, fmtPct)} |`,
      `| Pass rate | with ${a.passA}/${r.n} · without ${a.passB}/${r.n} | — | — |`,
      '',
      '| Task | Arm | Pass | Billed (0.1× read) | Raw | Output | Cost | Guard events | Ledger |', '|---|---|---|---|---|---|---|---|---|',
      ...r.tasks.flatMap((t) => [t.A, t.B].map((row) => `| \`${row.task}\` | ${row.plugin ? 'with' : 'without'} | ${row.pass ? 'yes' : 'no'}${row.error ? ` (${row.error.split(':')[0]})` : ''} | ${num(row.billedWeighted)} | ${num(row.billedRaw)} | ${num(row.output)} | ${row.costUsd === null ? 'n/a' : `$${row.costUsd.toFixed(4)}`} | ${Object.entries(row.guard).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${Object.entries(row.ledger).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} |`)),
      '',
    );
    if (r.micro) {
      lines.push('| Micro | Arm | Billed (0.1× read) | Raw | Cost | Subagents requested / blocked / spawned | Guard events |', '|---|---|---|---|---|---|---|');
      for (const m of Object.values(r.micro)) {
        for (const row of [m.A, m.B]) {
          lines.push(`| \`${row.task}\` | ${row.plugin ? 'with' : 'without'} | ${num(row.billedWeighted)} | ${num(row.billedRaw)} | ${row.costUsd === null ? 'n/a' : `$${row.costUsd.toFixed(4)}`} | ${row.spawnRequested} / ${row.spawnBlocked} / ${row.spawned ?? 'n/a'} | ${Object.entries(row.guard).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} |`);
        }
      }
      lines.push('');
    }
  }
  lines.push('```bash', `npm run benchmark:ab -- --model ${r.model}`, '```');
  return lines;
}

const abPluginDir = (opts) => path.resolve(opts.pluginDir || path.join(REPO, 'plugins', 'handoff-os'));

function writeAbBlocks(result) {
  console.log(`  ${writeBlock(path.join(REPO, 'README.md'), AB_OPEN, AB_CLOSE, abReadmeBlock(result))}`);
  console.log(`  ${writeBlock(path.join(REPO, 'docs', 'BENCHMARK.md'), AB_DOC_OPEN, AB_DOC_CLOSE, abDocBlock(result))}`);
}

function ab(opts) {
  if (opts.render) {
    writeAbBlocks(JSON.parse(readFileSync(path.resolve(REPO, opts.out), 'utf8')));
    return 0;
  }
  const tasksFile = path.resolve(REPO, opts.tasks);
  let tasks = readFileSync(tasksFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (opts.task) tasks = tasks.filter((t) => t.id === opts.task);
  tasks = tasks.slice(0, opts.n);
  const price = priceOf(opts.model);
  if (!price && !opts.dryRun) console.log(`  no PRICES entry for ${opts.model}; costUsd stays null, cliCostUsd still recorded`);
  const order = rng(opts.seed);
  const rows = [];
  let spend = 0;
  let stopped = null;
  const runPair = (task) => {
    const arms = order() < 0.5 ? ['A', 'B'] : ['B', 'A'];
    const pair = {};
    for (const arm of arms) {
      const row = runArm(task, arm, opts);
      row.order = arms.indexOf(arm) + 1;
      pair[arm] = row;
      spend += row.cliCostUsd ?? row.costUsd ?? 0;
      console.log(`  ${task.id.padEnd(16)} ${arm === 'A' ? 'with   ' : 'without'} ${row.pass ? 'pass' : 'FAIL'}  billed ${num(row.billedWeighted).padStart(8)}  out ${num(row.output).padStart(6)}  ${row.costUsd === null ? '' : `$${row.costUsd.toFixed(4)}`}  ${Object.entries(row.guard).map(([k, v]) => `${k}:${v}`).join(' ')}${row.error ? `  ${row.error}` : ''}`);
      if (spend > opts.budgetUsd) { stopped = `budget: $${spend.toFixed(2)} > $${opts.budgetUsd}`; break; }
    }
    return pair;
  };
  console.log(`\nhandoff-os — Track B, ${tasks.length} task(s) × 2 arms, model ${opts.model}${opts.dryRun ? ', DRY RUN' : ''}\n`);
  for (const task of tasks) {
    const pair = runPair(task);
    if (pair.A && pair.B) rows.push({ id: task.id, expect: task.expect_guard || [], A: pair.A, B: pair.B });
    if (stopped) break;
  }
  const micro = {};
  if (opts.micro && !stopped && !opts.task) {
    for (const m of AB_MICRO) {
      const pair = runPair(m);
      if (pair.A && pair.B) micro[m.id] = { prompt: m.prompt, A: pair.A, B: pair.B };
      if (stopped) break;
    }
  }
  const pairs = rows.map((r) => [r.A, r.B]);
  const pick = (key) => (row) => Number(row[key] ?? 0);
  const pluginDir = abPluginDir(opts);
  const pluginRoot = path.basename(path.dirname(pluginDir)) === 'plugins' ? path.dirname(path.dirname(pluginDir)) : REPO;
  const inv = inventory(pluginRoot);
  const result = {
    generated: new Date().toISOString().slice(0, 10),
    model: opts.model,
    n: rows.length,
    dryRun: opts.dryRun,
    maxTurns: opts.maxTurns,
    stopped,
    plugin: { dir: pluginDir, version: JSON.parse(readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')).version, footprintTokens: taxOf(inv).total },
    prices: { source: 'https://platform.claude.com/docs/en/about-claude/pricing, read 2026-09-10', model: price ? price.key : null, perMillion: price ? { input: price.input, output: price.output, cacheWrite5m: price.input * CACHE_WRITE_5M, cacheWrite1h: price.input * CACHE_WRITE_1H, cacheRead: price.input * CACHE_READ } : null },
    aggregate: {
      billedWeighted: bootstrap(pairs, pick('billedWeighted')),
      billedRaw: bootstrap(pairs, pick('billedRaw')),
      output: bootstrap(pairs, pick('output')),
      costUsd: bootstrap(pairs, pick('costUsd')),
      cliCostUsd: bootstrap(pairs, pick('cliCostUsd')),
      passA: rows.filter((r) => r.A.pass).length,
      passB: rows.filter((r) => r.B.pass).length,
      guardEventsA: sumGuard(rows.map((r) => r.A)),
      guardEventsB: sumGuard(rows.map((r) => r.B)),
      expectedHit: rows.filter((r) => r.expect.length && r.expect.some((rule) => r.A.guard[rule])).length,
      expectedTotal: rows.filter((r) => r.expect.length).length,
      neutralClean: rows.filter((r) => !r.expect.length && !Object.keys(r.A.guard).length).length,
      neutralTotal: rows.filter((r) => !r.expect.length).length,
      spendUsd: spend,
    },
    tasks: rows,
    micro: Object.keys(micro).length ? micro : null,
  };
  const outFile = path.resolve(REPO, opts.out);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`\n  wrote ${path.relative(REPO, outFile)}`);
  const a = result.aggregate;
  if (rows.length) {
    console.log(`  Δ billed (0.1× read) ${fmtPct(a.billedWeighted.pct)}${fmtCi(a.billedWeighted.pctCi95, fmtPct)} · Δ cost ${fmtUsd(a.costUsd.mean)}${fmtCi(a.costUsd.ci95, fmtUsd)} · pass with ${a.passA}/${rows.length}, without ${a.passB}/${rows.length}`);
    console.log(`  expected guard class hit on ${a.expectedHit}/${a.expectedTotal} provoking tasks · neutral tasks untouched ${a.neutralClean}/${a.neutralTotal} · spend $${spend.toFixed(2)}${stopped ? ` · ${stopped}` : ''}`);
  }
  if (!path.relative(REPO, outFile).startsWith('..')) writeAbBlocks(result);
  return stopped ? 1 : 0;
}

if (flags.ab) process.exit(ab(AB));

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

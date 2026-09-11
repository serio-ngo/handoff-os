#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { append } from './audit.mjs';
import { COUNTERS, bank, bump, lifetimeLine, load, rootOf, save, savings, sessionLine, sessionOf } from './ledger.mjs';

const DONE_CLAIM = /(?:^|\n)[ \t>*`-]*(?:done|shipped|all set|fixed)\b|\b(?:is|are|now|all|task|work|change)s? (?:done|completed|finished|fixed|ready|shipped)\b/i;
const HANDOFF_CARD = /^[ \t>*`-]*DONE\b.*\r?\n[ \t>*`-]*FILE\b.*\r?\n[ \t>*`-]*YOU\b.*$/gm;
const SELF = fileURLToPath(new URL('./verify.mjs', import.meta.url));
const MARKER_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BLOCKS = 2;
const CITED = /[\w.-]+:\d+|https?:\/\/|\bUNVERIFIED\b/i;
const MIN_CLAIM_CHARS = 200;

const FALLBACK_STEPS = ['content:check', 'typecheck', 'build'];
const resolveSteps = (scripts) => (scripts?.verify ? ['verify'] : FALLBACK_STEPS.filter((step) => scripts?.[step]));
const stepsToCommand = (steps) => steps.map((step) => `npm run ${step}`).join(' && ');

const scriptsAt = (root) => {
  try { return JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).scripts || {}; } catch { return null; }
};

function lastAssistantText(file) {
  if (!file || !existsSync(file)) return '';
  let lines;
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch { return ''; }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    const message = entry.message || entry;
    if ((entry.type || message.role) !== 'assistant' && message.role !== 'assistant') continue;
    const { content } = message;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n');
      if (text.trim()) return text;
    }
  }
  return '';
}

export function usage(file) {
  const empty = { fresh: 0, cacheRead: 0, turns: 0 };
  if (!file || !existsSync(file)) return empty;
  let lines;
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { return empty; }
  const out = { ...empty };
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const u = entry.message?.usage;
    if (!u) continue;
    out.turns += 1;
    out.fresh += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
    out.cacheRead += u.cache_read_input_tokens || 0;
  }
  return out;
}

function uncited(message) {
  const text = String(message || '').trim();
  return text.length >= MIN_CLAIM_CHARS && !CITED.test(text);
}

function citationGate(payload, message) {
  if (!uncited(message)) process.exit(0);
  bump(payload, 'gated');
  process.stderr.write('SCOUT CONTRACT: no file:line, URL or UNVERIFIED tag. Cite each fact, or mark it UNVERIFIED.\n');
  process.exit(2);
}

export function report(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const total = savings(state);
  if (total) {
    append(root, {
      actor: 'main',
      tier: 'GREEN',
      action: 'read-budget',
      target: JSON.stringify(total),
      result: JSON.stringify(usage(payload.transcript_path)),
    });
    bank(state);
    for (const key of COUNTERS) state.saved[key] = 0;
  }
  const stamp = JSON.stringify([state.session || {}, state.tiers || {}]);
  const changed = stamp !== state.printed;
  if (changed) state.printed = stamp;
  if (total || changed) save(root, session, state);
  if (!changed || process.env.HANDOFF_STATS === '0') return null;
  return sessionLine(state) || null;
}

function announce(stats, extra) {
  const text = [extra, stats].filter(Boolean).join('\n');
  if (text) {
    process.stdout.write(JSON.stringify({
      systemMessage: text,
      hookSpecificOutput: { hookEventName: 'Stop' },
    }));
  }
  process.exit(0);
}

function provedAt(marker) {
  if (!existsSync(marker)) return 0;
  try {
    const text = readFileSync(marker, 'utf8');
    return Date.parse(text.slice(0, text.indexOf(' '))) || statSync(marker).mtimeMs;
  } catch { return Date.now(); }
}

function gate() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

  const message = String(payload.last_assistant_message || '') || lastAssistantText(payload.transcript_path);
  if (payload.hook_event_name === 'SubagentStop') citationGate(payload, message);

  const stats = report(payload);
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const scripts = scriptsAt(root);
  if (!scripts) announce(stats);

  if (!DONE_CLAIM.test(message.replace(HANDOFF_CARD, ''))) announce(stats);

  const command = stepsToCommand(resolveSteps(scripts));
  if (!command) announce(stats);

  const session = sessionOf(payload);
  const state = rootOf(payload);
  const marker = `${state}/.claude/.verified-${session}`;
  const counter = `${state}/.claude/.verify-gate-count-${session}`;

  const written = Number(load(state, session).written || 0);
  if (!written) announce(stats);
  const proved = provedAt(marker);
  if (proved && Date.now() - proved < MARKER_MAX_AGE_MS && proved >= written) announce(stats);

  let blocks = 0;
  try { blocks = parseInt(readFileSync(counter, 'utf8').trim(), 10) || 0; } catch { blocks = 0; }

  if (blocks >= MAX_BLOCKS) {
    announce(stats, `Verify gate stood down. "${command}" is unproven — check it yourself.`);
  }

  try {
    mkdirSync(`${state}/.claude`, { recursive: true });
    writeFileSync(counter, String(blocks + 1), 'utf8');
  } catch { }

  const shown = process.env.HANDOFF_STATS === '0' ? '' : lifetimeLine(bump(payload, 'gated'));
  process.stderr.write(`${shown ? `${shown}\n` : ''}Verify gate: done claimed, nothing run. Run this, then say done again:\n  node "${SELF}" ${session} "${root}"\nIt runs ${command}. Writing the marker by hand is forbidden.\n`);
  process.exit(2);
}

function runner(session, root) {
  const scripts = scriptsAt(root);
  if (!scripts) {
    console.error(`verify: no readable package.json at ${root}`);
    process.exit(1);
  }
  const steps = resolveSteps(scripts);
  if (!steps.length) {
    console.error(`verify: package.json defines none of verify, ${FALLBACK_STEPS.join(', ')}`);
    process.exit(1);
  }
  for (const step of steps) {
    console.log(`verify: npm run ${step}`);
    const result = spawnSync('npm', ['run', step], { cwd: root, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      console.error(`verify: FAILED at "npm run ${step}" (exit ${result.status}). No marker written.`);
      process.exit(result.status || 1);
    }
  }
  const state = process.env.HANDOFF_OS_DIR || root;
  mkdirSync(`${state}/.claude`, { recursive: true });
  writeFileSync(`${state}/.claude/.verified-${session}`, `${new Date().toISOString()} ${steps.join(' && ')}\n`, 'utf8');
  rmSync(`${state}/.claude/.verify-gate-count-${session}`, { force: true });
  console.log(`verify: PASSED ${stepsToCommand(steps)} — marker written.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = String(process.argv[2] ?? '');
  const session = sessionOf({ session_id: arg });
  if (process.argv[2] === undefined) gate();
  else if (!arg.trim() || !session) {
    console.error('verify: pass the session id the gate printed.');
    process.exit(1);
  } else runner(session, (process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/'));
}

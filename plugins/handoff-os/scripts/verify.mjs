#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { append } from './audit.mjs';
import { COUNTERS, bank, kept, keptPct, lifetimeLine, load, rootOf, save, savings, sessionOf, tok, volume } from './ledger.mjs';

const DONE_CLAIM = /\b(?:done|complete|completed|finished|works now|fixed|ready|shipped)\b/i;
const HANDOFF_CARD = /^[ \t>*`-]*DONE\b.*\r?\n[ \t>*`-]*FILE\b.*\r?\n[ \t>*`-]*YOU\b.*$/gm;
const MARKER_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BLOCKS = 2;
const CITED = /[\w.-]+:\d+|https?:\/\/|\bUNVERIFIED\b/i;
const MIN_CLAIM_CHARS = 200;

export const FALLBACK_STEPS = ['content:check', 'typecheck', 'build'];
export const resolveSteps = (scripts) => (scripts?.verify ? ['verify'] : FALLBACK_STEPS.filter((step) => scripts?.[step]));
export const stepsToCommand = (steps) => steps.map((step) => `npm run ${step}`).join(' && ');

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

function citationGate(message) {
  if (!uncited(message)) process.exit(0);
  process.stderr.write('SCOUT CONTRACT: this return carries no file:line, no URL and no UNVERIFIED tag, so nothing in it can be checked. Re-answer with a citation per fact, or mark the unconfirmed ones UNVERIFIED.\n');
  process.exit(2);
}

export function report(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const total = savings(state);
  const line = lifetimeLine(state) || null;
  if (total) {
    const real = usage(payload.transcript_path);
    append(root, {
      actor: 'main',
      tier: 'GREEN',
      action: 'read-budget',
      target: `${total.agents} agents, ${total.blocked} blocked, ${total.rereads} re-reads, `
        + `${total.slices} slices, ${total.queries} queries, ${total.caps} caps, `
        + `${total.scouts} scout, ${total.runners} runner`,
      result: `kept ${tok(kept(total))} tok of ${tok(volume(total))} (${keptPct(total)}%), `
        + `dedup ${tok(total.bytes)} tok, defer ${tok(total.deferred)} tok, offload ${tok(total.offload)} tok, `
        + `admitted ${tok(total.read)} tok, fresh ${real.fresh} tok, cache-read ${real.cacheRead} tok, `
        + `turn ${real.turns}`,
    });
    bank(state);
    for (const key of COUNTERS) state.saved[key] = 0;
    save(root, session, state);
  }
  if (!line || process.env.HANDOFF_STATS === '0') return null;
  return line;
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

function gate() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

  const message = String(payload.last_assistant_message || '') || lastAssistantText(payload.transcript_path);
  if (payload.hook_event_name === 'SubagentStop') citationGate(message);

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

  if (existsSync(marker)) {
    try {
      if (Date.now() - statSync(marker).mtimeMs < MARKER_MAX_AGE_MS) announce(stats);
    } catch { announce(stats); }
  }

  let blocks = 0;
  try { blocks = parseInt(readFileSync(counter, 'utf8').trim(), 10) || 0; } catch { blocks = 0; }

  if (blocks >= MAX_BLOCKS) {
    announce(stats, `Verify gate stood down after ${MAX_BLOCKS} blocks. "${command}" is unproven — the human must check it.`);
  }

  try {
    mkdirSync(`${state}/.claude`, { recursive: true });
    writeFileSync(counter, String(blocks + 1), 'utf8');
  } catch { }

  process.stderr.write(`${stats ? `${stats}\n` : ''}Verify gate: you claimed done with no evidence. Run this, then say done again:\n  node "\${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" ${session}\nIt runs ${command} and writes the marker only on exit 0. Writing the marker by hand is forbidden.\n`);
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
  console.log(`verify: PASSED ${stepsToCommand(steps)} — marker written.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const session = String(process.argv[2] || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (process.argv[2] === undefined) gate();
  else if (!session) {
    console.error('verify: pass the session id the gate printed.');
    process.exit(1);
  } else runner(session, (process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/'));
}

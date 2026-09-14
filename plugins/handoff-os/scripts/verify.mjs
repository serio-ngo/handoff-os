#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { append } from './audit.mjs';
import { statsOn } from './lib/limits.mjs';
import { COUNTERS, bank, bump, load, rootOf, save, savings, sessionOf } from './lib/ledger.mjs';
import { lifetimeLine, sessionLine } from './lib/stats.mjs';
import { lastAssistantText, usage } from './lib/transcript.mjs';
import { blocksSoFar, provedAt, recordBlock, resolveSteps, runProof, scriptsAt, stepsToCommand } from './lib/proof.mjs';

const DONE_CLAIM = /(?:^|\n)[ \t>*`-]*(?:done|shipped|all set|fixed)\b|\b(?:is|are|now|all|task|work|change)s? (?:done|completed|finished|fixed|ready|shipped)\b/i;
const HANDOFF_CARD = /^[ \t>*`-]*DONE\b.*\r?\n[ \t>*`-]*FILE\b.*\r?\n[ \t>*`-]*YOU\b.*$/gm;
const CITED = /[\w-]+\.[A-Za-z]\w*:\d+|https?:\/\/|\bUNVERIFIED\b/i;
const MIN_CLAIM_CHARS = 200;
const MARKER_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BLOCKS = 2;
const SELF = fileURLToPath(new URL('./verify.mjs', import.meta.url));

// A short answer needs no citation; a substantive one does.
const uncited = (message) => {
  const text = String(message || '').trim();
  return text.length >= MIN_CLAIM_CHARS && !CITED.test(text);
};

function citationGate(payload, message) {
  if (!uncited(message)) process.exit(0);
  bump(payload, 'gated');
  process.stdout.write(JSON.stringify({
    systemMessage: 'SCOUT CONTRACT: no file:line, URL or UNVERIFIED tag. Cite each fact, or mark it UNVERIFIED.',
    hookSpecificOutput: { hookEventName: 'SubagentStop' },
  }));
  process.exit(0);
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
  if (!changed || !statsOn()) return null;
  return sessionLine(state, root, session) || null;
}

function announce(stats, extra) {
  const text = [extra, stats].filter(Boolean).join('\n');
  if (text) {
    process.stdout.write(JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: 'Stop' } }));
  }
  process.exit(0);
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
  const stateRoot = rootOf(payload);
  const written = Number(load(stateRoot, session).written || 0);
  if (!written) announce(stats);

  const proved = provedAt(stateRoot, session);
  if (proved && Date.now() - proved < MARKER_MAX_AGE_MS && proved >= written) announce(stats);

  const blocks = blocksSoFar(stateRoot, session);
  if (blocks >= MAX_BLOCKS) announce(stats, `Verify gate stood down. "${command}" is unproven.`);
  recordBlock(stateRoot, session, blocks);

  const shown = statsOn() ? lifetimeLine(bump(payload, 'gated'), stateRoot, session) : '';
  announce(stats, `${shown ? `${shown}\n` : ''}Verify gate: done claimed, nothing run.\n  node "${SELF}" ${session}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = String(process.argv[2] ?? '');
  const session = sessionOf({ session_id: arg });
  if (process.argv[2] === undefined) gate();
  else if (!arg.trim() || !session) {
    console.error('verify: pass the session id the gate printed.');
    process.exit(1);
  } else {
    const root = (process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/');
    process.exit(runProof(session, root, process.env.HANDOFF_OS_DIR || root));
  }
}

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { append } from './audit.mjs';
import { COUNTERS, bank, load, rootOf, save, savings, sessionOf } from './lib/ledger.mjs';
import { sessionLine } from './lib/stats.mjs';
import { usage } from './lib/transcript.mjs';

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
  if (!changed) return null;
  return sessionLine(state) || null;
}

// One line at Stop, never a stack.
function announce(stats) {
  if (stats) {
    process.stdout.write(JSON.stringify({ systemMessage: stats, hookSpecificOutput: { hookEventName: 'Stop' } }));
  }
  process.exit(0);
}

function gate() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  announce(report(payload));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) gate();

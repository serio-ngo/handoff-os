#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COUNTERS, bank, load, rootOf, save, savings, sessionLine, sessionOf } from './lib/ledger.mjs';

export function report(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const total = savings(state);
  if (total) {
    bank(state);
    for (const key of COUNTERS) state.saved[key] = 0;
  }
  const stamp = JSON.stringify([state.session || {}, state.tiers || {}]);
  const changed = stamp !== state.printed;
  if (changed) state.printed = stamp;
  if (total || changed) save(root, session, state);
  if (!changed || process.env.HANDOFF_STATS === '0') return null;
  return sessionLine(state, root, session) || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }
  const line = report(payload);
  if (line) process.stdout.write(JSON.stringify({ systemMessage: line }));
  process.exit(0);
}

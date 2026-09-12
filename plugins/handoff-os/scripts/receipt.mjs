#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COUNTERS, load, rootOf, save, sessionOf } from './lib/ledger.mjs';

const label = (key, n) => ({ blocked: 'blocked', trimmed: 'trimmed', rereads: `re-read${n === 1 ? '' : 's'} refused`, held: 'held' })[key];

export function receipt(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const stamp = JSON.stringify(state.saved);
  if (stamp === state.printed) return null;
  state.printed = stamp;
  save(root, session, state);
  const parts = COUNTERS.filter((key) => state.saved[key]).map((key) => `${state.saved[key]} ${label(key, state.saved[key])}`);
  return parts.length ? `handoff-os · ${parts.join(' · ')}` : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }
  const line = process.env.HANDOFF_STATS === '0' ? null : receipt(payload);
  if (line) process.stdout.write(JSON.stringify({ systemMessage: line }));
  process.exit(0);
}

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load, rootOf, save, sessionOf, sweep } from './lib/ledger.mjs';
import { BIG_FILE_BYTES, MAX_PER_WAVE } from './lib/limits.mjs';

const FREEING = new Set(['compact', 'clear']);
function forgetReads(payload) {
  if (!FREEING.has(String(payload.source || ''))) return false;
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  if (!Object.keys(state.reads).length) return false;
  state.reads = {};
  save(root, session, state);
  return true;
}

export function card() {
  return `Serio Focus — session card
CAPS  ${MAX_PER_WAVE} subagents per wave · files over ${BIG_FILE_BYTES / 1024}KB arrive trimmed · git commit and push stay manual
SHAPE the focus output style shapes every reply`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  forgetReads(payload);
  sweep(rootOf(payload));
  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, rootOf, save, sessionOf, sweep } from './lib/ledger.mjs';

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

function memory() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.HANDOFF_OS_DIR && path.join(process.env.HANDOFF_OS_DIR, 'config', 'memory.md'),
    path.join(here, '..', 'memory.md'),
    path.join(here, '..', '..', '..', 'config', 'memory.md'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (existsSync(file)) return readFileSync(file, 'utf8');
    } catch { }
  }
  return '';
}

export function card(text = memory()) {
  const lines = text.trim() === '' ? 0 : text.trim().split('\n').length;
  const status = lines
    ? `set (${lines} lines) — read memory.md when owner context is needed`
    : 'empty — ask the owner for every org fact';
  return `Serio Focus — session card
CAPS  3 subagents per wave · files over 24KB arrive trimmed · git commit and push stay manual
SHAPE the focus output style shapes every reply
MEMORY ${status}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  forgetReads(payload);
  sweep(rootOf(payload));
  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

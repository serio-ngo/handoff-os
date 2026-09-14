#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold, load, rootOf, save, sessionOf, sweep } from './lib/ledger.mjs';
import { delegateOn, guideOn } from './lib/limits.mjs';
import { provedAt } from './lib/proof.mjs';

const FREEING = new Set(['compact', 'clear']);
const RESUMED = new Set(['resume', 'compact']);
const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));
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

function resumeLine(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const s = fold(state.session, state.saved);
  const wrote = Number(state.written || 0) > provedAt(root, session) ? 'yes' : 'no';
  return `RESUME ${s.rewrites} trims · ${s.blocked} blocks · wrote since last proof: ${wrote}`;
}

export function card(text = memory(), payload = {}) {
  const lines = text.trim() === '' ? 0 : text.trim().split('\n').length;
  const status = lines
    ? `set (${lines} lines) — read memory.md when owner context is needed`
    : 'empty — ask the owner for every org fact';
  const middle = guideOn() && RESUMED.has(String(payload.source || ''))
    ? `${resumeLine(payload)}\n`
    : delegateOn() ? 'DELEGATE lookups to handoff-os:scout · commands to handoff-os:runner — they return tables, you decide\n' : '';
  return `Handoff OS — session card
TIERS  GREEN act · YELLOW act, audit one line · RED STOP, hand off
HANDOFF three lines: DONE <prepared> · FILE <path> · YOU <verb> -> <where> -> <when>
BLOCKED names the way through in the same reply · never act around one unasked
${middle}NEVER  send · pay · submit · publish · state-changing git · credentials · org data in git
MEMORY ${status}
PROOF  a "done" claim needs a real run: node "${VERIFY}" <session_id>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  forgetReads(payload);
  sweep(rootOf(payload));
  process.stdout.write(`${card(memory(), payload)}\n`);
  process.exit(0);
}

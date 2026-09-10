#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, rootOf, save, sessionOf } from './ledger.mjs';

const FREEING = new Set(['compact', 'clear']);
const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));

function releaseCeiling(payload) {
  if (!FREEING.has(String(payload.source || ''))) return false;
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  if (!state.read_bytes) return false;
  state.read_bytes = 0;
  state.whole_files = 0;
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
  return `Handoff OS — session card
TIERS  GREEN inward, reversible → act · YELLOW outside the repo → act, audit one line
       RED sends, pays, submits, publishes or is irreversible → STOP, hand off
HANDOFF three lines, nothing else: DONE <prepared> · FILE <path> · YOU <verb> -> <where> -> <when>
NEVER  send · pay · submit · publish · git merge / delete${process.env.HANDOFF_LOCK_GIT === '1' ? ' · every state-changing git (locked)' : ''} · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git
MEMORY ${status}
PROOF  a "done" claim needs a real run: node "${VERIFY}" <session_id>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  releaseCeiling(payload);
  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

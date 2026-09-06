#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, rootOf, save, sessionOf } from './ledger.mjs';

export const FREEING = new Set(['compact', 'clear']);

export function releaseCeiling(payload) {
  if (!FREEING.has(String(payload.source || ''))) return false;
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  if (!state.read_bytes) return false;
  state.read_bytes = 0;
  state.reads = {};
  save(root, session, state);
  return true;
}

export const seenPath = (session) => path.join(os.tmpdir(), `handoff-os-${String(session || 'unknown').replace(/[^A-Za-z0-9_-]/g, '')}.seen`);

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
PLANES one home per fact · crossing a plane is a sync, never a copy
  TRUTH=memory.md (gitignored, agent-kept) | STATE=ask the owner | BUILD=git | BRAND=ask the owner | HUMAN=the owner
TIERS
  GREEN  reversible, inward → act silently
  YELLOW writes outside the repo, reversible → do it, append one audit line
  RED    sends, pays, submits, publishes, or is irreversible → STOP, emit the handoff card
HANDOFF the RED stop is exactly three lines, nothing before and nothing after
       DONE <what is prepared> · FILE <path or link> · YOU <verb> -> <where> -> <by when>
NEVER  send · pay · submit · publish · git merge / delete${process.env.HANDOFF_LOCK_GIT === '1' ? ' · every state-changing git (locked)' : ''} · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git
MEMORY ${status}
       durable owner facts live there — read it, and update it when the owner states one
CHEAP  lookups go to the scout agent (haiku); you keep the deciding here
STYLE  tables and short imperative lines · partial completion is valid, silent failure is not
PROOF  a "done" claim needs a real run: node plugins/handoff-os/scripts/verify.mjs <session_id>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  const session = String(payload.session_id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const backup = payload.hook_event_name === 'UserPromptSubmit';

  if (!backup) releaseCeiling(payload);

  if (backup && (!session || existsSync(seenPath(session)))) process.exit(0);
  if (session) { try { writeFileSync(seenPath(session), 'card', 'utf8'); } catch { } }

  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

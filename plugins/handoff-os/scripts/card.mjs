#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, rootOf, save, sessionOf } from './ledger.mjs';

const FREEING = new Set(['compact', 'clear']);
const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE = [[/^\.wave-/, DAY_MS], [/^\.verif(?:ied|y-gate-count)-/, DAY_MS], [/^\.session-/, 30 * DAY_MS]];

function sweep(root) {
  const dir = path.join(root, '.claude');
  let names = [];
  try { names = readdirSync(dir); } catch { return 0; }
  let swept = 0;
  for (const name of names) {
    const age = (STALE.find(([rx]) => rx.test(name)) || [])[1];
    if (age === undefined) continue;
    try {
      if (Date.now() - statSync(path.join(dir, name)).mtimeMs < age) continue;
      rmSync(path.join(dir, name), { recursive: true, force: true });
      swept += 1;
    } catch { }
  }
  return swept;
}

function releaseCeiling(payload) {
  if (!FREEING.has(String(payload.source || ''))) return false;
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  if (!state.read_bytes && !state.whole_files && !Object.keys(state.reads).length) return false;
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

export const frontmatter = (text, key) => {
  const hit = new RegExp(`^${key}:\\s*([\\s\\S]*?)(?=^[a-z_]+:|^---)`, 'm').exec(text);
  return (hit ? hit[1] : '').trim().replace(/^["']|["']$/g, '');
};

function descriptionChars(dir, pick) {
  try {
    return readdirSync(dir).flatMap(pick).reduce((sum, file) => sum + frontmatter(readFileSync(file, 'utf8'), 'description').length, 0);
  } catch { return 0; }
}

export function footprint(text = memory(), locked = process.env.HANDOFF_LOCK_GIT === '1') {
  const plugin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cardChars = card(text, locked).length;
  const skillChars = descriptionChars(path.join(plugin, 'skills'), (name) => [path.join(plugin, 'skills', name, 'SKILL.md')]);
  const agentChars = descriptionChars(path.join(plugin, 'agents'), (name) => (name.endsWith('.md') ? [path.join(plugin, 'agents', name)] : []));
  return { cardChars, skillChars, agentChars, contextChars: cardChars + skillChars + agentChars };
}

export function card(text = memory(), locked = process.env.HANDOFF_LOCK_GIT === '1') {
  const lines = text.trim() === '' ? 0 : text.trim().split('\n').length;
  const status = lines
    ? `set (${lines} lines) — read memory.md when owner context is needed`
    : 'empty — ask the owner for every org fact';
  return `Handoff OS — session card
TIERS  GREEN inward, reversible → act · YELLOW outside the repo → act, audit one line
       RED sends, pays, submits, publishes or is irreversible → STOP, hand off
HANDOFF three lines, nothing else: DONE <prepared> · FILE <path> · YOU <verb> -> <where> -> <when>
NEVER  send · pay · submit · publish · git merge / delete${locked ? ' · every state-changing git (locked)' : ''} · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git
MEMORY ${status}
PROOF  a "done" claim needs a real run: node "${VERIFY}" <session_id>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  releaseCeiling(payload);
  sweep(rootOf(payload));
  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

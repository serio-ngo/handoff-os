#!/usr/bin/env node
import { readFileSync } from 'node:fs';
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

export function card() {
  return `Handoff OS — session card
TIERS  GREEN inward, reversible → act · YELLOW outside the repo → act, audit one line
       RED sends, pays, submits, publishes or is irreversible → STOP, hand off
HANDOFF three lines, nothing else: DONE <prepared> · FILE <path> · YOU <verb> -> <where> -> <when>
NEVER  send · pay · submit · publish · every state-changing git · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  forgetReads(payload);
  sweep(rootOf(payload));
  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

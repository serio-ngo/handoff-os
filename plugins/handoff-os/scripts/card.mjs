#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const seenPath = (session) => path.join(os.tmpdir(), `handoff-os-${String(session || 'unknown').replace(/[^A-Za-z0-9_-]/g, '')}.seen`);

const GENERIC = { name: '', addressAs: '', sources: [], tracker: '', docStore: '', brandTools: '' };

function org() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.HANDOFF_OS_DIR && path.join(process.env.HANDOFF_OS_DIR, 'config', 'org.json'),
    path.join(here, '..', 'org.json'),
    path.join(here, '..', '..', '..', 'config', 'org.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (existsSync(file)) return { ...GENERIC, ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch { }
  }
  return GENERIC;
}

export function card(values = org()) {
  const sources = Array.isArray(values.sources) ? values.sources.filter(Boolean) : [];
  const truth = [values.docStore, ...sources].filter(Boolean).slice(0, 2).join(' + ') || 'ask the owner';
  const canon = sources.length
    ? `read live, this turn: ${sources.slice(0, 2).join(' · ')}${sources.length > 2 ? ` +${sources.length - 2} more` : ''}`
    : 'no sources configured — ask the owner for every org fact';
  return `Handoff OS — session card (fallback procedure: docs/ORCHESTRATOR.md, only when this card cannot answer)
PLANES one home per fact · crossing a plane is a sync, never a copy
  TRUTH=${truth} | STATE=${values.tracker || 'ask the owner'} | BUILD=git | BRAND=${values.brandTools || 'ask the owner'} | HUMAN=the owner
TIERS
  GREEN  reversible, inward → act silently
  YELLOW writes outside the repo, reversible → do it, append one audit line
  RED    sends, pays, submits, publishes, or is irreversible → STOP, emit /handoff-os:handoff-card
NEVER  send · pay · submit · publish · state-changing git · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git
CANON  ${canon}
       money or people (bank, beneficiaries, contracts): ask the owner, never fetched
       not there → say "NOT IN CANON" and name who must publish it. Never answer from memory
CHEAP  lookups go to the scout agent (haiku); you keep the deciding here
STYLE  tables and short imperative lines · partial completion is valid, silent failure is not
PROOF  a "done" claim needs a real run: node plugins/handoff-os/scripts/verify.mjs <session_id>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { }

  const session = String(payload.session_id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const backup = payload.hook_event_name === 'UserPromptSubmit';

  if (backup && (!session || existsSync(seenPath(session)))) process.exit(0);
  if (session) { try { writeFileSync(seenPath(session), 'card', 'utf8'); } catch { } }

  process.stdout.write(`${card()}\n`);
  process.exit(0);
}

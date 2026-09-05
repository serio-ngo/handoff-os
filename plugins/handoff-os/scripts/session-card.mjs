#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK = { orgName: 'the owner', publicUrl: '', tracker: 'task tracker', docStore: 'doc store', brandTools: 'design tools' };
function loadOrg() {
  const candidates = [];
  if (process.env.HANDOFF_OS_DIR) candidates.push(path.join(process.env.HANDOFF_OS_DIR, 'config', 'org.json'));
  candidates.push(path.join(here, '..', 'org.json'), path.join(here, '..', '..', '..', 'config', 'org.json'));
  for (const p of candidates) {
    try {
      if (existsSync(p)) return { ...FALLBACK, ...JSON.parse(readFileSync(p, 'utf8')) };
    } catch { }
  }
  return FALLBACK;
}
const org = loadOrg();
const canonPublic = org.publicUrl
  ? `${org.publicUrl} + footer — read live, no connector needed`
  : `your public site (run npm run setup) — read live, no connector needed`;

const CARD = `Handoff OS — session card (full procedure: docs/ORCHESTRATOR.md, read it only when this card cannot answer)
PLANES · one home per fact · crossing a plane is a sync, never a copy
  TRUTH=${org.docStore} + ${org.publicUrl || 'public site'} | STATE=${org.tracker} | BUILD=git | BRAND=${org.brandTools} | HUMAN=the owner
TIERS
  GREEN  reversible, inward → act
  YELLOW writes outside the repo but is reversible → do it, append one audit line
  RED    sends, pays, submits, publishes, or is irreversible → STOP, emit /handoff-os:handoff-card
NEVER  send · pay · submit · publish · state-changing git · set ANTHROPIC_API_KEY /
       ANTHROPIC_AUTH_TOKEN / CLAUDE_CODE_OAUTH_TOKEN / apiKeyHelper · put org data in git
CANON  public: ${canonPublic}
       private (bank, beneficiary, contracts): ask the owner in conversation, never fetched
       not there → say "NOT IN CANON" and name who must publish it. Never answer from memory.
STYLE  tables and short imperative lines · partial completion is valid, silent failure is not
PROOF  a "done" claim needs a real run: node plugins/handoff-os/scripts/verify-run.mjs <session_id>`;

process.stdout.write(`${CARD}\n`);
process.exit(0);

#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MAX_PER_WAVE = 3;
const WINDOW_MS = 90 * 1000;

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (payload.tool_name && payload.tool_name !== 'Agent') process.exit(0);

const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
const stateDir = path.join(root, '.claude');
const stateFile = path.join(stateDir, `.wave-${session}.json`);

const now = Date.now();
let state = { count: 0, first: now };
try {
  const prior = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (now - prior.first < WINDOW_MS) state = prior;
} catch { }

state.count += 1;

try {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state), 'utf8');
} catch {
  process.stderr.write('FAN-OUT CAP: could not persist wave state, cap not enforced this launch.\n');
  process.exit(0);
}

if (state.count > MAX_PER_WAVE) {
  process.stderr.write(
    `FAN-OUT CAP: this is subagent ${state.count} of a wave capped at ${MAX_PER_WAVE} `
    + `(law 7). Read what the first ${MAX_PER_WAVE} returned, decide whether another wave `
    + 'earns its cost, then launch again. A subagent run is ~4x a single chat and a '
    + 'multi-agent run ~15x - the fan-out decision outweighs every model choice combined. '
    + 'Procedure: /handoff-os:research-budget.\n',
  );
  process.exit(2);
}

process.exit(0);

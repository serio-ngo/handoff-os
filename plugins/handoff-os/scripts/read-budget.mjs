#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (String(payload.tool_name || '') !== 'Read') process.exit(0);
const input = payload.tool_input || {};
const file = String(input.file_path || '');
if (!file) process.exit(0);

if (input.offset !== undefined || input.limit !== undefined) process.exit(0);

let fingerprint;
try {
  const st = statSync(file);
  fingerprint = `${st.mtimeMs}:${st.size}`;
} catch {
  process.exit(0);
}

const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
const stateDir = path.join(root, '.claude');
const stateFile = path.join(stateDir, `.reads-${session}.json`);

let seen = {};
try { seen = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { seen = {}; }

const key = path.resolve(file);
if (seen[key] === fingerprint) {
  process.stderr.write(
    `READ BUDGET: ${path.basename(file)} is already in this session's context, unchanged `
    + '(same mtime and size). Re-reading it pays for the same bytes twice. Use what you have; '
    + 'if you need one region, read a slice with offset/limit, which is always allowed.\n',
  );
  process.exit(2);
}

seen[key] = fingerprint;
try {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(seen), 'utf8');
} catch { }

process.exit(0);

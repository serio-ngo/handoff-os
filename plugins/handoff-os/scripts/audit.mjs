#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIELDS = ['ts', 'actor', 'tier', 'action', 'target', 'result'];

export function line(payload, root) {
  const tool = String(payload.tool_name || '');
  if (!tool) return null;
  const input = payload.tool_input || {};
  const target = String(input.file_path || input.path
    || (typeof input.command === 'string' ? input.command.slice(0, 120) : '') || '');

  const external = tool.startsWith('mcp__');
  let inside = false;
  if (target && !external) {
    try {
      const norm = (value) => resolve(value).replace(/\\/g, '/').toLowerCase();
      inside = norm(target) === norm(root) || norm(target).startsWith(`${norm(root)}/`);
    } catch { inside = false; }
  }

  const values = {
    ts: new Date().toISOString(),
    actor: payload.agent_type || 'main',
    tier: external || !inside ? 'YELLOW' : 'GREEN',
    action: tool,
    target,
    result: 'ok',
  };
  return JSON.stringify(Object.fromEntries(FIELDS.map((key) => [key, values[key]])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let payload = {};
    try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { payload = {}; }
    const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const entry = line(payload, root);
    if (entry) {
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      mkdirSync(`${root}/audit`, { recursive: true });
      appendFileSync(`${root}/audit/${month}.jsonl`, `${entry}\n`, 'utf8');
    }
  } catch { }
  process.exit(0);
}

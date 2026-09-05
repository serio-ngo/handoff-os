#!/usr/bin/env node
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { payload = {}; }

  const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tool = String(payload.tool_name || '');
  const input = payload.tool_input || {};
  if (!tool) process.exit(0);

  const target = String(
    input.file_path || input.path || (typeof input.command === 'string' ? input.command.slice(0, 120) : '') || ''
  );

  const isMcp = tool.startsWith('mcp__');
  let inside = false;
  if (target && !isMcp) {
    try {
      const norm = (s) => resolve(s).replace(/\\/g, '/').toLowerCase();
      inside = norm(target).startsWith(norm(root) + '/') || norm(target) === norm(root);
    } catch { inside = false; }
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    actor: payload.agent_type || 'main',
    tier: isMcp || !inside ? 'YELLOW' : 'GREEN',
    action: tool,
    target,
    result: 'ok',
  });

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const dir = `${root}/audit`;
  mkdirSync(dir, { recursive: true });
  appendFileSync(`${dir}/${month}.jsonl`, line + '\n', 'utf8');
} catch {
}

process.exit(0);

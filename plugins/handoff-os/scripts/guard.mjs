#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPAWN_TOOLS, WRITE_TOOLS } from './lib/patterns.mjs';
import { bump } from './lib/ledger.mjs';
import { Blocked, deniedModel, fanOutCap } from './lib/dispatch.mjs';
import { judgeShell, shellWriteTargets } from './lib/shell.mjs';
import { kb, noteWrite, queryBudget, readBudget, shellReadBudget } from './lib/reads.mjs';
import { judgeWrite } from './lib/writes.mjs';
import { judgeConnector } from './lib/mcp.mjs';

export { Blocked };

let current = {};

const deny = (reason, label = 'EGRESS LOCK') => {
  bump(current, 'blocked');
  throw new Blocked(`${label}: ${reason}\n`);
};

export function judge(raw = {}) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const tool = String(payload.tool_name || '');
  const input = payload.tool_input || {};
  current = payload;

  if (tool === 'Read') {
    const trim = readBudget(payload, input, true);
    return trim ? {
      updatedInput: { ...input, offset: 0, limit: trim.lines },
      reason: `HANDOFF OS: ${trim.name} is ${kb(trim.size)}; trimmed to its first ${trim.lines} lines`,
    } : null;
  }
  if (tool === 'Grep' || tool === 'Glob') return queryBudget(payload, input, tool);
  if (SPAWN_TOOLS.includes(tool)) {
    const reason = deniedModel(input);
    if (reason) deny(reason, 'DISPATCH BUDGET');
    fanOutCap(payload);
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    const command = typeof input.command === 'string' ? input.command : '';
    const verdict = judgeShell(command);
    if (verdict) deny(verdict);
    const targets = shellWriteTargets(command);
    for (const target of targets) {
      const reason = judgeWrite(target, 'a shell write');
      if (reason) deny(reason);
    }
    if (targets.length) noteWrite(payload);
    return shellReadBudget(payload, input, tool);
  } else if (tool.startsWith('mcp__')) {
    const reason = judgeConnector(tool, input);
    if (reason) deny(reason);
  } else if (WRITE_TOOLS.includes(tool)) {
    const reason = judgeWrite(String(input.file_path || input.notebook_path || ''));
    if (reason) deny(reason);
    noteWrite(payload);
  }
  return null;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { payload = {}; }

  let rewrite = null;
  try {
    rewrite = judge(payload);
  } catch (error) {
    if (error instanceof Blocked) { process.stderr.write(error.message); process.exit(2); }
    throw error;
  }
  if (rewrite) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: rewrite.reason,
        updatedInput: rewrite.updatedInput,
        additionalContext: rewrite.reason,
      },
    }));
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

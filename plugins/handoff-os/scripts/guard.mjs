#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPAWN_TOOLS, WRITE_TOOLS } from './lib/patterns.mjs';
import { bump } from './lib/ledger.mjs';
import { Blocked, agentsRequested, bookRedirect, costBudget, dispatchBudget, fanOutCap } from './lib/dispatch.mjs';
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
    const trim = readBudget(payload, input, 'read');
    return trim ? {
      updatedInput: { ...input, offset: 0, limit: trim.lines },
      reason: `HANDOFF OS: ${trim.name} is ${kb(trim.size)}; trimmed to its first ${trim.lines} lines`,
    } : null;
  }
  if (tool === 'Grep' || tool === 'Glob') return queryBudget(payload, input, tool);
  if (SPAWN_TOOLS.includes(tool)) {
    const verdict = dispatchBudget(input, tool) || costBudget(input, tool);
    if (verdict) {
      if (verdict.tier) bookRedirect(payload, verdict.tier);
      deny(verdict.reason, 'DISPATCH BUDGET');
    }
    const count = agentsRequested(input, tool);
    fanOutCap(payload, count);
    bump(payload, 'agents', count);
    const kind = String(input.subagent_type || '');
    if (/scout/i.test(kind)) bump(payload, 'scouts', count);
    else if (/runner/i.test(kind)) bump(payload, 'runners', count);
  }
  else if (tool === 'Bash' || tool === 'PowerShell') {
    if ('command' in input && typeof input.command !== 'string') deny('blocked a shell call whose command was not a string');
    const command = typeof input.command === 'string' ? input.command : '';
    const verdict = judgeShell(command);
    if (verdict) deny(verdict);
    const targets = shellWriteTargets(command);
    for (const target of targets) {
      const reason = judgeWrite(target, command, 'a shell write');
      if (reason) deny(reason);
    }
    if (targets.length) noteWrite(payload);
    return shellReadBudget(payload, input, tool);
  } else if (tool.startsWith('mcp__')) {
    const reason = judgeConnector(tool, input);
    if (reason) deny(reason);
  } else if (WRITE_TOOLS.includes(tool)) {
    const edits = Array.isArray(input.edits) ? input.edits.map((edit) => edit?.new_string ?? '') : [];
    const content = [input.content, input.new_string, input.new_source, ...edits]
      .filter((value) => typeof value === 'string').join('\n');
    const reason = judgeWrite(String(input.file_path || input.notebook_path || ''), content);
    if (reason) deny(reason);
    noteWrite(payload);
  }
  return null;
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    const spawnOrShell = new RegExp(`"tool_name"\\s*:\\s*"(?:Bash|PowerShell|${SPAWN_TOOLS.join('|')})"`);
    if (spawnOrShell.test(raw)) {
      current = {};
      try {
        deny('blocked a subagent or shell call whose payload could not be parsed');
      } catch (error) {
        if (error instanceof Blocked) { process.stderr.write(error.message); process.exit(2); }
        throw error;
      }
    }
    process.exit(0);
  }

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

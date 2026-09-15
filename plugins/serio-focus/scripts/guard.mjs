#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Blocked } from './lib/blocked.mjs';
import { bump } from './lib/ledger.mjs';
import { agentsRequested, bookRedirect, costBudget, dispatchBudget, receipt } from './lib/dispatch.mjs';
import { fanOutCap } from './lib/fan-out.mjs';
import { judgeShell, shellWriteTargets } from './lib/shell-danger.mjs';
import { kb, noteWrite, readBudget, shellReadBudget } from './lib/read-budget.mjs';
import { queryBudget } from './lib/query-budget.mjs';

export const SPAWN_TOOLS = ['Agent', 'Task', 'TaskCreate', 'Workflow'];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'];
export { Blocked };

let current = {};

const deny = (reason, label = 'BLOCKED') => {
  bump(current, 'blocked');
  throw new Blocked(`${label}: ${reason}\n`);
};

function judgeRead(payload, input) {
  const trim = readBudget(payload, input, 'read');
  return trim ? {
    updatedInput: { ...input, offset: 0, limit: trim.lines },
    reason: `READ CAP: ${trim.name} ${kb(trim.size)}. Kept first ${trim.lines} lines`,
  } : null;
}

function judgeSpawn(payload, input, tool) {
  const verdict = dispatchBudget(input, payload.cwd, tool) || costBudget(input, tool);
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
  receipt(payload, input, tool);
  return null;
}

function judgeShellCall(payload, input, tool) {
  if ('command' in input && typeof input.command !== 'string') {
    deny('blocked a shell call whose command was not a string', 'GIT WRITE');
  }
  const command = typeof input.command === 'string' ? input.command : '';
  const verdict = judgeShell(command);
  if (verdict) deny(verdict, /recursive delete|git wipe/.test(verdict) ? 'DELETE LOCK' : 'GIT WRITE');

  if (shellWriteTargets(command).length) noteWrite(payload);
  return shellReadBudget(payload, input, tool);
}

function judgeFileWrite(payload) {
  noteWrite(payload);
}

export function judge(raw = {}) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const tool = String(payload.tool_name || '');
  const input = payload.tool_input || {};
  current = payload;

  if (tool === 'Read') return judgeRead(payload, input);
  if (tool === 'Grep' || tool === 'Glob') return queryBudget(payload, input, tool);
  if (SPAWN_TOOLS.includes(tool)) return judgeSpawn(payload, input, tool);
  if (tool === 'Bash' || tool === 'PowerShell') return judgeShellCall(payload, input, tool);
  if (WRITE_TOOLS.includes(tool)) judgeFileWrite(payload);
  return null;
}

const refuse = (error) => {
  if (!(error instanceof Blocked)) throw error;
  const reason = error.message.trim();
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
      additionalContext: reason,
    },
  }));
  process.exit(0);
};

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // An unparseable payload hides its own tool name; refuse the ones that can act.
    const spawnOrShell = new RegExp(`"tool_name"\\s*:\\s*"(?:Bash|PowerShell|${SPAWN_TOOLS.join('|')})"`);
    if (spawnOrShell.test(raw)) {
      current = {};
      try { deny('blocked a subagent or shell call whose payload could not be parsed'); } catch (error) { refuse(error); }
    }
    process.exit(0);
  }

  let rewrite = null;
  try { rewrite = judge(payload); } catch (error) { refuse(error); }

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

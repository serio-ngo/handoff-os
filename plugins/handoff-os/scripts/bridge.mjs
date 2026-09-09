import { append, entry } from './audit.mjs';
import { Blocked, judge } from './guard.mjs';
import { rootOf } from './ledger.mjs';
import { report } from './verify.mjs';

const TOOLS = { read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', grep: 'Grep', glob: 'Glob', task: 'TaskCreate' };

export function toPayload(tool, args = {}, sessionID = '', cwd = process.cwd()) {
  const name = String(tool || '').toLowerCase();
  const input = args && typeof args === 'object' ? { ...args } : {};
  if (name === 'task') delete input.model;
  return {
    hook_event_name: 'PreToolUse',
    session_id: String(sessionID || 'unknown'),
    cwd,
    agent_type: 'main',
    tool_name: TOOLS[name] || String(tool || ''),
    tool_input: input,
  };
}

export function verdictFor(tool, args, sessionID, cwd) {
  try {
    judge(toPayload(tool, args, sessionID, cwd));
    return null;
  } catch (error) {
    if (error instanceof Blocked) return error.message.trim();
    throw error;
  }
}

export function receiptFor(tool, args, sessionID, cwd) {
  const payload = toPayload(tool, args, sessionID, cwd);
  const values = entry(payload, rootOf(payload));
  if (values) append(rootOf(payload), values);
}

export function flush(sessionID, cwd = process.cwd()) {
  report({ hook_event_name: 'Stop', session_id: String(sessionID || 'unknown'), cwd });
}

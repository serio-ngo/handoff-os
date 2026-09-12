import { Blocked, judge } from './guard.mjs';
import { report } from './verify.mjs';

const TOOLS = { read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', grep: 'Grep', glob: 'Glob', task: 'TaskCreate' };
const ALIAS = { filePath: 'file_path', oldString: 'old_string', newString: 'new_string' };

function toPayload(tool, args = {}, sessionID = '', cwd = process.cwd()) {
  const name = String(tool || '').toLowerCase();
  const input = args && typeof args === 'object' ? { ...args } : {};
  for (const [from, to] of Object.entries(ALIAS)) {
    if (input[from] !== undefined && input[to] === undefined) input[to] = input[from];
  }
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
  const payload = toPayload(tool, args, sessionID, cwd);
  try {
    const rewrite = judge(payload);
    if (rewrite && args && typeof args === 'object') {
      for (const [key, value] of Object.entries(rewrite.updatedInput)) {
        const camel = Object.keys(ALIAS).find((from) => ALIAS[from] === key);
        if (camel && camel in args) args[camel] = value;
        else args[key] = value;
      }
    }
    return null;
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
    return error.message.trim();
  }
}

export function flush(sessionID, cwd = process.cwd()) {
  report({ hook_event_name: 'Stop', session_id: String(sessionID || 'unknown'), cwd });
}

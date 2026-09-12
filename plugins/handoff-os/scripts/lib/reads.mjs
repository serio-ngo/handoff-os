import { closeSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { BIG_FILE_BYTES, GREP_HEAD_LIMIT } from './patterns.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';
import { Blocked } from './dispatch.mjs';
import { shellQuote, shellReads } from './shell.mjs';

const SAMPLE_BYTES = 64 * 1024;
const SAMPLE_LINES = 200;
export const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;
const actorOf = (payload = {}) => String(payload.agent_type || 'main').replace(/[:|]/g, '');

export function lineLength(file, size) {
  if (!size) return 0;
  const buffer = Buffer.alloc(Math.min(size, SAMPLE_BYTES));
  let n = 0;
  try {
    const fd = openSync(file, 'r');
    n = readSync(fd, buffer, 0, buffer.length, 0);
    closeSync(fd);
  } catch { return size; }
  let lines = 0;
  let end = 0;
  for (let i = 0; i < n && lines < SAMPLE_LINES; i += 1) {
    if (buffer[i] === 10) { lines += 1; end = i + 1; }
  }
  return lines ? end / lines : n;
}

function fileStats(file) {
  try {
    const stats = statSync(file);
    return stats.isFile() ? stats : null;
  } catch { return null; }
}

export function readBudget(payload, input, rewritable = false) {
  const file = String(input.file_path || '');
  if (!file || input.offset !== undefined || input.limit !== undefined || input.pages !== undefined) return null;
  const stats = fileStats(file);
  if (!stats) return null;

  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = `${actorOf(payload)}|${path.resolve(file)}`;
  const fingerprint = `${stats.mtimeMs}:${stats.size}`;
  const name = path.basename(file);

  if (state.reads[key] === fingerprint) {
    state.saved.rereads += 1;
    save(root, session, state);
    throw new Blocked(`READ BUDGET: ${name} is unchanged and already in context\n`);
  }
  state.reads[key] = fingerprint;

  let trim = null;
  if (rewritable && stats.size > BIG_FILE_BYTES) {
    const avg = lineLength(file, stats.size);
    trim = { name, size: stats.size, lines: Math.max(1, Math.floor(BIG_FILE_BYTES / (avg || stats.size))) };
    state.saved.rewrites += 1;
  }
  save(root, session, state);
  return trim;
}

export function shellReadBudget(payload, input, tool) {
  const command = typeof input.command === 'string' ? input.command : '';
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
  let rewrite = null;
  for (const read of shellReads(command)) {
    const trim = readBudget(payload, { file_path: path.resolve(cwd, read.file) }, tool === 'Bash' && read.rewritable && !rewrite);
    if (!trim) continue;
    const head = `head -c ${BIG_FILE_BYTES} ${shellQuote(read.file)}`;
    rewrite = {
      updatedInput: { ...input, command: command.slice(0, read.at) + head + command.slice(read.at + read.span) },
      reason: `HANDOFF OS: ${trim.name} is ${kb(trim.size)}; trimmed to head -c ${BIG_FILE_BYTES}`,
    };
  }
  return rewrite;
}

export function noteWrite(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  for (const key of Object.keys(state.reads)) {
    if (key.includes('|q:')) delete state.reads[key];
  }
  save(root, session, state);
}

export function queryBudget(payload, input, tool) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = `${actorOf(payload)}|q:${tool}:${JSON.stringify(input)}`;
  if (state.reads[key]) {
    state.saved.queries += 1;
    save(root, session, state);
    throw new Blocked(`READ BUDGET: this exact ${tool} already ran and nothing has been written since\n`);
  }
  state.reads[key] = 1;
  save(root, session, state);
  if (tool === 'Grep' && input.output_mode === 'content' && input.head_limit === undefined) {
    return {
      updatedInput: { ...input, head_limit: GREP_HEAD_LIMIT },
      reason: `HANDOFF OS: head_limit ${GREP_HEAD_LIMIT} set on this Grep`,
    };
  }
  return null;
}

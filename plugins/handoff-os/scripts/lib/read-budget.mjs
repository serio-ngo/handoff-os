import { closeSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { BASH_OUTPUT_CAP, BIG_FILE_BYTES, delegateOn } from './limits.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';
import { Blocked } from './blocked.mjs';
import { shellQuote } from './shell-parse.mjs';
import { shellReads } from './shell-reads.mjs';

const SAMPLE_BYTES = 64 * 1024;
const SAMPLE_LINES = 200;

export const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;
export const actorOf = (payload = {}) => String(payload.agent_type || 'main').replace(/[:|]/g, '');

function averageLineLength(file, size) {
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

function sliceBytes(file, size, { from = 0, lines, bytes }) {
  if (bytes !== undefined) return Math.min(bytes, size);
  const avg = averageLineLength(file, size);
  if (!avg) return 0;
  const total = size / avg;
  const start = Math.min(from, total);
  const count = lines === undefined ? total - start : Math.min(lines, total - start);
  return Math.max(0, Math.min(size, Math.round(count * avg)));
}

const statFile = (file) => {
  try {
    const stats = statSync(file);
    return stats.isFile() ? stats : null;
  } catch { return null; }
};

function bookSlice(payload, file, spec, { shell = false } = {}) {
  const stats = statFile(file);
  if (!stats) return;
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  let bytes = spec.whole ? stats.size : sliceBytes(file, stats.size, spec);
  if (shell) bytes = Math.min(bytes, BASH_OUTPUT_CAP);
  if (actorOf(payload) !== 'main') state.saved.offload += bytes;
  else state.saved.read += bytes;
  save(root, session, state);
}

export function readBudget(payload, input, rewritable = false) {
  const file = String(input.file_path || '');
  if (!file) return null;
  if (input.offset !== undefined || input.limit !== undefined || input.pages !== undefined) {
    bookSlice(payload, file, {
      from: Math.max(0, Number(input.offset || 0) - 1),
      lines: input.limit === undefined ? undefined : Number(input.limit),
    });
    return null;
  }
  const stats = statFile(file);
  if (!stats) return null;

  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const actor = actorOf(payload);
  const main = actor === 'main';
  const resolved = path.resolve(file);
  const key = `${actor}|${resolved}`;
  const fingerprint = `${stats.mtimeMs}:${stats.size}`;
  const name = path.basename(file);

  const refuse = (action, bucket, credit, tag, message) => {
    const stamp = `${fingerprint}:${tag}`;
    if (state.reads[`${actor}|x:${resolved}`] !== stamp) {
      state.reads[`${actor}|x:${resolved}`] = stamp;
      state.saved[action] += 1;
      state.saved[bucket] += credit;
    }
    save(root, session, state);
    throw new Blocked(`READ BUDGET: ${message}${main && delegateOn() ? ' — delegate the read to a scout subagent' : ''}\n`);
  };

  const seen = String(state.reads[key] ?? '');
  if (seen === fingerprint || seen.startsWith(`${fingerprint}:`)) {
    const before = Number(seen.slice(fingerprint.length + 1));
    refuse('rereads', 'bytes', before || Math.min(stats.size, BIG_FILE_BYTES), 'r',
      `${name} is unchanged and already in context${stats.size > BIG_FILE_BYTES ? ` (its first ${kb(BIG_FILE_BYTES)})` : ''}`);
  }

  let bytes = stats.size;
  let trim = null;
  if (stats.size > BIG_FILE_BYTES) {
    if (!rewritable) {
      refuse('slices', 'deferred', stats.size, 's',
        `${name} is ${kb(stats.size)}, over the ${kb(BIG_FILE_BYTES)} whole-file limit`);
    }
    const avg = averageLineLength(resolved, stats.size);
    const lines = Math.max(1, Math.floor(BIG_FILE_BYTES / (avg || stats.size)));
    const admitted = rewritable === 'shell' ? BIG_FILE_BYTES : Math.min(stats.size, Math.round(lines * avg));
    if (admitted < stats.size) {
      trim = { lines, admitted, size: stats.size, name };
      bytes = admitted;
      state.saved.rewrites += 1;
      state.saved.trimmed += stats.size - admitted;
    }
  }

  state.reads[key] = `${fingerprint}:${bytes}`;
  if (main) state.saved.read += bytes;
  else state.saved.offload += bytes;
  save(root, session, state);
  return trim;
}

function unbook(payload, before) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  for (const key of Object.keys(state.reads)) {
    if (!(key in before.reads) && !key.includes('|x:')) delete state.reads[key];
  }
  for (const key of ['read', 'offload', 'rewrites', 'trimmed']) state.saved[key] = before.saved[key];
  save(root, session, state);
}

export function shellReadBudget(payload, input, tool) {
  const command = typeof input.command === 'string' ? input.command : '';
  const before = load(rootOf(payload), sessionOf(payload));
  let rewrite = null;
  try {
    for (const read of shellReads(command)) {
      if (read.unjudged) continue;
      const file = path.resolve(typeof payload.cwd === 'string' ? payload.cwd : process.cwd(), read.file);
      if (!read.whole) { bookSlice(payload, file, read, { shell: true }); continue; }
      if (read.piped) { bookSlice(payload, file, { whole: true }, { shell: true }); continue; }
      const trim = readBudget(payload, { file_path: file }, tool === 'Bash' && read.rewritable && !rewrite ? 'shell' : false);
      if (trim) {
        rewrite = {
          updatedInput: {
            ...input,
            command: command.slice(0, read.at)
              + `head -c ${BIG_FILE_BYTES} ${shellQuote(read.file)}`
              + command.slice(read.at + read.span),
          },
          reason: `READ CAP: ${trim.name} ${kb(trim.size)}. Kept head -c ${BIG_FILE_BYTES}`,
        };
      }
    }
  } catch (error) {
    if (error instanceof Blocked) unbook(payload, before);
    throw error;
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
  state.written = Date.now();
  save(root, session, state);
}

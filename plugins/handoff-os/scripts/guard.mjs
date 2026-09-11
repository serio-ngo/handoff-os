#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_NUMBER, ANYWHERE, AT_HEAD, BASH_OUTPUT_CAP, BIG_FILE_BYTES, CONNECTOR_ALLOW, DESTRUCTIVE, FIXTURES, GIT_SHOW_FILE, GREP_HEAD_LIMIT, INTERPRETER_READ,
  THINK_ESCALATION, WORKFLOW_AGENT_CALL, UNBOUNDED_FANOUT, FANOUT_BUDGET,
  GH_MUTATION, GIT_DESTRUCTIVE, GIT_WRITE, INTERPRETER_EGRESS, MAX_PER_WAVE, MODEL_TIERS,
  DENY_SUBAGENT_DEFAULT, OUTWARD, OUTWARD_PREFIX, SECRET_NAMES, SECRET_PATHS, ORG_NAMES, ORG_PATHS, DISPOSABLE, QUALITY, READ_PREFIX,
  MODEL_BEARING, MODEL_OPTION, RESTORATIVE, REVIEW, SHELL_DESTRUCTIVE, SHELL_INNER, SHELL_PREFIX, SHELL_QUOTED,
  SHELL_INNER_BARE, ENCODED_CMD, NO_OP_FLAG, PIPE, REDIRECT, REDIRECTED, REDIRECT_AMP, TO_FILE, FD_DUP, REWRITABLE_READ, SED_QUIET, SED_RANGE, SLICE_CMD,
  SHELL_WRITE_TARGET, SHELLS, SPAWN_TEXT, SPAWN_TOOLS, deniedSubagentRx,
  SQL_DESTRUCTIVE, STRONG, WAVE_MS, WEB_FETCH_SERVER, WHOLE_FILE_CMD, WRITE_TOOLS, WRITE_VERBS,
} from './patterns.mjs';
import { append } from './audit.mjs';
import { bump, load, rootOf, save, sessionOf } from './ledger.mjs';

let current = {};

const actorOf = (payload = {}) => String(payload.agent_type || 'main').replace(/[:|]/g, '');

export class Blocked extends Error {}

const deny = (reason, label = 'EGRESS LOCK') => {
  bump(current, 'blocked');
  throw new Blocked(`${label}: ${reason}\n`);
};

function split(command, breakers, subshell) {
  const out = [];
  let buffer = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote && command[i - 1] !== '\\') quote = null;
      buffer += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; buffer += char; continue; }
    if (char === '&' && REDIRECT_AMP(command[i - 1], command[i + 1])) { buffer += char; continue; }
    if (breakers.includes(char)) { out.push(buffer); buffer = ''; continue; }
    if (subshell && char === '$' && command[i + 1] === '(') { out.push(buffer); buffer = ''; i += 1; continue; }
    buffer += char;
  }
  out.push(buffer);
  return out.map((part) => part.replace(/^\s*(?:\w+=\S+\s+)*/, '').trim()).filter(Boolean);
}

const segments = (command) => split(command, ';\n&|`', true);
const pipelines = (command) => split(command, ';\n&', false);

function unwrap(segment) {
  let out = String(segment).trim();
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(SHELL_PREFIX, '').trim().replace(SHELL_QUOTED, '$2').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

function onlyDisposable(segment) {
  const operands = segment.split(/\s+/).slice(1)
    .filter((token) => !/^-|^\/[A-Za-z]$|^\d+$/.test(token))
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return operands.length > 0 && operands.every((token) => DISPOSABLE.test(token));
}

function judgeShell(command, depth = 0) {
  for (const rx of ANYWHERE) if (rx.test(command)) return 'blocked a metered-credential assignment';
  for (const segment of segments(command).map(unwrap)) {
    if (NO_OP_FLAG.test(segment.replace(/'[^']*'|"[^"]*"/g, ' '))) continue;
    const quoted = `blocked "${segment.slice(0, 80)}"`;
    for (const rx of GIT_DESTRUCTIVE) {
      if (rx.test(segment)) return `${quoted} — merge or delete`;
    }
    for (const rx of SHELL_DESTRUCTIVE) {
      if (rx.test(segment) && !onlyDisposable(segment)) {
        return `${quoted} — delete outside build and temp paths`;
      }
    }
    for (const rx of GIT_WRITE) {
      if (rx.test(segment)) return `${quoted} — a git write`;
    }
    for (const rx of AT_HEAD) {
      if (rx.test(segment)) return `${quoted} — outward action`;
    }
    if (GH_MUTATION.test(segment)) return `${quoted} — a gh api write`;
    if (INTERPRETER_EGRESS.test(segment)) return `${quoted} — posts over the network`;
    if (depth < 2 && SHELLS.test(segment)) {
      const encoded = (ENCODED_CMD.exec(segment) || [])[1];
      const inner = encoded
        ? Buffer.from(encoded, 'base64').toString('utf16le')
        : (SHELL_INNER.exec(segment) || SHELL_INNER_BARE.exec(segment) || [])[2];
      if (inner) {
        const verdict = judgeShell(inner, depth + 1);
        if (verdict) return verdict;
      }
    }
  }
  return null;
}

const SAMPLE_BYTES = 64 * 1024;
const SAMPLE_LINES = 200;
const strip = (token) => token.replace(/^['"]|['"]$/g, '');
const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;

function lineLength(file, size) {
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
  const avg = lineLength(file, size);
  if (!avg) return 0;
  const total = size / avg;
  const start = Math.min(from, total);
  const count = lines === undefined ? total - start : Math.min(lines, total - start);
  return Math.max(0, Math.min(size, Math.round(count * avg)));
}

function fileStats(file) {
  try {
    const stats = statSync(file);
    return stats.isFile() ? stats : null;
  } catch { return null; }
}

function shellWords(segment) {
  const out = [];
  let buffer = '';
  let quote = null;
  let open = false;
  for (const char of String(segment)) {
    if (quote) {
      if (char === quote) quote = null; else buffer += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; open = true; continue; }
    if (/\s/.test(char)) { if (open || buffer) out.push(buffer); buffer = ''; open = false; continue; }
    buffer += char;
  }
  if (open || buffer) out.push(buffer);
  return out;
}

const shellQuote = (file) => (/[\s'"]/.test(file) ? `"${file.replace(/(["\\$`])/g, '\\$1')}"` : file);

function tokens(segment) {
  const out = [];
  let toFile = false;
  const raw = shellWords(segment).filter(Boolean);
  for (let i = 0; i < raw.length; i += 1) {
    const word = raw[i];
    if (REDIRECT.test(word)) {
      const detached = /[<>]&?$/.test(word);
      const target = detached ? (raw[i + 1] || '') : '';
      if (TO_FILE.test(word) && !FD_DUP.test(word) && !target.startsWith('&')) toFile = true;
      if (detached) i += 1;
      continue;
    }
    if (REDIRECTED.test(word)) {
      if (TO_FILE.test(word)) toFile = true;
      continue;
    }
    out.push(word);
  }
  return toFile ? [] : out;
}

function headTail(words) {
  const spec = { lines: 10 };
  const files = [];
  const count = (value, key) => {
    if (value === undefined || !/^\+?\d+$/.test(value)) return;
    delete spec.lines;
    delete spec.bytes;
    delete spec.from;
    if (value.startsWith('+')) spec.from = Math.max(0, Number(value.slice(1)) - 1);
    else spec[key] = Number(value);
  };
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    let hit = /^(?:-n|--lines=?)(\+?\d+)?$/.exec(word);
    if (hit) { count(hit[1] ?? words[++i], 'lines'); continue; }
    hit = /^(?:-c|--bytes=?)(\d+)?$/.exec(word);
    if (hit) { count(hit[1] ?? words[++i], 'bytes'); continue; }
    hit = /^-(\d+)$/.exec(word);
    if (hit) { count(hit[1], 'lines'); continue; }
    if (word.startsWith('-')) continue;
    files.push(strip(word));
  }
  return files.map((file) => ({ file, ...spec }));
}

function sedSlice(words) {
  if (!words.some((word, i) => i > 0 && SED_QUIET.test(word))) return [];
  let range = null;
  const files = [];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    if (/^(?:-e|--expression)$/.test(word)) { range = range || SED_RANGE.exec(strip(words[++i] || '')); continue; }
    if (word.startsWith('-')) continue;
    const hit = range ? null : SED_RANGE.exec(strip(word));
    if (hit) range = hit;
    else files.push(strip(word));
  }
  if (!range || files.length !== 1) return [];
  const from = Number(range[1]) - 1;
  const lines = range[2] === undefined ? 1 : range[2] === '$' ? undefined : Math.max(0, Number(range[2]) - from);
  return [{ file: files[0], from, lines }];
}

function shellRead(segment) {
  if (INTERPRETER_READ.test(segment) || GIT_SHOW_FILE.test(segment)) return [{ unjudged: true }];
  const words = tokens(segment);
  const cmd = (words[0] || '').toLowerCase();
  if (WHOLE_FILE_CMD.test(cmd)) {
    const rest = words.slice(1);
    const files = rest.filter((word) => !word.startsWith('-'));
    const only = files.length === 1 && files.length === rest.length
      && !/[<>]/.test(segment) && REWRITABLE_READ.test(cmd);
    return files.map((raw) => ({ file: strip(raw), whole: true, only }));
  }
  if (SLICE_CMD.test(cmd)) return headTail(words);
  if (cmd === 'sed') return sedSlice(words);
  return [];
}

function bookSlice(payload, file, spec, { shell = false, filtered = false } = {}) {
  const stats = fileStats(file);
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

function shellReads(command) {
  const out = [];
  let cursor = 0;
  for (const chunk of pipelines(command)) {
    const at = command.indexOf(chunk, cursor);
    if (at >= 0) cursor = at + chunk.length;
    if (chunk.includes('`') || chunk.includes('$(')) continue;
    const piped = PIPE.test(chunk);
    const first = chunk.split('|')[0].trim();
    const segment = unwrap(first);
    const bare = !piped && segment === first && at >= 0;
    for (const read of shellRead(segment)) out.push({ ...read, piped, at, span: first.length, rewritable: bare && Boolean(read.only) });
  }
  return out;
}

function shellWriteTargets(command) {
  const out = [];
  for (const segment of segments(command)) {
    for (const rx of SHELL_WRITE_TARGET) {
      const hit = rx.exec(segment);
      if (hit && hit[1]) out.push(hit[1]);
    }
  }
  return out;
}

function readBudget(payload, input, rewritable = false) {
  const file = String(input.file_path || '');
  if (!file) return null;
  if (input.offset !== undefined || input.limit !== undefined || input.pages !== undefined) {
    bookSlice(payload, file, {
      from: Math.max(0, Number(input.offset || 0) - 1),
      lines: input.limit === undefined ? undefined : Number(input.limit),
    });
    return null;
  }
  const stats = fileStats(file);
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
    throw new Blocked(`READ BUDGET: ${message}\n`);
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
    const avg = lineLength(resolved, stats.size);
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

function noteWrite(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const scope = `${actorOf(payload)}|q:`;
  for (const key of Object.keys(state.reads)) {
    if (key.startsWith(scope)) delete state.reads[key];
  }
  state.written = Date.now();
  save(root, session, state);
}

function queryBudget(payload, input, tool) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = `${actorOf(payload)}|q:${tool}:${JSON.stringify(input)}`;
  if (state.reads[key]) {
    if (state.reads[key] === 1) state.saved.queries += 1;
    state.reads[key] = 2;
    save(root, session, state);
    throw new Blocked(`READ BUDGET: this exact ${tool} already ran and nothing has been written since\n`);
  }
  state.reads[key] = 1;
  if (tool === 'Grep' && input.output_mode === 'content' && input.head_limit === undefined) {
    state.saved.caps += 1;
    save(root, session, state);
    return {
      updatedInput: { ...input, head_limit: GREP_HEAD_LIMIT },
      reason: `HANDOFF OS: head_limit ${GREP_HEAD_LIMIT} set on this Grep`,
    };
  }
  save(root, session, state);
  return null;
}

function claimSlot(dir, bucket, cap) {
  try { mkdirSync(dir, { recursive: true }); } catch {
    try { rmSync(dir, { force: true, recursive: true }); mkdirSync(dir, { recursive: true }); } catch { return cap + 1; }
  }
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(`${bucket}-`)) rmSync(path.join(dir, name), { force: true });
    }
  } catch { }
  for (let n = 1; n <= cap + 1; n += 1) {
    try {
      closeSync(openSync(path.join(dir, `${bucket}-${n}`), 'wx'));
      return n;
    } catch { }
  }
  return cap + 1;
}

function judgeWrite(file, content, how = 'a write') {
  const base = file.split(/[/\\]/).pop() || '';
  if (SECRET_PATHS.some((rx) => rx.test(file)) || SECRET_NAMES.some((rx) => rx.test(base))) {
    return `blocked ${how} to ${file} — secret-bearing`;
  }
  const exempt = /(^|[/\\])memory\.md$/i.test(file) || FIXTURES.some((rx) => rx.test(file));
  if (!exempt && (ORG_PATHS.some((rx) => rx.test(file)) || ORG_NAMES.some((rx) => rx.test(base)))) {
    return `blocked ${how} to ${file} — brand-locked or organisation data`;
  }
  if (!exempt && ACCOUNT_NUMBER.test(String(content ?? ''))) {
    return `blocked an account number in ${how} to ${file}`;
  }
  return null;
}

const spawnText = (input) => SPAWN_TEXT.map((key) => input[key]).filter((value) => typeof value === 'string').join(' ');

const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function deniedVerdict(text, hit) {
  if (REVIEW.test(text)) return { reason: `blocked ${article(hit)} ${hit} review`, tier: hit };
  if (!QUALITY.test(text)) {
    return { reason: `blocked ${article(hit)} ${hit} subagent`, tier: hit };
  }
  return null;
}

const selectedTiers = (text) => [...String(text).matchAll(MODEL_OPTION)].map((hit) => hit[1].toLowerCase());

function dispatchBudget(input, tool = 'Agent', denied = deniedSubagentRx(process.env.HANDOFF_DENY_SUBAGENT_MODELS ?? DENY_SUBAGENT_DEFAULT)) {
  const model = String(input.model || '').trim();
  const text = spawnText(input);
  if (!model) {
    if (!MODEL_BEARING.includes(tool)) {
      const hit = selectedTiers(text).find((tier) => denied.test(tier));
      return hit ? deniedVerdict(text, hit) : null;
    }
    return { reason: 'blocked a dispatch that names no model' };
  }
  if (!MODEL_TIERS.test(model)) {
    return { reason: `blocked model "${model}" — not a tier` };
  }
  const hit = (model.match(denied) || [])[0]?.toLowerCase();
  return hit ? deniedVerdict(text, hit) : null;
}

function bookRedirect(payload, tier) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  state.saved.redirects += 1;
  state.tiers = { ...(state.tiers || {}), [tier]: ((state.tiers || {})[tier] || 0) + 1 };
  save(root, session, state);
}

const code = (text) => String(text ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
  .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');

const declaredAgents = (input) => Number((String(input.script ?? '').match(FANOUT_BUDGET) || [])[1] || 0);

function costBudget(input, tool) {
  const text = spawnText(input);
  if (QUALITY.test(text)) return null;
  const think = (text.match(THINK_ESCALATION) || [])[0];
  if (think) return { reason: `blocked "${think}"` };
  if (tool !== 'Workflow' || declaredAgents(input)) return null;
  const fan = (code(input.script).match(UNBOUNDED_FANOUT) || [])[0];
  return fan
    ? { reason: `blocked a workflow fanning out through "${fan.trim()}" with no agent count` }
    : null;
}

const agentsRequested = (input, tool) => (tool === 'Workflow'
  ? Math.max(1, declaredAgents(input) || (String(input.script ?? '').match(WORKFLOW_AGENT_CALL) || []).length)
  : 1);

function fanOutCap(payload, count = 1) {
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const bucket = Math.floor(Date.now() / WAVE_MS);
  const claimed = [];
  for (let n = 0; n < count; n += 1) {
    const slot = claimSlot(dir, bucket, MAX_PER_WAVE);
    if (slot <= MAX_PER_WAVE) { claimed.push(slot); continue; }
    for (const held of claimed) {
      try { rmSync(path.join(dir, `${bucket}-${held}`), { force: true }); } catch { }
    }
    const root = rootOf(payload);
    const session = sessionOf(payload);
    const state = load(root, session);
    state.saved.blocked += 1;
    state.saved.waves += 1;
    state.saved.agentsCapped += count - claimed.length;
    save(root, session, state);
    throw new Blocked(count > 1
      ? `FAN-OUT CAP: ${count} subagents requested, wave capped at ${MAX_PER_WAVE}\n`
      : `FAN-OUT CAP: subagent ${slot}, wave capped at ${MAX_PER_WAVE}\n`);
  }
}

function receipt(payload, input, tool) {
  const model = String(input.model || '').trim().toLowerCase() || 'inherit';
  const kind = String(input.subagent_type || input.description || input.subject || input.name || '').slice(0, 80);
  append(rootOf(payload), {
    actor: payload.agent_type || 'main', tier: 'GREEN', action: tool,
    target: `${model}:${kind}`, result: 'ok',
  });
}

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
    receipt(payload, input, tool);
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
    let rewrite = null;
    const before = load(rootOf(payload), sessionOf(payload));
    try {
      for (const read of shellReads(command)) {
        if (read.unjudged) { bump(payload, 'unjudged'); continue; }
        const file = path.resolve(typeof payload.cwd === 'string' ? payload.cwd : process.cwd(), read.file);
        if (!read.whole) { bookSlice(payload, file, read, { shell: true, filtered: read.piped }); continue; }
        if (read.piped) { bookSlice(payload, file, { whole: true }, { shell: true, filtered: true }); continue; }
        const trim = readBudget(payload, { file_path: file }, tool === 'Bash' && read.rewritable && !rewrite ? 'shell' : false);
        if (trim) {
          rewrite = {
            updatedInput: {
              ...input,
              command: command.slice(0, read.at)
                + `head -c ${BIG_FILE_BYTES} ${shellQuote(read.file)}`
                + command.slice(read.at + read.span),
            },
            reason: `HANDOFF OS: ${trim.name} is ${kb(trim.size)}; trimmed to head -c ${BIG_FILE_BYTES}`,
          };
        }
      }
    } catch (error) {
      if (error instanceof Blocked) unbook(payload, before);
      throw error;
    }
    return rewrite;
  } else if (tool.startsWith('mcp__')) {
    const action = tool.split('__').slice(2).join('__').toLowerCase();
    if ((process.env.HANDOFF_MCP_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).includes(action)) return;
    if (SQL_DESTRUCTIVE.test(JSON.stringify(input))) {
      deny(`blocked ${tool} — the payload carries a destructive SQL statement`);
    }
    for (const key of ['command', 'script', 'code']) {
      if (typeof input[key] !== 'string') continue;
      const verdict = judgeShell(input[key]);
      if (verdict) deny(`blocked ${tool} — ${verdict}`);
      for (const target of shellWriteTargets(input[key])) {
        const reason = judgeWrite(target, input[key], 'a shell write');
        if (reason) deny(`blocked ${tool} — ${reason}`);
      }
    }
    const dashed = action.replace(/_/g, '-');
    const strong = STRONG.some((verb) => action.includes(verb));
    const hit = DESTRUCTIVE.find((verb) => action.includes(verb))
      || WRITE_VERBS.find((verb) => action.includes(verb))
      || OUTWARD.find((verb) => action.includes(verb))
      || (OUTWARD_PREFIX.test(dashed) ? 'request' : undefined);
    const allowed = RESTORATIVE.test(dashed)
      || (READ_PREFIX.test(dashed) && !strong)
      || CONNECTOR_ALLOW.some((rx) => rx.test(dashed));
    if (hit && !allowed) {
      deny(`blocked ${tool} — "${hit}" leaves the org or destroys a record`);
    }
    const rawFetch = WEB_FETCH_SERVER.test(tool.split('__')[1] || '')
      && (READ_PREFIX.test(dashed) || /(?:scrape|crawl|extract|search)/.test(action));
    if (rawFetch) {
      deny(`blocked ${tool} — a raw page fetch`);
    }
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

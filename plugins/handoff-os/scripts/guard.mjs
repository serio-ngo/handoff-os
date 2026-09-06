#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ACCOUNT_NUMBER, ANYWHERE, AT_HEAD, BIG_FILE_BYTES, CONNECTOR_ALLOW, DESTRUCTIVE, FIXTURES,
  GH_MUTATION, GIT_DESTRUCTIVE, GIT_WRITE, INTERPRETER_EGRESS, MAX_PER_WAVE, MODEL_TIERS, OPUS,
  OUTWARD, OUTWARD_PREFIX, PROTECTED_NAMES, PROTECTED_PATHS, QUALITY, READ_CEILING_BYTES, READ_PREFIX,
  RESTORATIVE, SHELL_DESTRUCTIVE, SHELL_INNER, SHELL_PREFIX, SHELL_QUOTED, SHELL_WRITE_TARGET, SHELLS,
  SQL_DESTRUCTIVE, STRONG, WAVE_MS, WEB_FETCH_SERVER, WHOLE_FILE_READ, WRITE_VERBS,
} from './patterns.mjs';
import { bump, load, rootOf, save, sessionOf } from './ledger.mjs';

let current = {};

const deny = (reason) => {
  bump(current, 'blocked');
  process.stderr.write(`EGRESS LOCK: ${reason}\n`);
  process.exit(2);
};

export function segments(command) {
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
    if (char === ';' || char === '\n' || char === '&' || char === '|' || char === '`') {
      out.push(buffer); buffer = ''; continue;
    }
    if (char === '$' && command[i + 1] === '(') { out.push(buffer); buffer = ''; i += 1; continue; }
    buffer += char;
  }
  out.push(buffer);
  return out.map((part) => part.replace(/^\s*(?:\w+=\S+\s+)*/, '').trim()).filter(Boolean);
}

export function unwrap(segment) {
  let out = String(segment).trim();
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(SHELL_PREFIX, '').trim().replace(SHELL_QUOTED, '$2').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

function judgeShell(command, depth = 0) {
  const lockGit = process.env.HANDOFF_LOCK_GIT === '1';
  for (const rx of ANYWHERE) if (rx.test(command)) return `blocked a metered-credential assignment (${rx.source.slice(0, 40)})`;
  for (const segment of segments(command).map(unwrap)) {
    for (const rx of GIT_DESTRUCTIVE) {
      if (rx.test(segment)) return `blocked "${segment.slice(0, 80)}" — a merge or a delete. Those destroy work nobody can get back, so they stay with the human`;
    }
    for (const rx of SHELL_DESTRUCTIVE) {
      if (rx.test(segment)) return `blocked "${segment.slice(0, 80)}" — a delete. Move it aside instead, or let the human remove it`;
    }
    if (lockGit) {
      for (const rx of GIT_WRITE) {
        if (rx.test(segment)) return `blocked "${segment.slice(0, 80)}" — git is locked. Re-run npm run sync without --lock git to write`;
      }
    }
    for (const rx of AT_HEAD) {
      if (rx.test(segment)) return `blocked "${segment.slice(0, 80)}" — an outward action, the human performs it`;
    }
    if (GH_MUTATION.test(segment)) {
      return `blocked "${segment.slice(0, 80)}" — a gh api call carrying fields, which writes. The human performs it`;
    }
    if (INTERPRETER_EGRESS.test(segment)) {
      return `blocked "${segment.slice(0, 80)}" — an interpreter one-liner that posts over the network. The human performs it`;
    }
    if (depth < 2 && SHELLS.test(segment)) {
      const inner = (SHELL_INNER.exec(segment) || [])[2];
      if (inner) {
        const verdict = judgeShell(inner, depth + 1);
        if (verdict) return verdict;
      }
    }
  }
  return null;
}

export function pipelines(command) {
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
    if (char === ';' || char === '\n' || char === '&') { out.push(buffer); buffer = ''; continue; }
    buffer += char;
  }
  out.push(buffer);
  return out.map((part) => part.replace(/^\s*(?:\w+=\S+\s+)*/, '').trim()).filter(Boolean);
}

export function wholeFileReads(command) {
  const out = [];
  for (const chunk of pipelines(command)) {
    if (/[|`]/.test(chunk) || chunk.includes('$(')) continue;
    const hit = WHOLE_FILE_READ.exec(unwrap(chunk));
    if (hit && !hit[1].startsWith('-')) out.push(hit[1]);
  }
  return out;
}

export function shellWriteTargets(command) {
  const out = [];
  for (const segment of segments(command)) {
    for (const rx of SHELL_WRITE_TARGET) {
      const hit = rx.exec(segment);
      if (hit && hit[1]) out.push(hit[1]);
    }
  }
  return out;
}

function readBudget(payload, input) {
  const file = String(input.file_path || '');
  if (!file) return;
  const sliced = input.offset !== undefined || input.limit !== undefined;
  let stats;
  try { stats = statSync(file); } catch { return; }

  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = path.resolve(file);
  const fingerprint = `${stats.mtimeMs}:${stats.size}`;

  if (!sliced && state.reads[key] === fingerprint) {
    state.saved.rereads += 1;
    state.saved.bytes += stats.size;
    save(root, session, state);
    process.stderr.write(`READ BUDGET: ${path.basename(file)} is unchanged and already in context. Read a slice with offset/limit if you need one region.\n`);
    process.exit(2);
  }

  if (!sliced && stats.size > BIG_FILE_BYTES) {
    state.saved.slices += 1;
    state.saved.bytes += stats.size - BIG_FILE_BYTES;
    save(root, session, state);
    process.stderr.write(`READ BUDGET: ${path.basename(file)} is ${Math.round(stats.size / 1024)}KB, over the ${BIG_FILE_BYTES / 1024}KB whole-file limit. Read the region you need with offset/limit, or dispatch handoff-os:scout to answer from it.\n`);
    process.exit(2);
  }

  if (!sliced && (state.read_bytes || 0) >= READ_CEILING_BYTES) {
    state.saved.blocked += 1;
    save(root, session, state);
    process.stderr.write(`READ BUDGET: ${Math.round((state.read_bytes || 0) / 1024)}KB of whole files read this session, over the ${READ_CEILING_BYTES / 1024}KB ceiling. Read a slice with offset/limit, dispatch handoff-os:scout, or /compact to reset it.\n`);
    process.exit(2);
  }

  if (!sliced) {
    state.reads[key] = fingerprint;
    state.read_bytes = (state.read_bytes || 0) + stats.size;
  }
  save(root, session, state);
}

export function invalidateQueries(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  let dropped = 0;
  for (const key of Object.keys(state.reads)) {
    if (key.startsWith('q:')) { delete state.reads[key]; dropped += 1; }
  }
  if (dropped) save(root, session, state);
}

function queryBudget(payload, input, tool) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = `q:${tool}:${JSON.stringify(input)}`;
  if (state.reads[key]) {
    state.saved.rereads += 1;
    save(root, session, state);
    process.stderr.write(`READ BUDGET: this exact ${tool} already ran and nothing has been written since. Change the query, or read the file you are checking.\n`);
    process.exit(2);
  }
  if (tool === 'Grep' && input.output_mode === 'content' && input.head_limit === undefined) {
    state.saved.slices += 1;
    save(root, session, state);
    process.stderr.write(`READ BUDGET: set head_limit on a content-mode Grep so the match list cannot run away (30 is plenty).\n`);
    process.exit(2);
  }
  state.reads[key] = 1;
  save(root, session, state);
}

export function claimSlot(dir, bucket, cap) {
  try { mkdirSync(dir, { recursive: true }); } catch { return 1; }
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

export function judgeWrite(file, content, how = 'a write') {
  const base = file.split(/[/\\]/).pop() || '';
  if (PROTECTED_PATHS.some((rx) => rx.test(file)) || PROTECTED_NAMES.some((rx) => rx.test(base))) {
    return `blocked ${how} to ${file} — brand-locked or secret-bearing`;
  }
  const exempt = /(^|[/\\])memory\.md$/i.test(file) || FIXTURES.some((rx) => rx.test(file));
  if (!exempt && ACCOUNT_NUMBER.test(String(content ?? ''))) {
    return `blocked an account number in ${how} to ${file} — keep it in memory.md, never in git`;
  }
  return null;
}

export function dispatchBudget(input) {
  const model = String(input.model || '').trim();
  if (!model) {
    return 'blocked a subagent dispatch that names no model (law 8). State one: haiku for lookups, sonnet for research and review, opus only for prose you publish';
  }
  if (!MODEL_TIERS.test(model)) {
    return `blocked a subagent dispatch whose model "${model}" names no tier (law 8). Say haiku, sonnet or opus`;
  }
  if (OPUS.test(model) && !QUALITY.test(String(input.prompt || ''))) {
    return 'blocked an opus subagent (law 8). Web research and review go to sonnet; opus needs QUALITY: writing|creative|legal|security in the prompt';
  }
  return null;
}

function fanOutCap(payload) {
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const slot = claimSlot(dir, Math.floor(Date.now() / WAVE_MS), MAX_PER_WAVE);
  if (slot > MAX_PER_WAVE) {
    process.stderr.write(`FAN-OUT CAP: subagent ${slot}, wave capped at ${MAX_PER_WAVE} (law 7). Read the returns, then relaunch via /handoff-os:research-budget.\n`);
    process.exit(2);
  }
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  if (/"tool_name"\s*:\s*"(?:Bash|PowerShell)"/.test(raw)) deny('blocked a shell call whose payload could not be parsed');
  process.exit(0);
}

const tool = String(payload.tool_name || '');
const input = payload.tool_input || {};
current = payload;

if (tool === 'Read') readBudget(payload, input);
else if (tool === 'Grep' || tool === 'Glob') queryBudget(payload, input, tool);
else if (tool === 'Agent') {
  const verdict = dispatchBudget(input);
  if (verdict) deny(verdict);
  fanOutCap(payload);
  bump(payload, 'agents');
}
else if (tool === 'Bash' || tool === 'PowerShell') {
  if ('command' in input && typeof input.command !== 'string') deny('blocked a shell call whose command was not a string');
  const command = typeof input.command === 'string' ? input.command : '';
  const verdict = judgeShell(command);
  if (verdict) deny(verdict);
  for (const target of shellWriteTargets(command)) {
    const reason = judgeWrite(target, command, 'a shell write');
    if (reason) deny(reason);
  }
  for (const target of wholeFileReads(command)) {
    readBudget(payload, { file_path: path.resolve(payload.cwd || process.cwd(), target.replace(/^['"]|['"]$/g, '')) });
  }
} else if (tool.startsWith('mcp__')) {
  const action = tool.split('__').slice(2).join('__').toLowerCase();
  if ((process.env.HANDOFF_MCP_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).includes(action)) process.exit(0);
  if (SQL_DESTRUCTIVE.test(JSON.stringify(input))) {
    deny(`blocked ${tool} — the payload carries a destructive statement. The human runs that one`);
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
    deny(`blocked ${tool} — matched "${hit}", an action that leaves the org or destroys a record. The human performs it`);
  }
  const raw = WEB_FETCH_SERVER.test(tool.split('__')[1] || '')
    && (READ_PREFIX.test(dashed) || /(?:scrape|crawl|extract|search)/.test(action));
  if (raw) {
    deny(`blocked ${tool} — a raw page fetch. Use WebFetch/WebSearch or handoff-os:scout.`);
  }
} else if (tool === 'Edit' || tool === 'Write') {
  invalidateQueries(payload);
  const reason = judgeWrite(String(input.file_path || ''), input.content ?? input.new_string ?? '');
  if (reason) deny(reason);
}

process.exit(0);

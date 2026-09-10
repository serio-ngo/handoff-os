#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCOUNT_NUMBER, ANYWHERE, AT_HEAD, BIG_FILE_BYTES, CONNECTOR_ALLOW, DESTRUCTIVE, FIXTURES,
  THINK_ESCALATION, WORKFLOW_AGENT_CALL, UNBOUNDED_FANOUT,
  GH_MUTATION, GIT_DESTRUCTIVE, GIT_WRITE, INTERPRETER_EGRESS, MAX_PER_WAVE, MODEL_TIERS,
  DENY_SUBAGENT_DEFAULT, OUTWARD, OUTWARD_PREFIX, SECRET_NAMES, SECRET_PATHS, ORG_NAMES, ORG_PATHS, DISPOSABLE, QUALITY, READ_CEILING_BYTES, READ_PREFIX,
  MODEL_BEARING, RESTORATIVE, REVIEW, SHELL_DESTRUCTIVE, SHELL_INNER, SHELL_PREFIX, SHELL_QUOTED,
  SHELL_INNER_BARE, ENCODED_CMD, NO_OP_FLAG,
  SHELL_WRITE_TARGET, SHELLS, SPAWN_TEXT, SPAWN_TOOLS, deniedSubagentRx,
  SQL_DESTRUCTIVE, STRONG, WAVE_MS, WEB_FETCH_SERVER, WHOLE_FILE_READ, WRITE_VERBS,
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
  const lockGit = process.env.HANDOFF_LOCK_GIT === '1';
  for (const rx of ANYWHERE) if (rx.test(command)) return `blocked a metered-credential assignment (${rx.source.slice(0, 40)})`;
  for (const segment of segments(command).map(unwrap)) {
    if (NO_OP_FLAG.test(segment.replace(/'[^']*'|"[^"]*"/g, ' '))) continue;
    const quoted = `blocked "${segment.slice(0, 80)}"`;
    for (const rx of GIT_DESTRUCTIVE) {
      if (rx.test(segment)) return `${quoted} — git merge and git delete are human-only`;
    }
    for (const rx of SHELL_DESTRUCTIVE) {
      if (rx.test(segment) && !onlyDisposable(segment)) {
        return `${quoted} — delete is human-only outside build and temp paths. Move it aside instead`;
      }
    }
    if (lockGit) {
      for (const rx of GIT_WRITE) {
        if (rx.test(segment)) return `${quoted} — git is locked. Run npm run sync without --lock git to write`;
      }
    }
    for (const rx of AT_HEAD) {
      if (rx.test(segment)) return `${quoted} — outward action, human-only`;
    }
    if (GH_MUTATION.test(segment)) return `${quoted} — a gh api call carrying fields writes, human-only`;
    if (INTERPRETER_EGRESS.test(segment)) return `${quoted} — an interpreter one-liner posting over the network, human-only`;
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

function wholeFileReads(command) {
  const out = [];
  for (const chunk of pipelines(command)) {
    if (/[|`]/.test(chunk) || chunk.includes('$(')) continue;
    const hit = WHOLE_FILE_READ.exec(unwrap(chunk));
    if (hit && !hit[1].startsWith('-')) out.push(hit[1]);
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

function readBudget(payload, input) {
  const file = String(input.file_path || '');
  if (!file) return;
  const sliced = input.offset !== undefined || input.limit !== undefined;
  let stats;
  try { stats = statSync(file); } catch { return; }

  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const actor = actorOf(payload);
  const resolved = path.resolve(file);
  const key = `${actor}|${resolved}`;
  const fingerprint = `${stats.mtimeMs}:${stats.size}`;

  const refuse = (action, bucket, tag, message) => {
    const stamp = `${fingerprint}:${tag}`;
    if (state.reads[`${actor}|x:${resolved}`] !== stamp) {
      state.reads[`${actor}|x:${resolved}`] = stamp;
      state.saved[action] += 1;
      state.saved[bucket] += stats.size;
    }
    save(root, session, state);
    throw new Blocked(`READ BUDGET: ${message}\n`);
  };

  if (!sliced && state.reads[key] === fingerprint) {
    refuse('rereads', 'bytes', 'r',
      `${path.basename(file)} is unchanged and already in context. Read a slice with offset/limit if you need one region.`);
  }

  if (!sliced && stats.size > BIG_FILE_BYTES) {
    refuse('slices', 'deferred', 's',
      `${path.basename(file)} is ${Math.round(stats.size / 1024)}KB, over the ${BIG_FILE_BYTES / 1024}KB whole-file limit. Read the region you need with offset/limit, or dispatch handoff-os:scout to answer from it.`);
  }

  if (!sliced && actor === 'main' && (state.read_bytes || 0) >= READ_CEILING_BYTES) {
    refuse('slices', 'deferred', 'c',
      `${Math.round((state.read_bytes || 0) / 1024)}KB of whole files read into this thread, over the ${READ_CEILING_BYTES / 1024}KB ceiling. Read a slice with offset/limit, dispatch handoff-os:scout, or /compact to reset it.`);
  }

  if (!sliced) {
    state.reads[key] = fingerprint;
    if (actor === 'main') {
      state.read_bytes = (state.read_bytes || 0) + stats.size;
      state.saved.read += stats.size;
    } else state.saved.offload += stats.size;
  }
  save(root, session, state);
}

function invalidateQueries(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  let dropped = 0;
  const scope = `${actorOf(payload)}|q:`;
  for (const key of Object.keys(state.reads)) {
    if (key.startsWith(scope)) { delete state.reads[key]; dropped += 1; }
  }
  if (dropped) save(root, session, state);
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
    throw new Blocked(`READ BUDGET: this exact ${tool} already ran and nothing has been written since. Change the query, or read the file you are checking.\n`);
  }
  if (tool === 'Grep' && input.output_mode === 'content' && input.head_limit === undefined) {
    if (!state.reads[`${key}|cap`]) state.saved.caps += 1;
    state.reads[`${key}|cap`] = 1;
    save(root, session, state);
    throw new Blocked('READ BUDGET: set head_limit on a content-mode Grep so the match list cannot run away (30 is plenty).\n');
  }
  state.reads[key] = 1;
  save(root, session, state);
}

function claimSlot(dir, bucket, cap) {
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
    return `blocked an account number in ${how} to ${file} — keep it in memory.md, never in git`;
  }
  return null;
}

function deniedVerdict(text, hit) {
  if (REVIEW.test(text)) return `blocked a ${hit} review. Review goes to sonnet; ${hit} is for prose you publish`;
  if (!QUALITY.test(text)) {
    return `blocked a ${hit} subagent. Research and review go to sonnet; ${hit} needs QUALITY: writing|creative|legal|security in the prompt`;
  }
  return null;
}

function dispatchBudget(input, tool = 'Agent', denied = deniedSubagentRx(process.env.HANDOFF_DENY_SUBAGENT_MODELS ?? DENY_SUBAGENT_DEFAULT)) {
  const model = String(input.model || '').trim();
  const text = SPAWN_TEXT.map((key) => input[key]).filter((value) => typeof value === 'string').join(' ');
  if (!model) {
    if (!MODEL_BEARING.includes(tool)) {
      const hit = (text.match(denied) || [])[0]?.toLowerCase();
      return hit ? deniedVerdict(text, hit) : null;
    }
    return 'blocked a subagent dispatch that names no model. Set one: haiku for lookups, sonnet for research and review, opus or fable only for prose you publish';
  }
  if (!MODEL_TIERS.test(model)) {
    return `blocked a subagent dispatch whose model "${model}" names no tier. Use haiku, sonnet, opus or fable`;
  }
  const hit = (model.match(denied) || [])[0]?.toLowerCase();
  return hit ? deniedVerdict(text, hit) : null;
}

function costBudget(input, tool) {
  const text = SPAWN_TEXT.map((key) => input[key]).filter((value) => typeof value === 'string').join(' ');
  if (QUALITY.test(text)) return null;
  const think = (text.match(THINK_ESCALATION) || [])[0];
  if (think) return `blocked a dispatch asking for "${think}". Drop it, or name QUALITY: writing|creative|legal|security`;
  const fan = tool === 'Workflow' ? (String(input.script ?? '').match(UNBOUNDED_FANOUT) || [])[0] : null;
  return fan
    ? `blocked a workflow fanning out through "${fan.trim()}" — the script never states its agent count. List the agents, ${MAX_PER_WAVE} to a wave`
    : null;
}

const agentsRequested = (input, tool) => (tool === 'Workflow'
  ? Math.max(1, (String(input.script ?? '').match(WORKFLOW_AGENT_CALL) || []).length)
  : 1);

function fanOutCap(payload, count = 1) {
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const bucket = Math.floor(Date.now() / WAVE_MS);
  let slot = 0;
  for (let n = 0; n < count; n += 1) slot = claimSlot(dir, bucket, MAX_PER_WAVE);
  if (slot > MAX_PER_WAVE) {
    bump(payload, 'blocked');
    throw new Blocked(`FAN-OUT CAP: subagent ${slot}, wave capped at ${MAX_PER_WAVE}. Read the returns, then relaunch via /handoff-os:research-budget.\n`);
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

export function judge(payload = {}) {
  const tool = String(payload.tool_name || '');
  const input = payload.tool_input || {};
  current = payload;

  if (tool === 'Read') readBudget(payload, input);
  else if (tool === 'Grep' || tool === 'Glob') queryBudget(payload, input, tool);
  else if (SPAWN_TOOLS.includes(tool)) {
    const verdict = dispatchBudget(input, tool) || costBudget(input, tool);
    if (verdict) deny(verdict, 'DISPATCH BUDGET');
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
    if (targets.length) invalidateQueries(payload);
    for (const target of wholeFileReads(command)) {
      readBudget(payload, { file_path: path.resolve(payload.cwd || process.cwd(), target.replace(/^['"]|['"]$/g, '')) });
    }
  } else if (tool.startsWith('mcp__')) {
    const action = tool.split('__').slice(2).join('__').toLowerCase();
    if ((process.env.HANDOFF_MCP_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).includes(action)) return;
    if (SQL_DESTRUCTIVE.test(JSON.stringify(input))) {
      deny(`blocked ${tool} — the payload carries a destructive SQL statement, human-only`);
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
      deny(`blocked ${tool} — matched "${hit}": leaves the org or destroys a record, human-only`);
    }
    const rawFetch = WEB_FETCH_SERVER.test(tool.split('__')[1] || '')
      && (READ_PREFIX.test(dashed) || /(?:scrape|crawl|extract|search)/.test(action));
    if (rawFetch) {
      deny(`blocked ${tool} — a raw page fetch. Use WebFetch, WebSearch or handoff-os:scout`);
    }
  } else if (tool === 'Edit' || tool === 'Write') {
    invalidateQueries(payload);
    const reason = judgeWrite(String(input.file_path || ''), input.content ?? input.new_string ?? '');
    if (reason) deny(reason);
  }
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

  try {
    judge(payload);
  } catch (error) {
    if (error instanceof Blocked) { process.stderr.write(error.message); process.exit(2); }
    throw error;
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

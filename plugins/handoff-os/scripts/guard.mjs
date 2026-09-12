#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIG_FILE_BYTES, CONNECTOR_ALLOW, DESTRUCTIVE, OUTWARD, OUTWARD_PREFIX, READ_PREFIX,
  RESTORATIVE, SPAWN_TOOLS, SQL_DESTRUCTIVE, STRONG, WEB_FETCH_SERVER, WRITE_TOOLS, WRITE_VERBS,
} from './patterns.mjs';
import { bump, load, rootOf, sessionOf } from './ledger.mjs';
import { Blocked } from './lib/dispatch.mjs';
import { judgeShell, shellQuote, shellReads, shellWriteTargets } from './lib/shell.mjs';
import { bookSlice, kb, noteWrite, queryBudget, readBudget, unbook } from './lib/reads.mjs';
import { agentsRequested, bookRedirect, costBudget, dispatchBudget, fanOutCap, receipt } from './lib/dispatch.mjs';
import { judgeWrite } from './lib/writes.mjs';

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

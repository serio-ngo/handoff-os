#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { load, rootOf, save, sessionOf } from './ledger.mjs';

const MAX_PER_WAVE = 3;
const WAVE_MS = 90 * 1000;
const BIG_FILE_BYTES = 24 * 1024;
const SHELLS = /^(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)\b/i;

const GIT_OUT = [
  /^git\b(?:\s+(?:-[Cc]\s+\S+|--\S+(?:[=\s]\S+)?))*\s+push\b/i,
  /^git\s+remote\s+(?:add|set-url)\b/i,
];

const AT_HEAD = [
  ...GIT_OUT,
  /^(?:npm|yarn|pnpm)\s+publish\b/i,
  /^gh\s+(?:pr\s+(?:create|merge)|issue\s+create|release\s+create)\b/i,
  /^gh\s+api\b[^\n]*(?:-X|--method)[\s=]*(?:POST|PUT|PATCH|DELETE)/i,
  /^(?:curl|wget)\b[^\n]*(?:-X[\s=]*(?:POST|PUT|PATCH|DELETE)|--request[\s=]*(?:POST|PUT|PATCH|DELETE)|\s-d\b|--data|\s-F\b|--form|--upload-file|\s-T\b|--post-data|--post-file)/i,
  /^(?:Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b[^\n]*(?:-Method[\s=]*(?:Post|Put|Patch|Delete)|-Body\b|-InFile\b)/i,
  /^scp\b/i,
  /^rsync\b[^\n]*(?:\S+@\S+:|rsync:\/\/|::)/i,
  /^ssh\b(?!-)/i,
  /^(?:sendmail|mailx|msmtp)\b/i,
  /^(?:az|aws|gcloud|wrangler|vercel|netlify)\b[^\n]*\b(?:deploy|publish)\b/i,
  /^twine\s+upload\b/i,
  /^cargo\s+publish\b/i,
  /^docker\s+push\b/i,
  /^terraform\s+apply\b/i,
];

const ANYWHERE = [
  /(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)\s*[=:]/i,
  /\b(?:setx|set|export|env|\$env:)\b[^\n]{0,40}(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)/i,
];

const OUTWARD = ['send', 'email', 'mail', 'publish', 'publication', 'post', 'tweet', 'invite',
  'share', 'submit', 'submission', 'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast',
  'deploy', 'release', 'reply', 'forward', 'redirect', 'resend', 'notif', 'respond', 'rsvp', 'spam'];
const DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive', 'revoke', 'unshare'];
const STRONG = ['send', 'pay', 'charge', 'invoice', 'checkout', 'publish', 'publication', 'submit',
  'submission', 'deploy', 'tweet', 'broadcast', 'resend', 'delete', 'trash', 'purge', 'destroy',
  'revoke', 'unshare'];
const OUTWARD_PREFIX = /^request[-_]/;
const READ_PREFIX = /^(?:list|get|search|read|fetch|find|describe|count|preview|resolve|export)[-_]/;
const RESTORATIVE = /^un(?:trash|archive|delete|hide|mark)[-_]/;
const CONNECTOR_ALLOW = [
  /(?:^|[-_])reply[-_]to[-_]comment(?:[-_]|$)/,
  /(?:^|[-_])remove[-_](?:background|bg)(?:[-_]|$)/,
];

const PROTECTED_PATHS = [
  /(^|[/\\])canon[/\\][^/\\]*\.(?:json|ya?ml|csv|tsv)$/i,
  /\.env(\.[^/\\]*)?$/i,
  /(^|[/\\])secrets?[/\\]/i,
];
const PROTECTED_NAMES = [
  /^(?:org|brands|systems|facts|canon|beneficiar\w*|contacts)\.(?:json|ya?ml|csv|tsv)$/i,
  /^(?:logo|favicon|og-image|brand-kit|brandmark)/i,
  /credential/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /^id_(?:rsa|ed25519|ecdsa)/i,
];
const FIXTURES = [
  /(^|[/\\])(?:tests?|__tests__|fixtures?)[/\\]/i,
  /(^|[/\\])test-[^/\\]*$/i,
  /\.(?:test|spec)\.[a-z]+$/i,
  /(^|[/\\])(?:temp|tmp|scratchpad)[/\\]/i,
];
const ACCOUNT_NUMBER = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;

const deny = (reason) => {
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

function judgeShell(command, depth = 0) {
  const allowGit = process.env.HANDOFF_ALLOW_GIT === '1';
  for (const rx of ANYWHERE) if (rx.test(command)) return `blocked a metered-credential assignment (${rx.source.slice(0, 40)})`;
  for (const segment of segments(command)) {
    for (const rx of AT_HEAD) {
      if (allowGit && GIT_OUT.includes(rx)) continue;
      if (rx.test(segment)) return `blocked "${segment.slice(0, 80)}" — an outward action, the human performs it`;
    }
    if (depth < 2 && SHELLS.test(segment)) {
      const inner = (/(?:^|\s)-c\s+(['"])([\s\S]*)\1\s*$/.exec(segment) || [])[2];
      if (inner) {
        const verdict = judgeShell(inner, depth + 1);
        if (verdict) return verdict;
      }
    }
  }
  return null;
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
    save(root, session, state);
    process.stderr.write(`READ BUDGET: ${path.basename(file)} is ${Math.round(stats.size / 1024)}KB, over the ${BIG_FILE_BYTES / 1024}KB whole-file limit. Read the region you need with offset/limit, or dispatch handoff-os:scout to answer from it.\n`);
    process.exit(2);
  }

  if (!sliced) state.reads[key] = fingerprint;
  save(root, session, state);
}

function fanOutCap(payload) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const now = Date.now();
  if (!state.wave || now - state.wave.first >= WAVE_MS) state.wave = { count: 0, first: now };
  state.wave.count += 1;
  if (!save(root, session, state)) process.exit(0);
  if (state.wave.count > MAX_PER_WAVE) {
    process.stderr.write(`FAN-OUT CAP: subagent ${state.wave.count} of a wave capped at ${MAX_PER_WAVE} (law 7). Read what the first ${MAX_PER_WAVE} returned, then launch the next wave. Procedure: /handoff-os:research-budget.\n`);
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

if (tool === 'Read') readBudget(payload, input);
else if (tool === 'Agent') fanOutCap(payload);
else if (tool === 'Bash' || tool === 'PowerShell') {
  if ('command' in input && typeof input.command !== 'string') deny('blocked a shell call whose command was not a string');
  const verdict = judgeShell(typeof input.command === 'string' ? input.command : '');
  if (verdict) deny(verdict);
} else if (tool.startsWith('mcp__')) {
  const action = tool.split('__').slice(2).join('__').toLowerCase();
  const dashed = action.replace(/_/g, '-');
  const strong = STRONG.some((verb) => action.includes(verb));
  const hit = DESTRUCTIVE.find((verb) => action.includes(verb))
    || OUTWARD.find((verb) => action.includes(verb))
    || (OUTWARD_PREFIX.test(dashed) ? 'request' : undefined);
  const allowed = RESTORATIVE.test(dashed)
    || (READ_PREFIX.test(dashed) && !strong)
    || CONNECTOR_ALLOW.some((rx) => rx.test(dashed));
  if (hit && !allowed) {
    deny(`blocked ${tool} — matched "${hit}", an action that leaves the org or destroys a record. The human performs it`);
  }
} else if (tool === 'Edit' || tool === 'Write') {
  const file = String(input.file_path || '');
  const base = file.split(/[/\\]/).pop() || '';
  const guarded = PROTECTED_PATHS.some((rx) => rx.test(file)) || PROTECTED_NAMES.some((rx) => rx.test(base));
  if (guarded) deny(`blocked a write to ${file} — brand-locked or secret-bearing`);
  if (!/(^|[/\\])memory\.md$/i.test(file) && !FIXTURES.some((rx) => rx.test(file)) && ACCOUNT_NUMBER.test(String(input.content ?? input.new_string ?? ''))) {
    deny(`blocked an account number in a write to ${file} — keep it in memory.md, never in git`);
  }
}

process.exit(0);

#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MAX_PER_WAVE = 3;
const WAVE_MS = 90 * 1000;
const SHELLS = /^(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)\b/i;

const AT_HEAD = [
  /^git\b(?:\s+(?:-[Cc]\s+\S+|--\S+(?:[=\s]\S+)?))*\s+push\b/i,
  /^git\s+remote\s+(?:add|set-url)\b/i,
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

const OUTWARD = ['send', 'email', 'mail', 'publish', 'post', 'tweet', 'invite', 'share', 'submit',
  'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast', 'deploy', 'release', 'reply',
  'forward', 'redirect', 'resend', 'notif'];
const DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive', 'revoke', 'unshare'];
const CONNECTOR_ALLOW = [
  /^un(?:trash|archive|delete|hide)/,
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
  for (const rx of ANYWHERE) if (rx.test(command)) return `blocked a metered-credential assignment (${rx.source.slice(0, 40)})`;
  for (const segment of segments(command)) {
    for (const rx of AT_HEAD) {
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
  if (input.offset !== undefined || input.limit !== undefined) return;
  const file = String(input.file_path || '');
  if (!file) return;
  let fingerprint;
  try {
    const stats = statSync(file);
    fingerprint = `${stats.mtimeMs}:${stats.size}`;
  } catch { return; }

  const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  const store = path.join(root, '.claude', `.reads-${session}.json`);
  let seen = {};
  try { seen = JSON.parse(readFileSync(store, 'utf8')); } catch { seen = {}; }

  const key = path.resolve(file);
  if (seen[key] === fingerprint) {
    process.stderr.write(`READ BUDGET: ${path.basename(file)} is unchanged and already in context. Read a slice with offset/limit if you need one region.\n`);
    process.exit(2);
  }
  seen[key] = fingerprint;
  try {
    mkdirSync(path.dirname(store), { recursive: true });
    writeFileSync(store, JSON.stringify(seen), 'utf8');
  } catch { }
}

function fanOutCap(payload) {
  const root = process.env.HANDOFF_OS_DIR || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  const store = path.join(root, '.claude', `.wave-${session}.json`);
  const now = Date.now();
  let state = { count: 0, first: now };
  try {
    const prior = JSON.parse(readFileSync(store, 'utf8'));
    if (now - prior.first < WAVE_MS) state = prior;
  } catch { }
  state.count += 1;
  try {
    mkdirSync(path.dirname(store), { recursive: true });
    writeFileSync(store, JSON.stringify(state), 'utf8');
  } catch {
    process.exit(0);
  }
  if (state.count > MAX_PER_WAVE) {
    process.stderr.write(`FAN-OUT CAP: subagent ${state.count} of a wave capped at ${MAX_PER_WAVE} (law 7). Read what the first ${MAX_PER_WAVE} returned, then launch the next wave. Procedure: /handoff-os:research-budget.\n`);
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
  const hit = DESTRUCTIVE.find((verb) => action.includes(verb)) || OUTWARD.find((verb) => action.includes(verb));
  if (hit && !CONNECTOR_ALLOW.some((rx) => rx.test(action.replace(/_/g, '-')))) {
    deny(`blocked ${tool} — matched "${hit}", an action that leaves the org or destroys a record. The human performs it`);
  }
} else if (tool === 'Edit' || tool === 'Write') {
  const file = String(input.file_path || '');
  const base = file.split(/[/\\]/).pop() || '';
  const guarded = PROTECTED_PATHS.some((rx) => rx.test(file)) || PROTECTED_NAMES.some((rx) => rx.test(base));
  if (guarded) deny(`blocked a write to ${file} — brand-locked or secret-bearing`);
  if (!FIXTURES.some((rx) => rx.test(file)) && ACCOUNT_NUMBER.test(String(input.content ?? input.new_string ?? ''))) {
    deny(`blocked an account number in a write to ${file} — no org data in git, read it live via /handoff-os:canon`);
  }
}

process.exit(0);

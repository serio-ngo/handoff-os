#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const EGRESS_COMMANDS = [
  /(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)\s*[=:]/i,
  /\b(?:setx|set|export|env|\$env:)\b[^\n]{0,40}(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)/i,
  /\bgit\b(?:\s+(?:-C\s+\S+|-c\s+\S+|--git-dir[=\s]\S+|--work-tree[=\s]\S+|--no-pager|--exec-path[=\s]\S+))*\s+push\b/i,
  /\bgit\s+remote\s+(add|set-url)\b/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\bgh\s+pr\s+(create|merge)\b/i,
  /\bgh\s+issue\s+create\b/i,
  /\bgh\s+release\s+create\b/i,
  /\bgh\s+api\b[^\n]*(-X|--method)[\s=]*(POST|PUT|PATCH|DELETE)/i,
  /\b(curl|wget)\b[^\n]*(-X[\s=]*(POST|PUT|PATCH|DELETE)|--request[\s=]*(POST|PUT|PATCH|DELETE)|-d\b|--data|-F\b|--form|--upload-file|-T\b|--post-data|--post-file)/i,
  /\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b[^\n]*(-Method[\s=]*(Post|Put|Patch|Delete)|-Body\b|-InFile\b)/i,
  /\bscp\b/i,
  /\brsync\b[^\n]*(\S+@\S+:|rsync:\/\/|::)/i,
  /\bssh\b(?!-)/i,
  /\b(sendmail|mailx|msmtp)\b/i,
  /\b(az|aws|gcloud|wrangler|vercel|netlify)\b[^\n]*\b(deploy|publish)\b/i,
  /\btwine\s+upload\b/i,
  /\bcargo\s+publish\b/i,
  /\bdocker\s+push\b/i,
  /\bterraform\s+apply\b/i,
];

const MCP_OUTWARD = ['send', 'email', 'mail', 'publish', 'post', 'tweet', 'invite',
  'share', 'submit', 'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast',
  'deploy', 'release', 'reply', 'forward', 'redirect', 'resend', 'notif'];

const MCP_DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive',
  'revoke', 'unshare'];

const MCP_EXPLICIT_ALLOW = [
  'export-design', 'get-export-formats',
  'comment-on-design', 'reply-to-comment', 'list-comments', 'list-replies',
  'request-outline-review',
  'image-remove-background', 'untrash-message', 'untrash-thread',
];

const PROTECTED_PATHS = [
  /(^|[\/\\])canon[\/\\]/i,
  /\.env(\.[^\/\\]*)?$/i,
  /(^|[\/\\])secrets?[\/\\]/i,
];

const PROTECTED_BASENAMES = [
  /^(org|brands|systems|facts|canon|beneficiar\w*|contacts)\.(json|ya?ml|csv|tsv)$/i,
  /^(logo|favicon|og-image|brand-kit|brandmark)/i,
  /credential/i,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|ed25519|ecdsa)/i,
];

const FIXTURE_PATHS = [
  /(^|[\/\\])(tests?|__tests__|fixtures?)[\/\\]/i,
  /(^|[\/\\])test-[^\/\\]*$/i,
  /\.(test|spec)\.[a-z]+$/i,
  /(^|[\/\\])(temp|tmp|scratchpad)[\/\\]/i,
];

const SECRET_LITERALS = [
  /\bPL\d{26}\b/,
  /\b[A-Z]{2}\d{2} ?\d{4} ?\d{4} ?\d{4} ?\d{4} ?\d{4} ?\d{2}\b/,
];

function deny(pattern, what, reason = 'this is an outward or brand-locked action, the human performs it, not the agent.') {
  process.stderr.write(
    `EGRESS LOCK: blocked ${what} on pattern ${pattern} - ${reason}\n`
  );
  process.exit(2);
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { raw = ''; }
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  if (/"tool_name"\s*:\s*"(Bash|PowerShell)"/.test(raw)) {
    deny('unparseable-shell-payload', 'a shell command whose hook payload could not be parsed');
  }
  process.stderr.write('EGRESS LOCK: hook payload unparseable, failing open.\n');
  process.exit(0);
}

const tool = String(payload.tool_name || '');
const input = payload.tool_input || {};

if (tool === 'Bash' || tool === 'PowerShell') {
  if ('command' in input && typeof input.command !== 'string') {
    deny('non-string-command', 'a shell call whose command field was not a string');
  }
  const cmd = typeof input.command === 'string' ? input.command : '';
  for (const rx of EGRESS_COMMANDS) {
    if (rx.test(cmd)) deny(String(rx), `shell command "${cmd.slice(0, 100)}"`);
  }
  process.exit(0);
}

if (tool.startsWith('mcp__')) {
  const action = tool.split('__').slice(2).join('__').toLowerCase();
  const destructiveHit = MCP_DESTRUCTIVE.find((s) => action.includes(s));
  const outwardHit = MCP_OUTWARD.find((s) => action.includes(s));
  const hit = destructiveHit || outwardHit;
  if (!hit) process.exit(0);
  if (MCP_EXPLICIT_ALLOW.includes(action.replace(/_/g, '-'))) process.exit(0);
  const reason = destructiveHit
    ? `matched destructive verb "${hit}" - this is a destructive action (irreversible loss), the human performs it, not the agent.`
    : `matched outward verb "${hit}" - this is an outward action (leaves the org), the human performs it, not the agent.`;
  deny(hit, `connector tool ${tool}`, reason);
}

if (tool === 'Edit' || tool === 'Write') {
  const p = String(input.file_path || '');
  const base = p.split(/[\/\\]/).pop() || '';
  for (const rx of PROTECTED_PATHS) {
    if (rx.test(p)) deny(String(rx), `write to ${p}`);
  }
  for (const rx of PROTECTED_BASENAMES) {
    if (rx.test(base)) deny(String(rx), `write to ${p}`);
  }

  const body = String(input.content ?? input.new_string ?? '');
  if (FIXTURE_PATHS.some((rx) => rx.test(p))) process.exit(0);
  for (const rx of SECRET_LITERALS) {
    if (rx.test(body)) {
      deny(String(rx), `secret literal in a write to ${p}`,
        'no secrets in git - ever. one home per fact: the live source. read it via /handoff-os:canon.');
    }
  }
}

process.exit(0);

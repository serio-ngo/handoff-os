import { gitWriteAllowed } from './limits.mjs';
import { segments, unwrap } from './shell-parse.mjs';

const GIT = String.raw`^git\b(?:\s+(?:-[Cc]\s+\S+|--\S+(?:[=\s]\S+)?))*\s+`;
const git = (tail) => new RegExp(GIT + tail, 'i');

const MERGE_OR_DELETE = [
  git(String.raw`merge(?![-\w])`),
  git(String.raw`rm\b`),
  git(String.raw`(?:branch|tag)\b[^\n]*\s-(?:[dD]|-delete)\b`),
  git(String.raw`push\b[^\n]*\s(?:--delete|-d|--force|-f)\b`),
  git(String.raw`push\b[^\n]*\s\+\S+:`),
  git(String.raw`remote\s+(?:remove|rm|delete)\b`),
  git(String.raw`stash\s+(?:drop|clear)\b`),
  git(String.raw`clean\b[^\n]*\s-[A-Za-z]*[fdx]`),
  git(String.raw`reset\b[^\n]*--hard\b`),
];

// `git branch` and `git tag` both create and list; a listing flag means the reading form.
// Scoped to those two subcommands: --merged on a checkout, --verify on a commit still write.
const GIT_LISTING = /^git\b[^\n]*\s(?:branch|tag)\b[^\n]*\s--(?:contains|no-contains|list|show-current|points-at|merged|no-merged)\b/i;

const GIT_STATE_CHANGE = [
  git(String.raw`push\b`),
  git(String.raw`branch(?:\s+-[A-Za-z-]+)*\s+[^-\s]`),
  git(String.raw`commit\b`),
  git(String.raw`add\b`),
  git(String.raw`rebase\b`),
  git(String.raw`revert\b`),
  git(String.raw`cherry-pick\b`),
  git(String.raw`reset\b`),
  git(String.raw`checkout\b`),
  git(String.raw`switch\b`),
  git(String.raw`restore\b`),
  git(String.raw`stash\b`),
  git(String.raw`tag\b`),
  git(String.raw`remote\s+(?:add|set-url)\b`),
];

const LEAVES_THE_MACHINE = [
  /^(?:npm|yarn|pnpm)\s+publish\b/i,
  /^gh\s+(?:pr\s+merge|issue\s+create|release\s+create)\b/i,
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

const DELETES = [
  /^rm\b/i,
  /^rmdir\b/i,
  /^shred\b/i,
  /^truncate\b/i,
  /^(?:del|erase)\b/i,
  /^Remove-Item\b/i,
  /^(?:ri|rd)\b/i,
  /^find\b[^\n]*\s-delete\b/,
];

const DISPOSABLE = /(?:^|[/\\])(?:node_modules|dist|build|out|coverage|target|vendor|tmp|temp|scratchpad|\.next|\.nuxt|\.turbo|\.cache|\.venv|\.pytest_cache|__pycache__)(?:[/\\]|$)|\.(?:log|tmp|pyc|o|class|tsbuildinfo)$/i;

const GH_MUTATION = /^gh\s+api\b[^\n]*(?:\s-[fF]\b|--field|--raw-field|\bgraphql\b[^\n]*mutation)/i;
const INTERPRETER_EGRESS = /^(?:python[\d.]*|node|deno|bun|ruby|perl|php)\b[^\n]*\s--?(?:c|e|eval)\b[\s\S]*(?:requests\.(?:post|put|patch|delete)|urllib\.request|http\.client|fetch\s*\(|axios|smtplib|Net::HTTP|curl_exec)/i;
const NO_OP_FLAG = /(?:^|\s)(?:--help|--version|--dry-run|--dryrun|-WhatIf)(?:[=\s]|$)/i;

const SHELLS = /^(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)\b/i;
const SHELL_INNER = /(?:^|\s)(?:-{1,2}(?:command|[a-z]*c)|\/(?:command|c))\s+(['"])([\s\S]*)\1\s*$/i;
const SHELL_INNER_BARE = /(?:^|\s)(?:-{1,2}(?:command|[a-z]*c)|\/(?:command|c))\s+()(?!['"])([\s\S]+)$/i;
const ENCODED_CMD = /(?:^|\s)-e(?:c|nc(?:odedcommand)?)?\s+([A-Za-z0-9+/=]{16,})(?:\s|$)/i;

const CREDENTIALS = 'ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper';
const METERED_CREDENTIAL = [
  new RegExp(`(?:${CREDENTIALS})["']?\\s*[=:]`, 'i'),
  new RegExp(`\\b(?:setx|export|\\$env:)\\b[^\\n]{0,40}(?:${CREDENTIALS})\\b\\s*[=:]?\\s*\\S`, 'i'),
];

// A discard sink or an fd dup stores nothing: neither is a write.
const DISCARD_TARGET = /^(?:&\d+|\$null|\/dev\/(?:null|stdout|stderr|tty)|nul:?)$/i;

export const SHELL_WRITE_TARGET = [
  /(?:^|\s)(?:\d?>>?|&>)\s*['"]?([^'"\s]+)/,
  /\btee\s+(?:-a\s+)?['"]?([^'"\s]+)/,
  /\bsed\b[^\n]*\s-i\S*\s+(?:-\S+\s+)*(?:'[^']*'\s+|"[^"]*"\s+)?['"]?([^'"\s]+)/,
];

function onlyDisposable(segment) {
  const operands = segment.split(/\s+/).slice(1)
    .filter((token) => !/^-|^\/[A-Za-z]$|^\d+$/.test(token))
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return operands.length > 0 && operands.every((token) => DISPOSABLE.test(token));
}

function innerCommand(segment) {
  const encoded = (ENCODED_CMD.exec(segment) || [])[1];
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf16le');
  return (SHELL_INNER.exec(segment) || SHELL_INNER_BARE.exec(segment) || [])[2];
}

export function judgeShell(command, depth = 0) {
  for (const rx of METERED_CREDENTIAL) {
    if (rx.test(command)) return 'blocked a metered-credential assignment';
  }
  for (const segment of segments(command).map(unwrap)) {
    if (NO_OP_FLAG.test(segment.replace(/'[^']*'|"[^"]*"/g, ' '))) continue;
    const quoted = `blocked "${segment.slice(0, 80)}"`;

    for (const rx of MERGE_OR_DELETE) if (rx.test(segment)) return `${quoted} — merge or delete`;
    for (const rx of DELETES) {
      if (rx.test(segment) && !onlyDisposable(segment)) return `${quoted} — delete outside build and temp paths`;
    }
    if (!gitWriteAllowed() && !GIT_LISTING.test(segment)) {
      for (const rx of GIT_STATE_CHANGE) if (rx.test(segment)) return `${quoted} — a git write`;
    }
    for (const rx of LEAVES_THE_MACHINE) if (rx.test(segment)) return `${quoted} — outward action`;
    if (GH_MUTATION.test(segment)) return `${quoted} — a gh api write`;
    if (INTERPRETER_EGRESS.test(segment)) return `${quoted} — posts over the network`;

    if (depth < 2 && SHELLS.test(segment)) {
      const inner = innerCommand(segment);
      const verdict = inner && judgeShell(inner, depth + 1);
      if (verdict) return verdict;
    }
  }
  return null;
}

export function shellWriteTargets(command) {
  const out = [];
  for (const segment of segments(command)) {
    for (const rx of SHELL_WRITE_TARGET) {
      const hit = rx.exec(segment);
      if (hit && hit[1] && !DISCARD_TARGET.test(hit[1])) out.push(hit[1]);
    }
  }
  return out;
}

export const MAX_PER_WAVE = 3;
export const WAVE_MS = 90 * 1000;
export const THINK_ESCALATION = /\b(?:ultrathink|megathink|think\s+(?:hard(?:er)?|deeply)|(?:reasoning[-_ ]?)?effort\s*[=:]\s*(?:high|xhigh|max))\b/i;
export const WORKFLOW_AGENT_CALL = /(?<![.\w$])agent\s*\(/g;
export const UNBOUNDED_FANOUT = /\b(?:parallel|pipeline|Promise\s*\.\s*all(?:Settled)?)\s*\(/;
// the declaration that makes a fan-out countable, so the wave cap can count it
export const FANOUT_BUDGET = /(?:^|\n)\s*\/\/\s*AGENTS:\s*(\d+)\b/;
export const BIG_FILE_BYTES = 24 * 1024;
export const GREP_HEAD_LIMIT = 50;
export const BASH_OUTPUT_CAP = 30000;
export const READ_CEILING_BYTES = 500 * 1024;
export const DELEGATE_BYTES = 150 * 1024;
export const WHOLE_FILES_MAX = 8;
export const DENY_SUBAGENT_DEFAULT = 'opus,fable';
export function deniedSubagentRx(raw = DENY_SUBAGENT_DEFAULT) {
  const names = String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return /(?!)/;
  const esc = names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(?:${esc})\\b`, 'i');
}
export const QUALITY = /\bQUALITY:\s*(?:writing|creative|legal|security)\b/;
export const REVIEW = /\b(?:review|audit)(?:s|ed|ing|er|ers|or|ors)?\b/i;
export const SPAWN_TOOLS = ['Agent', 'Task', 'TaskCreate', 'Workflow'];
export const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'];
export const MODEL_BEARING = ['Agent', 'Task'];
export const SPAWN_TEXT = ['prompt', 'description', 'subagent_type', 'subject', 'script', 'name', 'title'];
export const SHELLS = /^(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)\b/i;
export const SHELL_INNER = /(?:^|\s)(?:-{1,2}(?:command|[a-z]*c)|\/(?:command|c))\s+(['"])([\s\S]*)\1\s*$/i;
export const SHELL_INNER_BARE = /(?:^|\s)(?:-{1,2}(?:command|[a-z]*c)|\/(?:command|c))\s+()(?!['"])([\s\S]+)$/i;
export const ENCODED_CMD = /(?:^|\s)-e(?:c|nc(?:odedcommand)?)?\s+([A-Za-z0-9+/=]{16,})(?:\s|$)/i;
export const NO_OP_FLAG = /(?:^|\s)(?:--help|--version|--dry-run|--dryrun|-WhatIf)(?:[=\s]|$)/i;
export const SHELL_PREFIX = /^(?:eval|command|exec|builtin|nohup|time|nice|stdbuf|xargs)\b(?:\s+-\S+)*\s+/i;
export const SHELL_QUOTED = /^(['"])([\s\S]*)\1$/;

const GIT = String.raw`^git\b(?:\s+(?:-[Cc]\s+\S+|--\S+(?:[=\s]\S+)?))*\s+`;
const git = (tail) => new RegExp(GIT + tail, 'i');

export const GIT_DESTRUCTIVE = [
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

export const GIT_WRITE = [
  git(String.raw`push\b`),
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

export const AT_HEAD = [
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

export const SHELL_DESTRUCTIVE = [
  /^rm\b/i,
  /^rmdir\b/i,
  /^shred\b/i,
  /^truncate\b/i,
  /^(?:del|erase)\b/i,
  /^Remove-Item\b/i,
  /^(?:ri|rd)\b/i,
  /^find\b[^\n]*\s-delete\b/,
];

export const DISPOSABLE = /(?:^|[/\\])(?:node_modules|dist|build|out|coverage|target|vendor|tmp|temp|scratchpad|\.next|\.nuxt|\.turbo|\.cache|\.venv|\.pytest_cache|__pycache__)(?:[/\\]|$)|\.(?:log|tmp|pyc|o|class|tsbuildinfo)$/i;

export const GH_MUTATION = /^gh\s+api\b[^\n]*(?:\s-[fF]\b|--field|--raw-field|\bgraphql\b[^\n]*mutation)/i;

export const INTERPRETER_EGRESS = /^(?:python[\d.]*|node|deno|bun|ruby|perl|php)\b[^\n]*\s--?(?:c|e|eval)\b[\s\S]*(?:requests\.(?:post|put|patch|delete)|urllib\.request|http\.client|fetch\s*\(|axios|smtplib|Net::HTTP|curl_exec)/i;

export const SHELL_WRITE_TARGET = [
  /(?:^|\s)(?:\d?>>?|&>)\s*['"]?([^'"\s]+)/,
  /\btee\s+(?:-a\s+)?['"]?([^'"\s]+)/,
  /\bsed\b[^\n]*\s-i\S*\s+(?:-\S+\s+)*(?:'[^']*'\s+|"[^"]*"\s+)?['"]?([^'"\s]+)/,
];

const CREDENTIALS = 'ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper';
export const ANYWHERE = [
  new RegExp(`(?:${CREDENTIALS})["']?\\s*[=:]`, 'i'),
  new RegExp(`\\b(?:setx|export|\\$env:)\\b[^\\n]{0,40}(?:${CREDENTIALS})\\b\\s*[=:]?\\s*\\S`, 'i'),
];

export const OUTWARD = ['send', 'email', 'mail', 'publish', 'publication', 'post', 'tweet', 'invite',
  'share', 'submit', 'submission', 'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast',
  'deploy', 'release', 'reply', 'forward', 'redirect', 'resend', 'notif', 'respond', 'rsvp', 'spam'];
export const DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive', 'revoke', 'unshare'];
export const WRITE_VERBS = ['write', 'execute', 'truncate', 'drop', 'overwrite', 'upsert'];
export const STRONG = ['send', 'pay', 'charge', 'invoice', 'checkout', 'publish', 'publication', 'submit',
  'submission', 'deploy', 'tweet', 'broadcast', 'resend', ...DESTRUCTIVE, ...WRITE_VERBS];
export const SQL_DESTRUCTIVE = /\b(?:drop\s+(?:table|database|index|schema)|truncate\s+table|delete\s+from|alter\s+table)\b/i;
export const MODEL_TIERS = /\b(?:haiku|sonnet|opus|fable)\b/i;
// a tool with no model field selects a tier inside its script; a bare mention of the name is prose
export const MODEL_OPTION = /\bmodel\s*[:=]\s*['"`]?\s*(haiku|sonnet|opus|fable)\b/gi;
export const OUTWARD_PREFIX = /^(?:request|run|trigger|dispatch|approve)[-_]/;
export const READ_PREFIX = /^(?:list|get|search|read|fetch|find|describe|count|preview|resolve|export)[-_]/;
export const RESTORATIVE = /^un(?:trash|archive|delete|hide|mark)[-_]/;
export const CONNECTOR_ALLOW = [
  /(?:^|[-_])reply[-_]to[-_]comment(?:[-_]|$)/,
  /(?:^|[-_])remove[-_](?:background|bg)(?:[-_]|$)/,
];

export const SECRET_PATHS = [
  /\.env$/i,
  /\.env\.(?!example|sample|template|dist|schema)[^/\\]*$/i,
  /(^|[/\\])secrets?[/\\]/i,
];
export const SECRET_NAMES = [
  /^credentials?\.(?:json|ya?ml|csv|txt|ini)$/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /^id_(?:rsa|ed25519|ecdsa)/i,
];
export const ORG_PATHS = [
  /(^|[/\\])(?:brand|brand-kit|brand_assets)[/\\]/i,
];
export const ORG_NAMES = [
  /^(?:org|beneficiar\w*|contacts|donors)\.(?:json|ya?ml|csv|tsv)$/i,
];
export const FIXTURES = [
  /(^|[/\\])(?:tests?|__tests__|fixtures?)[/\\]/i,
  /(^|[/\\])test-[^/\\]*$/i,
  /\.(?:test|spec)\.[a-z]+$/i,
  /(^|[/\\])(?:temp|tmp|scratchpad)[/\\]/i,
];
export const ACCOUNT_NUMBER = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;

export const WHOLE_FILE_CMD = /^(?:cat|bat|more|less|type|gc|get-content)$/i;
export const REWRITABLE_READ = /^(?:cat|bat|more|less)$/i;
export const PIPE = /(?<!\|)\|(?!\|)/;
export const REDIRECT = /^&?\d*[<>]{1,2}&?\d*$/;
export const REDIRECTED = /^&?\d*[<>]{1,2}/;
// only stdout leaving for a file hides the read; 2> keeps stdout, >& duplicates a descriptor
export const TO_FILE = /^(?:&|1?)>{1,2}(?![&])/;
export const FD_DUP = /[<>]&/;
// & inside a redirect is not a command separator
export const REDIRECT_AMP = (prev, next) => /[<>]/.test(prev || '') || next === '>';
export const SLICE_CMD = /^(?:head|tail)$/i;
export const SED_QUIET = /^(?:-[a-z]*n[a-z]*|--quiet|--silent)$/i;
export const SED_RANGE = /^(\d+)(?:,(\d+|\$))?p$/;
export const INTERPRETER_READ = /^(?:python[\d.]*|node|deno|bun|ruby|perl|php)\b[^\n]*\s--?(?:c|e|eval)\b[\s\S]*(?:\bopen\s*\(|readFile|read_text|readlines|File\.read|IO\.read|file_get_contents|\bslurp\b)/i;
export const GIT_SHOW_FILE = /^git\b[^\n]*\b(?:show\s+\S*:\S+|cat-file\s+-p\b)/i;

export const WEB_FETCH_SERVER = /^(?:.*[-_])?(?:fetch|crawl|firecrawl|scrape|scraper|search|websearch|serp|reader|tavily|exa|jina|duckduckgo|ddg|brave|browserbase|puppeteer|playwright)(?:[-_].*)?$/i;

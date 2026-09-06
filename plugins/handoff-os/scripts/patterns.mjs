export const MAX_PER_WAVE = 3;
export const WAVE_MS = 90 * 1000;
export const BIG_FILE_BYTES = 24 * 1024;
export const READ_CEILING_BYTES = 500 * 1024;
export const OPUS = /opus/i;
export const QUALITY = /\bQUALITY:\s*(?:writing|creative|legal|security)\b/;
export const SHELLS = /^(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)\b/i;

const GIT = String.raw`^git\b(?:\s+(?:-[Cc]\s+\S+|--\S+(?:[=\s]\S+)?))*\s+`;
const git = (tail) => new RegExp(GIT + tail, 'i');

export const GIT_DESTRUCTIVE = [
  git(String.raw`merge\b`),
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

export const ANYWHERE = [
  /(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)\s*[=:]/i,
  /\b(?:setx|set|export|env|\$env:)\b[^\n]{0,40}(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|apiKeyHelper)/i,
];

export const OUTWARD = ['send', 'email', 'mail', 'publish', 'publication', 'post', 'tweet', 'invite',
  'share', 'submit', 'submission', 'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast',
  'deploy', 'release', 'reply', 'forward', 'redirect', 'resend', 'notif', 'respond', 'rsvp', 'spam'];
export const DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive', 'revoke', 'unshare'];
export const STRONG = ['send', 'pay', 'charge', 'invoice', 'checkout', 'publish', 'publication', 'submit',
  'submission', 'deploy', 'tweet', 'broadcast', 'resend', 'delete', 'trash', 'purge', 'destroy',
  'revoke', 'unshare'];
export const OUTWARD_PREFIX = /^request[-_]/;
export const READ_PREFIX = /^(?:list|get|search|read|fetch|find|describe|count|preview|resolve|export)[-_]/;
export const RESTORATIVE = /^un(?:trash|archive|delete|hide|mark)[-_]/;
export const CONNECTOR_ALLOW = [
  /(?:^|[-_])reply[-_]to[-_]comment(?:[-_]|$)/,
  /(?:^|[-_])remove[-_](?:background|bg)(?:[-_]|$)/,
];

export const PROTECTED_PATHS = [
  /(^|[/\\])canon[/\\][^/\\]*\.(?:json|ya?ml|csv|tsv)$/i,
  /\.env(\.[^/\\]*)?$/i,
  /(^|[/\\])secrets?[/\\]/i,
];
export const PROTECTED_NAMES = [
  /^(?:org|brands|systems|facts|canon|beneficiar\w*|contacts)\.(?:json|ya?ml|csv|tsv)$/i,
  /^(?:logo|favicon|og-image|brand-kit|brandmark)/i,
  /credential/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /^id_(?:rsa|ed25519|ecdsa)/i,
];
export const FIXTURES = [
  /(^|[/\\])(?:tests?|__tests__|fixtures?)[/\\]/i,
  /(^|[/\\])test-[^/\\]*$/i,
  /\.(?:test|spec)\.[a-z]+$/i,
  /(^|[/\\])(?:temp|tmp|scratchpad)[/\\]/i,
];
export const ACCOUNT_NUMBER = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;

export const WHOLE_FILE_READ = /^(?:cat|bat|more|less)\s+(\S+)$/;

export const WEB_FETCH_SERVER = /^(?:.*[-_])?(?:fetch|crawl|firecrawl|scrape|scraper|search|websearch|serp|reader|tavily|exa|jina|duckduckgo|ddg|brave|browserbase|puppeteer|playwright)(?:[-_].*)?$/i;

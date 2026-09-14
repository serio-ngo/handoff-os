import { judgeShell, shellWriteTargets } from './shell-danger.mjs';
import { judgeWrite } from './file-write.mjs';

const OUTWARD = ['send', 'email', 'mail', 'publish', 'publication', 'post', 'tweet', 'invite',
  'share', 'submit', 'submission', 'pay', 'charge', 'invoice', 'checkout', 'subscribe', 'broadcast',
  'deploy', 'release', 'reply', 'forward', 'redirect', 'resend', 'notif', 'respond', 'rsvp', 'spam',
  'schedule'];
const DESTRUCTIVE = ['delete', 'trash', 'remove', 'destroy', 'purge', 'archive', 'revoke', 'unshare'];
const WRITE_VERBS = ['write', 'execute', 'truncate', 'drop', 'overwrite', 'upsert'];
const STRONG = ['send', 'pay', 'charge', 'invoice', 'checkout', 'publish', 'publication', 'submit',
  'submission', 'deploy', 'tweet', 'broadcast', 'resend', ...DESTRUCTIVE, ...WRITE_VERBS];

const OUTWARD_PREFIX = /^(?:request|run|trigger|dispatch|approve)[-_]/;
const READ_PREFIX = /^(?:list|get|search|read|fetch|find|describe|count|preview|resolve|export)[-_]/;
const RESTORATIVE = /^un(?:trash|archive|delete|hide|mark)[-_]/;

// Named exceptions: the verb reads as outward but the effect stays inside the document.
const ALLOW = [
  /(?:^|[-_])reply[-_]to[-_]comment(?:[-_]|$)/,
  /(?:^|[-_])remove[-_](?:background|bg)(?:[-_]|$)/,
];

const SQL_DESTRUCTIVE = /\b(?:drop\s+(?:table|database|index|schema)|truncate\s+table|delete\s+from|alter\s+table)\b/i;
const WEB_FETCH_SERVER = /^(?:.*[-_])?(?:fetch|crawl|firecrawl|scrape|scraper|search|websearch|serp|reader|tavily|exa|jina|duckduckgo|ddg|brave|browserbase|puppeteer|playwright)(?:[-_].*)?$/i;

const unlocked = (action) => (process.env.HANDOFF_MCP_ALLOW || '')
  .split(',').map((s) => s.trim().toLowerCase()).includes(action);

export function judgeConnector(tool, input) {
  const action = tool.split('__').slice(2).join('__').toLowerCase();
  if (unlocked(action)) return null;

  if (SQL_DESTRUCTIVE.test(JSON.stringify(input))) {
    return `blocked ${tool} — the payload carries a destructive SQL statement`;
  }
  for (const key of ['command', 'script', 'code']) {
    if (typeof input[key] !== 'string') continue;
    const verdict = judgeShell(input[key]);
    if (verdict) return `blocked ${tool} — ${verdict}`;
    for (const target of shellWriteTargets(input[key])) {
      const reason = judgeWrite(target, input[key], 'a shell write');
      if (reason) return `blocked ${tool} — ${reason}`;
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
    || ALLOW.some((rx) => rx.test(dashed));
  if (hit && !allowed) return `blocked ${tool} — "${hit}" leaves the org or destroys a record`;

  const rawFetch = WEB_FETCH_SERVER.test(tool.split('__')[1] || '')
    && (READ_PREFIX.test(dashed) || /(?:scrape|crawl|extract|search)/.test(action));
  return rawFetch ? `blocked ${tool} — a raw page fetch` : null;
}

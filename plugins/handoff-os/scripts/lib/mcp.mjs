import {
  CONNECTOR_ALLOW, DESTRUCTIVE, OUTWARD, OUTWARD_PREFIX, READ_PREFIX, RESTORATIVE, SQL_DESTRUCTIVE,
  STRONG, WEB_FETCH_SERVER, WRITE_VERBS,
} from './patterns.mjs';
import { judgeShell, shellWriteTargets } from './shell.mjs';
import { judgeWrite } from './writes.mjs';

const unlocked = (action) => (process.env.HANDOFF_MCP_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).includes(action);

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
      const reason = judgeWrite(target, 'a shell write');
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
    || CONNECTOR_ALLOW.some((rx) => rx.test(dashed));
  if (hit && !allowed) return `blocked ${tool} — "${hit}" leaves the org or destroys a record`;
  const rawFetch = WEB_FETCH_SERVER.test(tool.split('__')[1] || '')
    && (READ_PREFIX.test(dashed) || /(?:scrape|crawl|extract|search)/.test(action));
  return rawFetch ? `blocked ${tool} — a raw page fetch` : null;
}

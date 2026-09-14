import { GREP_HEAD_LIMIT } from './limits.mjs';
import { BYTE_COUNTERS, allTime, fold } from './ledger.mjs';

const tok = (bytes) => Math.round(Number(bytes || 0) / 4);
const num = (value) => Number(value || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const compact = (value) => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
  : value >= 10000 ? `${(value / 1000).toFixed(1)}k` : num(value));

export const kept = (t) => BYTE_COUNTERS.reduce((sum, key) => sum + Number(t[key] || 0), 0);
const volume = (t) => kept(t) + Number(t.read || 0);
export const keptPct = (t) => (volume(t) ? Math.round((kept(t) / volume(t)) * 100) : 0);

const line = (parts) => (parts.length ? `SERIO FOCUS · ${parts.join(' · ')}` : '');

// kept out of what: without the denominator a percentage cannot be checked.
function volumeParts(t) {
  if (!volume(t)) return [];
  if (!kept(t)) return [`~${compact(tok(t.read))} tok read, none kept out`];
  return [`~${compact(tok(kept(t)))} of ~${compact(tok(volume(t)))} tok kept out (${keptPct(t)}%)`];
}

export function sessionLine(state, root, session) {
  const s = fold(state.session, state.saved);
  const life = allTime(state, root, session);
  const parts = [];
  if (s.rewrites) parts.push(`${num(s.rewrites)} trimmed`);
  if (s.rereads + s.queries) parts.push(`${num(s.rereads + s.queries)} re-reads stopped`);
  if (s.slices) parts.push(plural(s.slices, 'read deferred', 'reads deferred'));
  if (s.caps) parts.push(`${num(s.caps)} capped at ${GREP_HEAD_LIMIT}`);
  if (s.agentsCapped) parts.push(`${num(s.agentsCapped)} held`);
  if (s.redirects) parts.push(`${num(s.redirects)} redirected`);
  const other = s.blocked - s.redirects - s.waves;
  if (other > 0) parts.push(`${num(other)} blocked`);
  if (s.agents) parts.push(`${num(s.agents)} dispatched`);
  if (s.scouts) parts.push(plural(s.scouts, 'scout', 'scouts'));
  if (s.runners) parts.push(plural(s.runners, 'runner', 'runners'));
  parts.push(...volumeParts(s));
  if (kept(life) > kept(s)) parts.push(`all-time ~${compact(tok(kept(life)))} tok`);
  return line(parts);
}

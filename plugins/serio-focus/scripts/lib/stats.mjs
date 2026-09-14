import { BYTE_COUNTERS, fold } from './ledger.mjs';

const tok = (bytes) => Math.round(Number(bytes || 0) / 4);
const num = (value) => Number(value || 0).toLocaleString('en-US');
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

// One count for every guard action; blocked already covers the refusals the others do not.
const HELD = ['rewrites', 'rereads', 'queries', 'slices', 'caps', 'agentsCapped', 'redirects'];
const heldCount = (s) => HELD.reduce((sum, key) => sum + Number(s[key] || 0), 0)
  + Math.max(0, s.blocked - s.redirects - s.waves);

export function sessionLine(state) {
  const s = fold(state.session, state.saved);
  const held = heldCount(s);
  const parts = [];
  if (held) parts.push(`${num(held)} held`);
  if (s.agents) parts.push(`${num(s.agents)} dispatched`);
  parts.push(...volumeParts(s));
  return line(parts);
}

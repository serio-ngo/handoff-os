import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GREP_HEAD_LIMIT } from './patterns.mjs';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'queries', 'caps', 'rewrites', 'unjudged',
  'bytes', 'deferred', 'trimmed', 'offload', 'read', 'scouts', 'runners', 'gated',
  'waves', 'agentsCapped', 'redirects'];

export const BYTE_COUNTERS = ['bytes', 'deferred', 'trimmed', 'offload'];

const zero = () => Object.fromEntries(COUNTERS.map((key) => [key, 0]));
const EMPTY = () => ({ reads: {}, saved: zero() });

export const rootOf = (payload = {}) => process.env.HANDOFF_OS_DIR
  || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

export const sessionOf = (payload = {}) => String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');

const ledgerPath = (root, session) => path.join(root, '.claude', `.session-${session}.json`);

export function load(root, session) {
  const blank = EMPTY();
  try {
    const stored = JSON.parse(readFileSync(ledgerPath(root, session), 'utf8'));
    return { ...blank, ...stored, reads: { ...stored.reads }, saved: { ...blank.saved, ...stored.saved } };
  } catch {
    return blank;
  }
}

export function save(root, session, state) {
  const file = ledgerPath(root, session);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function bump(payload, field, amount = 1) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  state.saved[field] = (state.saved[field] || 0) + amount;
  save(root, session, state);
  return state;
}

const tok = (bytes) => Math.round(Number(bytes || 0) / 4);

export const kept = (t) => BYTE_COUNTERS.reduce((sum, key) => sum + Number(t[key] || 0), 0);

const volume = (t) => kept(t) + Number(t.read || 0);

export const keptPct = (t) => (volume(t) ? Math.round((kept(t) / volume(t)) * 100) : 0);

export function savings(state) {
  const s = state.saved;
  return COUNTERS.some((key) => s[key]) ? { ...s } : null;
}

const num = (value) => Number(value || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const compact = (value) => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 10000 ? `${(value / 1000).toFixed(1)}k` : num(value));
const kb = (bytes) => (bytes >= 1024 ? `${num(Math.round(bytes / 1024))} KB` : `${num(bytes)} B`);

function fold(base, add = {}) {
  const out = { ...zero(), ...(base || {}) };
  for (const key of COUNTERS) out[key] += Number(add[key] || 0);
  return out;
}

const lifetime = (state) => fold(state.lifetime, state.saved);

export function bank(state) {
  state.lifetime = lifetime(state);
  state.session = fold(state.session, state.saved);
  return state.lifetime;
}

export function sessionLine(state) {
  const s = fold(state.session, state.saved);
  const life = lifetime(state);
  const reads = [];
  if (s.rewrites) reads.push(`${num(s.rewrites)} trimmed (${kb(s.trimmed)} out)`);
  if (s.rereads + s.queries) reads.push(`${num(s.rereads + s.queries)} re-reads stopped`);
  if (s.slices) reads.push(`${plural(s.slices, 'action guarded', 'actions guarded')}`);
  if (s.caps) reads.push(`${num(s.caps)} capped at ${GREP_HEAD_LIMIT}`);
  const disp = [];
  if (s.agentsCapped) disp.push(`${num(s.agentsCapped)} held for the next wave`);
  if (s.redirects) disp.push(`${num(s.redirects)} redirected`);
  const other = s.blocked - s.redirects - s.waves;
  if (other > 0) disp.push(`${num(other)} blocked`);
  if (s.agents) disp.push(`${num(s.agents)} used`);
  const tail = [];
  if (kept(s)) tail.push(`session: ~${compact(tok(kept(s)))} (${keptPct(s)}%)`);
  if (kept(life)) tail.push(`all-time: ~${compact(tok(kept(life)))}`);
  const lines = [];
  if (reads.length) lines.push(`reads: ${reads.join(' · ')}`);
  if (disp.length) lines.push(`dispatches: ${disp.join(' · ')}`);
  if (tail.length) lines.push(`tokens kept out of context — ${tail.join(' · ')}`);
  if (!lines.length) return '';
  lines[0] = `HANDOFF OS · ${lines[0]}`;
  return lines.join('\n');
}

export function lifetimeLine(state) {
  const life = lifetime(state);
  const lines = [];
  if (kept(life)) lines.push(`~${compact(tok(kept(life)))} kept out of context (${keptPct(life)}%)`);
  const stopped = Number(life.rereads || 0) + Number(life.slices || 0);
  const capped = Number(life.queries || 0) + Number(life.caps || 0);
  const blocked = Number(life.blocked || 0);
  if (stopped + capped + blocked) lines.push(plural(stopped + capped + blocked, 'guard action', 'guard actions'));
  if (Number(life.gated || 0)) lines.push(`${num(life.gated)} gated`);
  const used = [];
  if (Number(life.scouts || 0)) used.push(plural(Number(life.scouts), 'scout', 'scouts'));
  if (Number(life.runners || 0)) used.push(plural(Number(life.runners), 'runner', 'runners'));
  if (used.length) lines.push(`used ${used.join(' · ')}`);
  return lines.length ? `HANDOFF OS · ${lines.join('\n')}` : '';
}

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE = [[/^\.wave-/, DAY_MS], [/^\.session-/, 30 * DAY_MS]];

export function sweep(root) {
  const dir = path.join(root, '.claude');
  let names = [];
  try { names = readdirSync(dir); } catch { return 0; }
  let swept = 0;
  for (const name of names) {
    const age = (STALE.find(([rx]) => rx.test(name)) || [])[1];
    if (age === undefined) continue;
    try {
      if (Date.now() - statSync(path.join(dir, name)).mtimeMs < age) continue;
      rmSync(path.join(dir, name), { recursive: true, force: true });
      swept += 1;
    } catch { }
  }
  return swept;
}

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

function fold(base, add = {}) {
  const out = { ...zero(), ...(base || {}) };
  for (const key of COUNTERS) out[key] += Number(add[key] || 0);
  return out;
}

const lifetime = (state) => fold(state.lifetime, state.saved);

function allTime(state, root, session) {
  const mine = lifetime(state);
  if (!root || !session) return mine;
  let names = [];
  try { names = readdirSync(path.join(root, '.claude')); } catch { return mine; }
  return names.reduce((out, name) => {
    const other = /^\.session-(.+)\.json$/.exec(name);
    if (!other || other[1] === session) return out;
    try { return fold(out, JSON.parse(readFileSync(path.join(root, '.claude', name), 'utf8')).lifetime); } catch { return out; }
  }, mine);
}

export function bank(state) {
  state.lifetime = lifetime(state);
  state.session = fold(state.session, state.saved);
  return state.lifetime;
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
  if (s.agents) parts.push(`${num(s.agents)} used`);
  if (kept(s)) parts.push(`~${compact(tok(kept(s)))} tok kept out (${keptPct(s)}%)`);
  if (kept(life) > kept(s)) parts.push(`all-time ~${compact(tok(kept(life)))} tok`);
  return parts.length ? `HANDOFF OS · ${parts.join(' · ')}` : '';
}

export function lifetimeLine(state, root, session) {
  const life = allTime(state, root, session);
  const parts = [];
  if (kept(life)) parts.push(`~${compact(tok(kept(life)))} tok kept out (${keptPct(life)}%)`);
  const actions = Number(life.rereads || 0) + Number(life.slices || 0)
    + Number(life.queries || 0) + Number(life.caps || 0) + Number(life.blocked || 0);
  if (actions) parts.push(plural(actions, 'guard action', 'guard actions'));
  if (Number(life.gated || 0)) parts.push(`${num(life.gated)} gated`);
  if (Number(life.scouts || 0)) parts.push(plural(Number(life.scouts), 'scout', 'scouts'));
  if (Number(life.runners || 0)) parts.push(plural(Number(life.runners), 'runner', 'runners'));
  return parts.length ? `HANDOFF OS · ${parts.join(' · ')}` : '';
}

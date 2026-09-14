import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'queries', 'caps', 'rewrites',
  'bytes', 'deferred', 'trimmed', 'offload', 'read', 'scouts', 'runners', 'gated',
  'waves', 'agentsCapped', 'redirects'];

export const BYTE_COUNTERS = ['bytes', 'deferred', 'trimmed', 'offload'];

export const zero = () => Object.fromEntries(COUNTERS.map((key) => [key, 0]));
const EMPTY = () => ({ reads: {}, saved: zero() });

export const rootOf = (payload = {}) => process.env.HANDOFF_OS_DIR
  || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

export const sessionOf = (payload = {}) => String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');

const ledgerPath = (root, session) => path.join(root, '.claude', `.session-${session}.json`);

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE = [[/^\.wave-/, DAY_MS], [/^\.verif(?:ied|y-gate-count)-/, DAY_MS], [/^\.session-/, 30 * DAY_MS]];

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

export function fold(base, add = {}) {
  const out = { ...zero(), ...(base || {}) };
  for (const key of COUNTERS) out[key] += Number(add[key] || 0);
  return out;
}

export const savings = (state) => (COUNTERS.some((key) => state.saved[key]) ? { ...state.saved } : null);

const lifetime = (state) => fold(state.lifetime, state.saved);

export function bank(state) {
  state.lifetime = lifetime(state);
  state.session = fold(state.session, state.saved);
  return state.lifetime;
}

// Every other session's banked lifetime, so one window can report the whole repo.
export function allTime(state, root, session) {
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

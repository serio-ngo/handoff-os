import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'queries', 'caps',
  'bytes', 'deferred', 'offload', 'read', 'scouts', 'runners'];

export const BYTE_COUNTERS = ['bytes', 'deferred', 'offload'];

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

export const tok = (bytes) => Math.round(Number(bytes || 0) / 4);

export const kept = (t) => BYTE_COUNTERS.reduce((sum, key) => sum + Number(t[key] || 0), 0);

export const volume = (t) => kept(t) + Number(t.read || 0);

export const keptPct = (t) => (volume(t) ? Math.round((kept(t) / volume(t)) * 100) : 0);

export function savings(state) {
  const s = state.saved;
  return COUNTERS.some((key) => s[key]) ? { ...s } : null;
}

const num = (value) => Number(value || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const compact = (value) => (value >= 10000 ? `${(value / 1000).toFixed(1)}k` : num(value));

function lifetime(state) {
  const life = { ...zero(), ...(state.lifetime || {}) };
  for (const key of COUNTERS) life[key] += Number(state.saved[key] || 0);
  return life;
}

export function bank(state) {
  state.lifetime = lifetime(state);
  return state.lifetime;
}

export function lifetimeLine(state) {
  const life = lifetime(state);
  const lines = [];
  if (kept(life)) lines.push(`~${compact(tok(kept(life)))} kept out of context (${keptPct(life)}%)`);
  const stopped = Number(life.rereads || 0) + Number(life.slices || 0);
  const capped = Number(life.queries || 0) + Number(life.caps || 0);
  const blocked = Number(life.blocked || 0);
  if (stopped + capped + blocked) lines.push(plural(stopped + capped + blocked, 'guard action', 'guard actions'));
  const used = [];
  if (Number(life.scouts || 0)) used.push(plural(Number(life.scouts), 'scout', 'scouts'));
  if (Number(life.runners || 0)) used.push(plural(Number(life.runners), 'runner', 'runners'));
  if (used.length) lines.push(`used ${used.join(' · ')}`);
  return lines.length ? `HANDOFF OS · ${lines.join('\n')}` : '';
}

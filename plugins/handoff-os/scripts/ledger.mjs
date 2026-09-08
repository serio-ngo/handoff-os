import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'bytes', 'deferred', 'read'];

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

export function dedupePct(t) {
  const volume = Number(t.bytes || 0) + Number(t.read || 0);
  return volume ? Math.round((Number(t.bytes || 0) / volume) * 100) : 0;
}

export function savings(state) {
  const s = state.saved;
  if (!COUNTERS.some((key) => s[key])) return null;
  return { ...s, tokens: tok(s.bytes) };
}

const num = (value) => Number(value || 0).toLocaleString('en-US');
const compact = (value) => (value >= 10000 ? `${(value / 1000).toFixed(1)}k` : num(value));

const actions = (t) => ['blocked', 'rereads', 'slices', 'agents']
  .reduce((total, key) => total + Number(t[key] || 0), 0);

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
  const parts = [];
  if (life.bytes) parts.push(`~${compact(tok(life.bytes))} tok deduped, ${dedupePct(life)}% of file reads`);
  if (life.deferred) parts.push(`~${compact(tok(life.deferred))} tok deferred to slices or scout`);
  if (actions(life)) parts.push(`${num(actions(life))} guard actions`);
  return parts.length ? `HANDOFF OS · ${parts.join(' · ')}` : '';
}

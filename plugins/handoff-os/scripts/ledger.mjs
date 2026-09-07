import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'bytes', 'cache'];

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

export function savings(state) {
  const s = state.saved;
  if (!COUNTERS.some((key) => s[key])) return null;
  return { ...s, tokens: Math.round(s.bytes / 4) };
}

const num = (value) => Number(value || 0).toLocaleString('en-US');
const compact = (value) => (value >= 10000 ? `${(value / 1000).toFixed(1)}k` : num(value));

const zero = () => Object.fromEntries(COUNTERS.map((key) => [key, 0]));
const stops = (t) => Number(t.blocked || 0) + Number(t.rereads || 0) + Number(t.slices || 0);
const actions = (t) => stops(t) + Number(t.agents || 0);

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
  const tokens = Math.round(life.bytes / 4) + Number(life.cache || 0);
  const parts = [];
  if (tokens) parts.push(`~${compact(tokens)} tok saved`);
  if (actions(life)) parts.push(`${num(actions(life))} guard actions`);
  return parts.length ? `HANDOFF OS · ${parts.join(' · ')}` : '';
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'bytes', 'cache'];

const EMPTY = () => ({ reads: {}, saved: Object.fromEntries(COUNTERS.map((key) => [key, 0])) });

export const rootOf = (payload = {}) => process.env.HANDOFF_OS_DIR
  || process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

export const sessionOf = (payload = {}) => String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');

export const ledgerPath = (root, session) => path.join(root, '.claude', `.session-${session}.json`);

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

export const savingsLine = (t) => ['HANDOFF OS',
  `agents ${num(t.agents)}`,
  `blocked ${num(t.blocked)}`,
  `cache hits ${num(t.cache)} tok`,
  `re-reads ${num(t.rereads)}`,
  `sliced ${num(t.slices)}`,
  `~${num(t.tokens)} tok saved`].join(' · ');

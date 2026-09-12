import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const COUNTERS = ['blocked', 'trimmed', 'rereads', 'held'];
const EMPTY = () => ({ reads: {}, saved: Object.fromEntries(COUNTERS.map((key) => [key, 0])) });

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

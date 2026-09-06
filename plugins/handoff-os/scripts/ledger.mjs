import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ reads: {}, wave: null, saved: { rereads: 0, slices: 0, bytes: 0 } });

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

export function savings(state) {
  const { rereads, slices, bytes } = state.saved;
  if (!rereads && !slices) return null;
  return { rereads, slices, tokens: Math.round(bytes / 4) };
}

export const savingsLine = ({ rereads, slices, tokens }) => `HANDOFF OS · re-reads blocked ${rereads}`
  + ` · large reads sliced ${slices} · ~${tokens.toLocaleString('en-US')} tokens saved`;

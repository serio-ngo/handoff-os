import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GREP_HEAD_LIMIT } from './patterns.mjs';

export const COUNTERS = ['agents', 'blocked', 'rereads', 'slices', 'queries', 'caps', 'rewrites', 'unjudged',
  'bytes', 'deferred', 'trimmed', 'offload', 'read', 'scouts', 'runners', 'gated', 'offloads',
  'waves', 'agentsCapped', 'redirects'];

export const BYTE_COUNTERS = ['bytes', 'deferred', 'trimmed', 'offload'];

// USD per 1M input tokens — https://platform.claude.com/docs/en/about-claude/pricing.md, read 2026-09-10
export const PRICES = { haiku: 1, sonnet: 2, opus: 5, fable: 10 };

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

export function sessionLine(state, footprintTok = 0) {
  const s = fold(state.session, state.saved);
  const tiers = state.tiers || {};
  const parts = [];
  if (s.rewrites) parts.push(`${plural(s.rewrites, 'read', 'reads')} trimmed (${kb(s.trimmed)} kept out)`);
  if (s.rereads) parts.push(`${plural(s.rereads, 're-read', 're-reads')} stopped (${kb(s.bytes)})`);
  const held = s.slices + s.offloads;
  if (held) {
    parts.push(`${plural(held, 'whole-file read', 'whole-file reads')} held back (${kb(s.deferred)}${s.offloads ? `, ${s.offloads} handed to scout` : ''})`);
  }
  if (s.caps) parts.push(`${plural(s.caps, 'search', 'searches')} capped at ${GREP_HEAD_LIMIT} lines`);
  if (s.queries) parts.push(`${plural(s.queries, 'repeat search', 'repeat searches')} stopped`);
  if (s.waves) parts.push(`${plural(s.waves, 'dispatch wave', 'dispatch waves')} capped (${plural(s.agentsCapped, 'agent', 'agents')} held back)`);
  const named = Object.keys(tiers).filter((tier) => tiers[tier]);
  for (const tier of named) {
    const ratio = PRICES[tier] && PRICES.haiku ? ` (haiku is 1/${PRICES[tier] / PRICES.haiku} of the input price)` : '';
    parts.push(`${plural(tiers[tier], `${tier} dispatch`, `${tier} dispatches`)} redirected to scout${ratio}`);
  }
  if (!named.length && s.redirects) parts.push(`${plural(s.redirects, 'dispatch', 'dispatches')} redirected to scout`);
  const other = s.blocked - s.redirects - s.waves;
  if (other > 0) parts.push(`${plural(other, 'call', 'calls')} blocked`);
  if (s.gated) parts.push(`${plural(s.gated, 'done-claim', 'done-claims')} gated`);
  const used = [];
  if (s.scouts) used.push(plural(s.scouts, 'scout', 'scouts'));
  if (s.runners) used.push(plural(s.runners, 'runner', 'runners'));
  if (used.length) parts.push(`${used.join(', ')} used${s.offload ? ` (${kb(s.offload)} read off-thread)` : ''}`);
  if (s.unjudged) parts.push(`${plural(s.unjudged, 'shell read', 'shell reads')} unsized`);
  if (!parts.length) return '';
  if (footprintTok) parts.push(`plugin cost ~${num(footprintTok)} tok`);
  return `HANDOFF OS · this session: ${parts.join(' · ')}`;
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

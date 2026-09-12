import { closeSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  DENY_SUBAGENT_DEFAULT, FANOUT_BUDGET, MODEL_BEARING, MODEL_OPTION, MODEL_TIERS,
  QUALITY, REVIEW, SPAWN_TEXT, THINK_ESCALATION, UNBOUNDED_FANOUT, WORKFLOW_AGENT_CALL,
  deniedSubagentRx, waveCap, waveWindow,
} from './patterns.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';

export class Blocked extends Error {}

export const spawnText = (input) => SPAWN_TEXT.map((key) => input[key]).filter((value) => typeof value === 'string').join(' ');
export const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export function deniedVerdict(text, hit) {
  if (REVIEW.test(text)) return { reason: `blocked ${article(hit)} ${hit} review`, tier: hit };
  if (!QUALITY.test(text)) {
    return { reason: `blocked ${article(hit)} ${hit} subagent`, tier: hit };
  }
  return null;
}

export const selectedTiers = (text) => [...String(text).matchAll(MODEL_OPTION)].map((hit) => hit[1].toLowerCase());

export function dispatchBudget(input, tool = 'Agent', denied = deniedSubagentRx(process.env.HANDOFF_DENY_SUBAGENT_MODELS ?? DENY_SUBAGENT_DEFAULT)) {
  const model = String(input.model || '').trim();
  const text = spawnText(input);
  if (!model) {
    if (!MODEL_BEARING.includes(tool)) {
      const hit = selectedTiers(text).find((tier) => denied.test(tier));
      return hit ? deniedVerdict(text, hit) : null;
    }
    return { reason: 'blocked a dispatch that names no model' };
  }
  if (!MODEL_TIERS.test(model)) {
    return { reason: `blocked model "${model}" — not a tier` };
  }
  const hit = (model.match(denied) || [])[0]?.toLowerCase();
  return hit ? deniedVerdict(text, hit) : null;
}

export function bookRedirect(payload, tier) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  state.saved.redirects += 1;
  state.tiers = { ...(state.tiers || {}), [tier]: ((state.tiers || {})[tier] || 0) + 1 };
  save(root, session, state);
}

const code = (text) => String(text ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
  .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');

export const declaredAgents = (input) => Number((String(input.script ?? '').match(FANOUT_BUDGET) || [])[1] || 0);

export function costBudget(input, tool) {
  const text = spawnText(input);
  if (QUALITY.test(text)) return null;
  const think = (text.match(THINK_ESCALATION) || [])[0];
  if (think) return { reason: `blocked "${think}"` };
  if (tool !== 'Workflow' || declaredAgents(input)) return null;
  const fan = (code(input.script).match(UNBOUNDED_FANOUT) || [])[0];
  return fan
    ? { reason: `blocked a workflow fanning out through "${fan.trim()}" with no agent count` }
    : null;
}

export const agentsRequested = (input, tool) => (tool === 'Workflow'
  ? Math.max(1, declaredAgents(input) || (code(input.script).match(WORKFLOW_AGENT_CALL) || []).length)
  : 1);

export function claimSlot(dir, bucket, cap) {
  try { mkdirSync(dir, { recursive: true }); } catch {
    try { rmSync(dir, { force: true, recursive: true }); mkdirSync(dir, { recursive: true }); } catch { return cap + 1; }
  }
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(`${bucket}-`)) rmSync(path.join(dir, name), { force: true });
    }
  } catch { }
  for (let n = 1; n <= cap + 1; n += 1) {
    try {
      closeSync(openSync(path.join(dir, `${bucket}-${n}`), 'wx'));
      if (n > cap) rmSync(path.join(dir, `${bucket}-${n}`), { force: true });
      return n;
    } catch { }
  }
  return cap + 1;
}

export function fanOutCap(payload, count = 1) {
  const cap = waveCap();
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const bucket = Math.floor(Date.now() / waveWindow());
  const claimed = [];
  for (let n = 0; n < count; n += 1) {
    const slot = claimSlot(dir, bucket, cap);
    if (slot <= cap) { claimed.push(slot); continue; }
    for (const held of claimed) {
      try { rmSync(path.join(dir, `${bucket}-${held}`), { force: true }); } catch { }
    }
    const root = rootOf(payload);
    const session = sessionOf(payload);
    const state = load(root, session);
    state.saved.blocked += 1;
    state.saved.waves += 1;
    state.saved.agentsCapped += count;
    save(root, session, state);
    throw new Blocked(count > 1
      ? `FAN-OUT CAP: ${count} subagents requested, wave capped at ${cap}\n`
      : `FAN-OUT CAP: subagent ${slot}, wave capped at ${cap}\n`);
  }
}

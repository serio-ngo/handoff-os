import { DENY_SUBAGENT_DEFAULT } from './limits.mjs';
import { declaredModel } from './agent-model.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';
import { append } from '../audit.mjs';

const MODEL_TIERS = /\b(?:haiku|sonnet|opus|fable)\b/i;
const MODEL_OPTION = /\bmodel\s*[:=]\s*['"`]?\s*(haiku|sonnet|opus|fable)\b/gi;
const QUALITY = /\bQUALITY:\s*(?:writing|creative|legal|security)\b/;
const REVIEW = /\b(?:review|audit)(?:s|ed|ing|er|ers|or|ors)?\b/i;
const THINK_ESCALATION = /\b(?:ultrathink|megathink|think\s+(?:hard(?:er)?|deeply)|(?:reasoning[-_ ]?)?effort\s*[=:]\s*(?:high|xhigh|max))\b/i;
const UNBOUNDED_FANOUT = /\b(?:parallel|pipeline|Promise\s*\.\s*all(?:Settled)?)\s*\(/;
const FANOUT_BUDGET = /(?:^|\n)\s*\/\/\s*AGENTS:\s*(\d+)\b/;
const WORKFLOW_AGENT_CALL = /(?<![.\w$])agent\s*\(/g;
const SPAWN_TEXT = ['prompt', 'description', 'subagent_type', 'subject', 'script', 'name', 'title'];
const MODEL_BEARING = ['Agent', 'Task'];

export function deniedSubagentRx(raw = DENY_SUBAGENT_DEFAULT) {
  const names = String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return /(?!)/;
  const esc = names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(?:${esc})\\b`, 'i');
}

export const spawnText = (input) => SPAWN_TEXT.map((key) => input[key]).filter((value) => typeof value === 'string').join(' ');
const selectedTiers = (text) => [...String(text).matchAll(MODEL_OPTION)].map((hit) => hit[1].toLowerCase());

function deniedVerdict(text, hit) {
  if (REVIEW.test(text)) return { reason: `blocked ${hit} review. Use sonnet`, tier: hit };
  if (!QUALITY.test(text)) return { reason: `blocked ${hit} subagent. Use sonnet`, tier: hit };
  return null;
}

// Judge the model the subagent will actually run on: the call names one, or its definition does.
// A model-bearing call naming neither is held: an unnamed tier inherits the most expensive one.
export function dispatchBudget(input, cwd, tool = 'Agent', denied = deniedSubagentRx(process.env.HANDOFF_DENY_SUBAGENT_MODELS ?? DENY_SUBAGENT_DEFAULT)) {
  const named = String(input.model || '').trim();
  const text = spawnText(input);
  if (!named) {
    if (!MODEL_BEARING.includes(tool)) {
      const selected = selectedTiers(text).find((tier) => denied.test(tier));
      return selected ? deniedVerdict(text, selected) : null;
    }
    const declared = declaredModel(input.subagent_type, cwd);
    if (declared) {
      const hit = (declared.match(denied) || [])[0]?.toLowerCase();
      return hit ? deniedVerdict(text, hit) : null;
    }
    return { reason: 'blocked a dispatch that names no model' };
  }
  if (!MODEL_TIERS.test(named)) return { reason: `blocked model "${named}" — not a tier` };

  const hit = (named.match(denied) || [])[0]?.toLowerCase();
  return hit ? deniedVerdict(text, hit) : null;
}

const code = (text) => String(text ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
  .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
  .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');

const declaredAgents = (input) => Number((String(input.script ?? '').match(FANOUT_BUDGET) || [])[1] || 0);

export function costBudget(input, tool) {
  const text = spawnText(input);
  if (QUALITY.test(text)) return null;
  const think = (text.match(THINK_ESCALATION) || [])[0];
  if (think) return { reason: `blocked "${think}"` };
  if (tool !== 'Workflow' || declaredAgents(input)) return null;
  const fan = (code(input.script).match(UNBOUNDED_FANOUT) || [])[0];
  return fan ? { reason: `blocked a workflow fanning out through "${fan.trim()}" with no agent count` } : null;
}

export const agentsRequested = (input, tool) => (tool === 'Workflow'
  ? Math.max(1, declaredAgents(input) || (code(input.script).match(WORKFLOW_AGENT_CALL) || []).length)
  : 1);

export function bookRedirect(payload, tier) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  state.saved.redirects += 1;
  state.tiers = { ...(state.tiers || {}), [tier]: ((state.tiers || {})[tier] || 0) + 1 };
  save(root, session, state);
}

export function receipt(payload, input, tool) {
  const model = String(input.model || '').trim().toLowerCase()
    || declaredModel(input.subagent_type, payload.cwd) || 'inherit';
  const kind = String(input.subagent_type || input.description || input.subject || input.name || '').slice(0, 80);
  append(rootOf(payload), {
    actor: payload.agent_type || 'main', tier: 'GREEN', action: tool,
    target: `${model}:${kind}`, result: 'ok',
  });
}

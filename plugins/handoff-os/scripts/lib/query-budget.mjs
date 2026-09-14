import { GREP_HEAD_LIMIT } from './limits.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';
import { Blocked } from './blocked.mjs';
import { actorOf } from './read-budget.mjs';

const ASKED = 1;
const REPEATED = 2;

// The same Grep or Glob twice with nothing written in between returns the same answer.
export function queryBudget(payload, input, tool) {
  const root = rootOf(payload);
  const session = sessionOf(payload);
  const state = load(root, session);
  const key = `${actorOf(payload)}|q:${tool}:${JSON.stringify(input)}`;

  if (state.reads[key]) {
    if (state.reads[key] === ASKED) state.saved.queries += 1;
    state.reads[key] = REPEATED;
    save(root, session, state);
    throw new Blocked(`READ BUDGET: this exact ${tool} already ran and nothing has been written since\n`);
  }

  state.reads[key] = ASKED;
  if (tool === 'Grep' && input.output_mode === 'content' && input.head_limit === undefined) {
    state.saved.caps += 1;
    save(root, session, state);
    return {
      updatedInput: { ...input, head_limit: GREP_HEAD_LIMIT },
      reason: `HANDOFF OS: head_limit ${GREP_HEAD_LIMIT} set on this Grep`,
    };
  }
  save(root, session, state);
  return null;
}

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ALLOWED, BLOCKED, fire, sandbox, scrub } from './helper.mjs';

const GUARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/guard.mjs', import.meta.url));
const VCS = ['g', 'i', 't'].join('');
const HELPER = ['api', 'Key', 'Helper'].join('');

const at = (payload) => {
  const workspace = sandbox('budget-');
  return fire(GUARD, { cwd: workspace, session_id: 'b', ...payload },
    { ...process.env, HANDOFF_OS_DIR: workspace }).status;
};
const shell = (command) => at({ tool_name: 'Bash', tool_input: { command } });
const dispatch = (tool_input) => at({ tool_name: 'Agent', tool_input });
const flow = (script) => at({ tool_name: 'Workflow', tool_input: { script } });

after(scrub);

describe('a read that only looks like a merge', () => {
  it('lets merge-base through, because it writes nothing', () => {
    for (const c of [`${VCS} merge-base --is-ancestor a b`, `${VCS} -C /r merge-base --fork-point main`]) {
      assert.equal(shell(c), ALLOWED, c);
    }
  });

  it('still stops the merge itself', () => {
    for (const c of [`${VCS} merge main`, `${VCS} merge --no-ff topic`]) assert.equal(shell(c), BLOCKED, c);
  });
});

describe('a metered credential hidden in JSON quoting', () => {
  it('blocks the helper key however it is punctuated', () => {
    for (const body of [`{"${HELPER}":"./k.sh"}`, `${HELPER}: ./k.sh`, `{ '${HELPER}' : './k.sh' }`]) {
      assert.equal(shell(`echo '${body}' >> conf.json`), BLOCKED, body);
    }
  });

  it('leaves ordinary settings alone', () => assert.equal(shell(`echo '{"theme":"dark"}' >> conf.json`), ALLOWED));
});

describe('thinking is a cost a dispatch has to justify', () => {
  it('blocks a prompt that talks its way into extended thinking', () => {
    for (const prompt of ['ultrathink about the schema', 'think harder about this loop', 'effort: high — scan the repo']) {
      assert.equal(dispatch({ model: 'sonnet', prompt }), BLOCKED, prompt);
    }
  });

  it('lets a plain cheap dispatch through', () => {
    assert.equal(dispatch({ model: 'sonnet', prompt: 'find the config' }), ALLOWED);
    assert.equal(dispatch({ model: 'haiku', prompt: 'quote the version' }), ALLOWED);
  });

  it('allows the thinking a published deliverable earns', () => assert.equal(
    dispatch({ model: 'opus', prompt: 'QUALITY: writing — ultrathink the grant narrative' }), ALLOWED));
});

describe('a workflow pays for every agent it spawns', () => {
  it('refuses a fan-out whose agent count the script never states', () => {
    for (const script of [
      "await parallel(rows.map((n) => () => agent('review ' + n, { model: 'sonnet' })))",
      "await pipeline(files, (f) => agent('scan ' + f, { model: 'sonnet' }))",
      "await Promise.all(rows.map((r) => agent('x', { model: 'sonnet' })))",
    ]) assert.equal(flow(script), BLOCKED, script);
  });

  it('charges the wave once per agent call it can read', () => assert.equal(
    flow(Array.from({ length: 4 }, (_, n) => `await agent('s${n}', { model: 'sonnet' });`).join(' ')), BLOCKED));

  it('lets a workflow inside the wave cap through', () => assert.equal(
    flow("await agent('one', { model: 'sonnet' }); await agent('two', { model: 'sonnet' })"), ALLOWED));
});

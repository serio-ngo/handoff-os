import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = 0;
const ASK = 'deny';
const PLUGIN = fileURLToPath(new URL('../../plugins/serio-focus/', import.meta.url));
const script = (name) => path.join(PLUGIN, 'scripts', name);

const boxes = [];
const sandbox = (prefix) => {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  boxes.push(root);
  return root;
};
after(() => {
  for (const dir of boxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { }
  }
});

const box = sandbox('guard-');
const fire = (file, payload, env = { ...process.env, HANDOFF_OS_DIR: box }) => spawnSync(process.execPath, [file], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
  encoding: 'utf8',
  env,
}).status;

const guard = (payload, env) => fire(script('guard.mjs'), payload, env);
const at = (session, payload) => guard({ cwd: box, session_id: session, ...payload },
  { ...process.env, HANDOFF_OS_DIR: box });
const sh = (session, command) => at(session, { tool_name: 'Bash', tool_input: { command } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const ask = (payload, env) => {
  const run = spawnSync(process.execPath, [script('guard.mjs')], {
    input: JSON.stringify(payload), encoding: 'utf8', env: env ?? { ...process.env, HANDOFF_OS_DIR: box },
  });
  assert.equal(run.status, ALLOWED);
  return JSON.parse(run.stdout).hookSpecificOutput.permissionDecision;
};
const blocks = (label, cases, payload) => it(label, () => {
  for (const c of cases) assert.equal(ask(payload(c)), ASK, c);
});

blocks('blocks git commit and push', [
  'git commit -m x',
  'git commit --verify -m x',
  'git -C sub commit -m x',
  'git push origin main',
  'git push --force origin main',
  'bash -c "git push origin main"',
  'powershell -Command "git commit -m x"',
], bash);

it('reopens commit and push while HANDOFF_GIT_WRITE is 1', () => {
  const open = (command) => guard({ cwd: box, session_id: 'git-open', tool_name: 'Bash', tool_input: { command } },
    { ...process.env, HANDOFF_OS_DIR: box, HANDOFF_GIT_WRITE: '1' });
  for (const command of ['git commit -m x', 'git push origin main']) {
    assert.equal(open(command), ALLOWED, command);
  }
});

it('allows git reads and local branch work', () => {
  for (const command of ['git status', 'git log --oneline', 'git diff --stat', 'git fetch origin',
    'git checkout main', 'git stash push -m wip', 'git branch feat/x', 'git merge main',
    'git push --dry-run origin main']) {
    assert.equal(at('git-ok', { tool_name: 'Bash', tool_input: { command } }), ALLOWED, command);
  }
});

blocks('blocks recursive deletes and git wipes', [
  'rm -rf docs',
  'rm -rf /',
  'ri -r docs',
  'Remove-Item -Recurse -Force docs',
  'git clean -fdx',
  'git reset --hard HEAD~1',
], bash);

it('allows deletes inside disposable paths', () => {
  for (const command of ['rm -rf node_modules/.cache/x', 'rm --help']) {
    assert.equal(at('rm-ok', { tool_name: 'Bash', tool_input: { command } }), ALLOWED, command);
  }
});

describe('dispatch budget', () => {
  const spawn = (tool_input, tool_name = 'Agent') => at('dp', { tool_name, tool_input });
  const held = (session, tool_input, tool_name = 'Agent') => ask({ cwd: box, session_id: session, tool_name, tool_input });

  it('blocks a dispatch that names no model, an unknown tier, and a denied tier from the agent definition', () => {
    assert.equal(held('dp', { prompt: 'x' }), ASK);
    assert.equal(held('dp', { prompt: 'x', model: 'best-available' }), ASK);
    mkdirSync(path.join(box, '.claude', 'agents'), { recursive: true });
    writeFileSync(path.join(box, '.claude', 'agents', 'pricey.md'), '---\nname: pricey\nmodel: opus\n---\n');
    const named = (tool_input) => at('dp-agents', { tool_name: 'Agent', tool_input });
    assert.equal(held('dp-agents', { prompt: 'x', subagent_type: 'pricey' }), ASK);
    assert.equal(named({ prompt: 'x', subagent_type: 'serio-focus:scout' }), ALLOWED);
  });
  it('blocks opus without a QUALITY flag, and thinking a deliverable did not earn', () => {
    assert.equal(held('dp', { prompt: 'scan the repo', model: 'opus' }), ASK);
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-dp.json'), 'utf8'));
    assert.equal(state.saved.redirects, 1);
    assert.equal(state.tiers.opus, 1);
    assert.equal(held('dp', { prompt: 'ultrathink about the schema', model: 'sonnet' }), ASK);
    assert.equal(spawn({ script: 'agent("find where opus is configured")' }, 'Workflow'), ALLOWED);
  });
  it('blocks a workflow that never states its agent count, and caps the count it states', () => {
    assert.equal(held('dp', { script: "await Promise.all(rows.map((r) => agent('x', { model: 'sonnet' })))" }, 'Workflow'), ASK);
    assert.equal(held('dp', { script: '// AGENTS: 30\nawait parallel(rows.map((r) => () => agent(r)))' }, 'Workflow'), ASK);
    assert.equal(spawn({ prompt: 'the wave a denied workflow claimed is free again', model: 'haiku' }), ALLOWED);
  });
  it('blocks the fourth agent in one wave', () => {
    for (let n = 0; n < 3; n += 1) spawn({ prompt: `s${n}`, model: 'haiku' });
    assert.equal(held('dp', { prompt: 'fourth', model: 'haiku' }), ASK);
  });
});

describe('fan-out cap', () => {
  const spawn = (session, tool_input, tool_name = 'Agent') => at(session, { tool_name, tool_input });
  const held = (session, tool_input, tool_name = 'Agent') => ask({ cwd: box, session_id: session, tool_name, tool_input });

  it('runs three agents per wave and holds the fourth', () => {
    for (let n = 0; n < 3; n += 1) assert.equal(spawn('wave', { prompt: `s${n}`, model: 'haiku' }), ALLOWED);
    assert.equal(held('wave', { prompt: 'fourth', model: 'haiku' }), ASK);
  });
  it('holds a declared 30-agent workflow wave', () => {
    assert.equal(held('wide', { script: '// AGENTS: 30\nawait parallel(rows.map((r) => agent(r)))' }, 'Workflow'), ASK);
  });
  it('lets a single workflow agent through', () => {
    assert.equal(spawn('narrow', { script: 'await agent("find where opus is configured")' }, 'Workflow'), ALLOWED);
  });
});

describe('read and query budgets', () => {
  const probe = path.join(box, 'probe.txt');

  const run = (session, payload) => spawnSync(process.execPath, [script('guard.mjs')], {
    input: JSON.stringify({ cwd: box, session_id: session, ...payload }), encoding: 'utf8', env: { ...process.env, HANDOFF_OS_DIR: box },
  });
  const state = (session) => JSON.parse(readFileSync(path.join(box, '.claude', `.session-${session}.json`), 'utf8'));
  const rewritten = (result) => JSON.parse(result.stdout).hookSpecificOutput;

  it('rewrites a whole-file read over the 24KB limit to a line slice and books the trimmed bytes', () => {
    writeFileSync(probe, `${'x'.repeat(63)}\n`.repeat(400));
    const result = run('bq', { tool_name: 'Read', tool_input: { file_path: probe } });
    assert.equal(result.status, ALLOWED);
    const out = rewritten(result);
    assert.equal(out.permissionDecision, 'allow');
    assert.ok(out.updatedInput.limit > 0 && out.updatedInput.limit < 400, String(out.updatedInput.limit));
    assert.equal(out.updatedInput.file_path, probe);
    assert.equal(state('bq').saved.trimmed, 400 * 64 - out.updatedInput.limit * 64);
    assert.equal(state('bq').saved.rewrites, 1);
  });
  it('names a scout subagent in a refused read unless HANDOFF_DELEGATE=0', () => {
    const file = path.join(box, 'delegate.txt');
    writeFileSync(file, 'delegated');
    const fire2 = (session, extra) => spawnSync(process.execPath, [script('guard.mjs')], {
      input: JSON.stringify({ cwd: box, session_id: session, tool_name: 'Read', tool_input: { file_path: file } }),
      encoding: 'utf8', env: { ...process.env, HANDOFF_OS_DIR: box, ...extra },
    });
    const decision = (result) => {
      assert.equal(result.status, ALLOWED);
      return JSON.parse(result.stdout).hookSpecificOutput;
    };
    fire2('dg', {});
    const on = decision(fire2('dg', {}));
    assert.equal(on.permissionDecision, ASK);
    assert.match(on.permissionDecisionReason, /scout subagent/);
    fire2('dg0', { HANDOFF_DELEGATE: '0' });
    const off = decision(fire2('dg0', { HANDOFF_DELEGATE: '0' }));
    assert.equal(off.permissionDecision, ASK);
    assert.doesNotMatch(off.permissionDecisionReason, /scout subagent/);
  });
  it('caps a content-mode Grep that names no head_limit', () => {
    const result = run('gc', { tool_name: 'Grep', tool_input: { pattern: 'todo', output_mode: 'content' } });
    assert.equal(result.status, ALLOWED);
    assert.equal(rewritten(result).updatedInput.head_limit, 50);
    assert.equal(state('gc').saved.caps, 1);
  });
  it('rewrites the read it judged, not an earlier copy of the same text, and keeps a spaced path whole', () => {
    const big = `${'x'.repeat(70)}\n`.repeat(500);
    const plain = path.join(box, 'echoed.txt');
    writeFileSync(plain, big);
    const echoed = run('ec', { tool_name: 'Bash', tool_input: { command: `echo "cat ${plain}" ; cat ${plain}` } });
    const cmd = rewritten(echoed).updatedInput.command;
    assert.match(cmd, /^echo "cat /, cmd);
    assert.equal(cmd.match(/head -c/g).length, 1, cmd);
    const guarded = run('or', { tool_name: 'Bash', tool_input: { command: `cat ${plain} || echo fallback` } });
    assert.match(rewritten(guarded).updatedInput.command, /^head -c \d+ \S+ \|\| echo fallback$/);

    const dir = path.join(box, 'with space');
    mkdirSync(dir, { recursive: true });
    const spaced = path.join(dir, 'big file.txt');
    writeFileSync(spaced, big);
    const quoted = run('sp', { tool_name: 'Bash', tool_input: { command: `cat "${spaced}"` } });
    assert.match(rewritten(quoted).updatedInput.command, /^head -c \d+ "/);
    assert.equal(state('sp').saved.rewrites, 1);
  });
  it('refuses an oversize read whose flag or redirect head -c cannot reproduce', () => {
    const flagged = path.join(box, 'flagged.txt');
    writeFileSync(flagged, `${'x'.repeat(70)}\n`.repeat(500));
    const hold = (session, command) => ask({ cwd: box, session_id: session, tool_name: 'Bash', tool_input: { command } });
    assert.equal(hold('fl', `cat -n ${flagged}`), ASK);
    assert.equal(hold('fl2', `cat ${flagged} 2>&1`), ASK);
    assert.equal(hold('fl3', `cat ${flagged} 1>&2`), ASK);
    const small = path.join(box, 'beside.txt');
    writeFileSync(small, 'beside');
    assert.equal(hold('fl4', `cat ${small}; cat -n ${flagged}`), ASK);
    assert.equal(at('fl4', { tool_name: 'Bash', tool_input: { command: `cat ${small}` } }), ALLOWED);
    assert.equal(state('fl4').saved.read, 6);
  });
  it('blocks a re-read of the same unchanged bytes', () => {
    writeFileSync(probe, 'small');
    at('bq', { tool_name: 'Read', tool_input: { file_path: probe } });
    assert.equal(ask({ cwd: box, session_id: 'bq', tool_name: 'Read', tool_input: { file_path: probe } }), ASK);
  });
  it('blocks the identical Grep a second time', () => {
    at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } });
    assert.equal(ask({ cwd: box, session_id: 'bq', tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ASK);
  });
  it('forgets answered queries after a shell write, never after a discard redirect', () => {
    at('wq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } });
    sh('wq', 'ls -d missing 2>/dev/null');
    assert.equal(ask({ cwd: box, session_id: 'wq', tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ASK);
    sh('wq', 'echo hi > $null');
    assert.equal(ask({ cwd: box, session_id: 'wq', tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ASK);
    sh('wq', 'echo hi > NUL');
    assert.equal(ask({ cwd: box, session_id: 'wq', tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ASK);
    sh('wq', 'echo hi >> probe2.txt');
    assert.equal(at('wq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ALLOWED);
  });
  it('credits a refused read once however often it is retried', () => {
    const file = path.join(box, 'retry.txt');
    writeFileSync(file, 'w'.repeat(30 * 1024));
    for (let n = 0; n < 3; n += 1) {
      assert.equal(ask({ cwd: box, session_id: 'rt', tool_name: 'Bash', tool_input: { command: `cat -n ${file}` } }), ASK);
    }
    assert.equal(state('rt').saved.slices, 1);
    assert.equal(state('rt').saved.deferred, 30 * 1024);
  });
});

describe('session receipt', () => {
  const GATE = script('verify.mjs');
  const run = (session, payload) => spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ cwd: box, session_id: session, ...payload }), encoding: 'utf8', env: { ...process.env, HANDOFF_OS_DIR: box },
  });

  it('stays silent with nothing to report', () => {
    const quiet = run('quiet', {});
    assert.equal(quiet.status, ALLOWED);
    assert.equal(quiet.stdout, '');
  });
  it('prints one receipt line after activity, never a gate', () => {
    const file = path.join(box, 'receipt.txt');
    writeFileSync(file, 'hello');
    at('rc-a', { tool_name: 'Read', tool_input: { file_path: file } });
    const first = run('rc-a', {});
    assert.equal(first.status, ALLOWED);
    assert.match(first.stdout, /SERIO FOCUS/);
    at('rc-b', { tool_name: 'Read', tool_input: { file_path: file } });
    const claim = run('rc-b', { last_assistant_message: 'All done, it works now.' });
    assert.equal(claim.status, ALLOWED);
    assert.match(claim.stdout, /SERIO FOCUS/);
    assert.doesNotMatch(claim.stdout, /VERIFY GATE|stood down|done claimed|nothing run/i);
  });
});

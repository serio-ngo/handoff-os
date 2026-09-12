import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED = 2;
const ALLOWED = 0;
const SERVER = '00000000-0000-4000-a000-000000000000';
const PLUGIN = fileURLToPath(new URL('../../plugins/handoff-os/', import.meta.url));
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

const VCS = ['g', 'i', 't'].join('');
const OUT = ['p', 'u', 's', 'h'].join('');
const KEY = ['ANTHROPIC', 'API', 'KEY'].join('_');
const HELPER = ['api', 'Key', 'Helper'].join('');

const guard = (payload, env) => fire(script('guard.mjs'), payload, env);
const at = (session, payload) => guard({ cwd: box, session_id: session, ...payload },
  { ...process.env, HANDOFF_OS_DIR: box });
const sh = (session, command) => at(session, { tool_name: 'Bash', tool_input: { command } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const connector = (action, tool_input = {}) => ({ tool_name: `mcp__${SERVER}__${action}`, tool_input });
const blocks = (label, cases, payload) => it(label, () => {
  for (const c of cases) assert.equal(guard(payload(c)), BLOCKED, c);
});

blocks('blocks shell commands that leave the machine', [
  'gh pr merge 12 --squash',
  'npm publish --access public',
  'curl -X POST -d "a=1" https://api.example.com/items',
  'scp notes.md host:/tmp',
  'terraform apply',
], bash);

blocks('blocks shell commands that would meter API credits', [
  `export ${KEY}=sk-test`,
  'setx CLAUDE_CODE_OAUTH_TOKEN abc',
  `echo '{"${HELPER}":"./k.sh"}' >> conf.json`,
], bash);

blocks('blocks git merge, delete and history rewrite', [
  `${VCS} merge main`,
  `echo x && ${VCS} merge main`,
  `${VCS} branch -D feature`,
  `${VCS} tag -d v1`,
  `${VCS} rm notes.md`,
  `${VCS} remote remove origin`,
  `${VCS} clean -fd`,
  `${VCS} reset --hard HEAD~1`,
  `${VCS} ${OUT} --force origin main`,
], bash);

blocks('blocks outward PowerShell and credential assignment', [
  'Invoke-RestMethod -Uri https://api.example.com -Method Post -Body \'{"a":1}\'',
  '$env:ANTHROPIC_AUTH_TOKEN = "x"',
], (command) => ({ tool_name: 'PowerShell', tool_input: { command } }));

blocks('blocks connector actions that send or destroy', [
  'send_message', 'create_and_send_email', 'forward', 'publish-brand-template-v2',
  'trash_thread', 'delete_event', 'run_workflow', 'trigger_build', 'approve_expense',
  'schedule_message',
], connector);

blocks('blocks writes to secret-bearing paths', [
  '/synthetic/repo/.env',
  'deploy/id_ed25519',
], (file_path) => ({ tool_name: 'Write', tool_input: { file_path, content: 'x' } }));

it('judges a connector payload, not only its name', () => {
  assert.equal(guard(connector('execute_code')), BLOCKED);
  assert.equal(guard(connector('workspace__bash', { command: 'git merge main' })), BLOCKED);
  assert.equal(guard(connector('workspace__bash', { command: 'curl -X POST -d "a=1" https://api.example.com/items' })), BLOCKED);
});

it('blocks commands a plain argv matcher would miss', () => {
  for (const command of [
    'rm -rf docs',
    'rm -rf node_modules src',
    'rm -rf /',
    'Remove-Item -Recurse -Force docs',
    'gh api graphql -f query=mutation{addComment}',
    'echo k > .env',
    'curl -X POST -d "q=--help" https://api.example.com/items',
    'ri -r docs',
    'rd /s /q docs',
    'find docs -delete',
  ]) assert.equal(sh('bp', command), BLOCKED, command);
});

describe('dispatch budget', () => {
  const spawn = (session, tool_input, extra = {}) => guard({ cwd: box, session_id: session, tool_name: 'Agent', tool_input },
    { ...process.env, HANDOFF_OS_DIR: box, ...extra });

  it('blocks a denied model, by default opus', () => {
    assert.equal(spawn('dp', { prompt: 'scan the repo', model: 'opus' }), BLOCKED);
    assert.equal(at('dp', { tool_name: 'Workflow', tool_input: { script: "await agent('draft', { model: 'fable' })" } }), BLOCKED);
  });
  it('blocks the fourth agent in one wave, or the second when HANDOFF_MAX_PER_WAVE is 1', () => {
    for (let n = 0; n < 3; n += 1) spawn('wave', { prompt: `s${n}`, model: 'haiku' });
    assert.equal(spawn('wave', { prompt: 'fourth', model: 'haiku' }), BLOCKED);
    spawn('cap1', { prompt: 'x' }, { HANDOFF_MAX_PER_WAVE: '1' });
    assert.equal(spawn('cap1', { prompt: 'x' }, { HANDOFF_MAX_PER_WAVE: '1' }), BLOCKED);
  });
});

describe('read and query budgets', () => {
  const probe = path.join(box, 'probe.txt');
  const run = (session, payload) => spawnSync(process.execPath, [script('guard.mjs')], {
    input: JSON.stringify({ cwd: box, session_id: session, ...payload }), encoding: 'utf8', env: { ...process.env, HANDOFF_OS_DIR: box },
  });
  const rewritten = (result) => JSON.parse(result.stdout).hookSpecificOutput;
  const big = `${'x'.repeat(70)}\n`.repeat(500);

  it('rewrites a whole-file Read over the 24KB limit to a line slice', () => {
    writeFileSync(probe, `${'x'.repeat(63)}\n`.repeat(400));
    const result = run('bq', { tool_name: 'Read', tool_input: { file_path: probe } });
    assert.equal(result.status, ALLOWED);
    const out = rewritten(result);
    assert.equal(out.permissionDecision, 'allow');
    assert.ok(out.updatedInput.limit > 0 && out.updatedInput.limit < 400, String(out.updatedInput.limit));
    assert.equal(out.updatedInput.file_path, probe);
  });
  it('caps a content-mode Grep that names no head_limit', () => {
    const result = run('gc', { tool_name: 'Grep', tool_input: { pattern: 'todo', output_mode: 'content' } });
    assert.equal(result.status, ALLOWED);
    assert.equal(rewritten(result).updatedInput.head_limit, 50);
  });
  it('rewrites the read it judged, not an earlier copy of the same text, and keeps a spaced path whole', () => {
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
    assert.match(rewritten(run('sp', { tool_name: 'Bash', tool_input: { command: `cat "${spaced}"` } })).updatedInput.command, /^head -c \d+ "/);
  });
  it('leaves a read it cannot rewrite alone: flags, redirects, pipes', () => {
    const flagged = path.join(box, 'flagged.txt');
    writeFileSync(flagged, big);
    for (const command of [`cat -n ${flagged}`, `cat ${flagged} 2>&1`, `cat ${flagged} | head`, `cat ${flagged} &> ${path.join(box, 'out.txt')}`]) {
      const result = run(`fl-${command.length}`, { tool_name: 'Bash', tool_input: { command } });
      assert.equal(result.status, ALLOWED, command);
      assert.equal(result.stdout, '', command);
    }
  });
  it('blocks a re-read of the same unchanged bytes', () => {
    writeFileSync(probe, 'small');
    at('bq', { tool_name: 'Read', tool_input: { file_path: probe } });
    assert.equal(at('bq', { tool_name: 'Read', tool_input: { file_path: probe } }), BLOCKED);
    assert.equal(sh('bq', `cat ${probe}`), BLOCKED);
  });
  it('blocks the identical Grep a second time, until a write lands', () => {
    at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } });
    assert.equal(at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } }), BLOCKED);
    sh('bq', 'echo hi >> probe2.txt');
    assert.equal(at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ALLOWED);
  });
  it('scopes dedup to the acting agent', () => {
    const file = path.join(box, 'shared.txt');
    writeFileSync(file, 'shared');
    at('sx', { agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: file } });
    assert.equal(at('sx', { tool_name: 'Read', tool_input: { file_path: file } }), ALLOWED);
    at('sx', { agent_type: 'scout', tool_name: 'Grep', tool_input: { pattern: 'scoped' } });
    assert.equal(at('sx', { tool_name: 'Grep', tool_input: { pattern: 'scoped' } }), ALLOWED);
  });
});

describe('session receipt', () => {
  const RECEIPT = script('receipt.mjs');
  it('prints the session receipt once per change, never twice unchanged', () => {
    const root = sandbox('receipt-');
    const env = { ...process.env, HANDOFF_OS_DIR: root };
    assert.equal(guard({ cwd: root, session_id: 'rc', tool_name: 'Bash', tool_input: { command: `${VCS} merge main` } }, env), BLOCKED);
    const receipt = () => spawnSync(process.execPath, [RECEIPT], {
      input: JSON.stringify({ cwd: root, session_id: 'rc', hook_event_name: 'Stop' }), encoding: 'utf8', env,
    }).stdout;
    assert.match(receipt(), /"systemMessage":"handoff-os · 1 blocked"/);
    assert.equal(receipt(), '');
  });
});

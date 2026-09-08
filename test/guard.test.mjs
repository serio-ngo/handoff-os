import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAWN_TOOLS } from '../plugins/handoff-os/scripts/patterns.mjs';

const BLOCKED = 2;
const ALLOWED = 0;
const SERVER = '00000000-0000-4000-a000-000000000000';
const PLUGIN = fileURLToPath(new URL('../plugins/handoff-os/', import.meta.url));
const script = (name) => path.join(PLUGIN, 'scripts', name);
const hooks = JSON.parse(readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks;

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

const fire = (file, payload, env) => spawnSync(process.execPath, [file], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
  encoding: 'utf8',
  env: env ?? process.env,
}).status;

const VCS = ['g', 'i', 't'].join('');
const OUT = ['p', 'u', 's', 'h'].join('');
const KEY = ['ANTHROPIC', 'API', 'KEY'].join('_');
const HELPER = ['api', 'Key', 'Helper'].join('');
const ACCOUNT = 'PL10000000000000000000000000';
const ENC = Buffer.from([VCS, 'merge', 'main'].join(' '), 'utf16le').toString('base64');

const box = sandbox('guard-');
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
  'gh pr create --title x --body y',
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
], connector);

blocks('blocks raw web-fetch connectors', [
  'mcp__tavily__search', 'mcp__fetch__fetch_url', 'mcp__brave-search__web_search',
], (name) => ({ tool_name: name, tool_input: {} }));

blocks('blocks writes to brand-locked and secret-bearing paths', [
  'assets/brand/logo.png',
  '/synthetic/repo/.env',
  'deploy/id_ed25519',
  '/synthetic/repo/contacts.csv',
], (file_path) => ({ tool_name: 'Write', tool_input: { file_path, content: 'x' } }));

it('judges a connector payload, not only its name', () => {
  assert.equal(guard(connector('d1_database_query', { sql: 'DROP TABLE donors' })), BLOCKED);
  assert.equal(guard(connector('execute_code')), BLOCKED);
});

it('blocks every state-changing git command under HANDOFF_LOCK_GIT=1', () => {
  for (const command of [`${VCS} ${OUT} origin main`, `${VCS} commit -m x`, `${VCS} add -A`]) {
    assert.equal(guard(bash(command), { ...process.env, HANDOFF_LOCK_GIT: '1' }), BLOCKED, command);
  }
});

it('blocks an account number through Write, Edit and a shell redirect', () => {
  assert.equal(guard({ tool_name: 'Write', tool_input: { file_path: 'notes.md', content: `IBAN ${ACCOUNT}` } }), BLOCKED);
  assert.equal(guard({ tool_name: 'Edit', tool_input: { file_path: 'notes.md', old_string: 'a', new_string: ACCOUNT } }), BLOCKED);
  assert.equal(sh('ac', `echo ${ACCOUNT} >> README.md`), BLOCKED);
});

it('blocks commands a plain argv matcher would miss', () => {
  for (const command of [
    `command ${VCS} merge main`,
    `eval "${VCS} merge main"`,
    `cmd /c "${VCS} merge main"`,
    `powershell -Command "${VCS} merge main"`,
    'rm -rf docs',
    'rm -rf node_modules src',
    'rm -rf /',
    'Remove-Item -Recurse -Force docs',
    'gh api graphql -f query=mutation{addComment}',
    'python -c "import requests;requests.post(u, json=d)"',
    'echo k > .env',
    `cmd /c ${VCS} merge main`,
    `powershell -Command ${VCS} merge main`,
    `bash -c ${VCS} merge main`,
    `pwsh -NoProfile -Command rm -rf docs`,
    `powershell -EncodedCommand ${ENC}`,
    'curl -X POST -d "q=--help" https://api.example.com/items',
  ]) assert.equal(sh('bp', command), BLOCKED, command);
});

describe('dispatch budget', () => {
  const spawn = (tool_input, tool_name = 'Agent') => at('dp', { tool_name, tool_input });

  it('blocks a dispatch that names no model or an unknown tier', () => {
    assert.equal(spawn({ prompt: 'x' }), BLOCKED);
    assert.equal(spawn({ prompt: 'x', model: 'best-available' }), BLOCKED);
  });
  it('blocks opus without a QUALITY flag, and thinking a deliverable did not earn', () => {
    assert.equal(spawn({ prompt: 'scan the repo', model: 'opus' }), BLOCKED);
    assert.equal(spawn({ prompt: 'ultrathink about the schema', model: 'sonnet' }), BLOCKED);
  });
  it('blocks a workflow that never states its agent count', () => assert.equal(
    spawn({ script: "await Promise.all(rows.map((r) => agent('x', { model: 'sonnet' })))" }, 'Workflow'), BLOCKED));
  it('blocks the fourth agent in one wave', () => {
    for (let n = 0; n < 3; n += 1) spawn({ prompt: `s${n}`, model: 'haiku' });
    assert.equal(spawn({ prompt: 'fourth', model: 'haiku' }), BLOCKED);
  });
});

describe('read and query budgets', () => {
  const probe = path.join(box, 'probe.txt');

  it('blocks a whole-file read over the 24KB limit', () => {
    writeFileSync(probe, 'x'.repeat(25 * 1024));
    assert.equal(at('bq', { tool_name: 'Read', tool_input: { file_path: probe } }), BLOCKED);
  });
  it('blocks a re-read of the same unchanged bytes', () => {
    writeFileSync(probe, 'small');
    at('bq', { tool_name: 'Read', tool_input: { file_path: probe } });
    assert.equal(at('bq', { tool_name: 'Read', tool_input: { file_path: probe } }), BLOCKED);
  });
  it('blocks the identical Grep a second time', () => {
    at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } });
    assert.equal(at('bq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } }), BLOCKED);
  });
  it('forgets answered queries after a shell write', () => {
    at('wq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } });
    sh('wq', 'echo hi >> probe2.txt');
    assert.equal(at('wq', { tool_name: 'Grep', tool_input: { pattern: 'todo' } }), ALLOWED);
  });
  it('scopes dedup to the acting agent', () => {
    const file = path.join(box, 'shared.txt');
    writeFileSync(file, 'shared');
    at('sx', { agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: file } });
    assert.equal(at('sx', { tool_name: 'Read', tool_input: { file_path: file } }), ALLOWED);
    at('sx', { agent_type: 'scout', tool_name: 'Grep', tool_input: { pattern: 'scoped' } });
    assert.equal(at('sx', { tool_name: 'Grep', tool_input: { pattern: 'scoped' } }), ALLOWED);
  });
  it('books a subagent read as offloaded, not admitted to the main thread', () => {
    const file = path.join(box, 'offload.txt');
    writeFileSync(file, 'z'.repeat(2048));
    at('of', { agent_type: 'handoff-os:scout', tool_name: 'Read', tool_input: { file_path: file } });
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-of.json'), 'utf8'));
    assert.equal(state.saved.offload, 2048);
    assert.equal(state.saved.read, 0);
  });
  it('books a repeat query apart from a file re-read, so byte totals stay honest', () => {
    at('rq', { tool_name: 'Grep', tool_input: { pattern: 'apart' } });
    assert.equal(at('rq', { tool_name: 'Grep', tool_input: { pattern: 'apart' } }), BLOCKED);
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-rq.json'), 'utf8'));
    assert.equal(state.saved.queries, 1);
    assert.equal(state.saved.rereads, 0);
    assert.equal(state.saved.bytes, 0);
  });
  it('books a ceiling block as deferred, not deduped', () => {
    const file = path.join(box, 'ceil-small.txt');
    writeFileSync(file, 'y'.repeat(1024));
    mkdirSync(path.join(box, '.claude'), { recursive: true });
    writeFileSync(path.join(box, '.claude', '.session-cl.json'),
      JSON.stringify({ reads: {}, read_bytes: 600000, saved: {} }), 'utf8');
    assert.equal(at('cl', { tool_name: 'Read', tool_input: { file_path: file } }), BLOCKED);
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-cl.json'), 'utf8'));
    assert.equal(state.saved.deferred, 1024);
    assert.equal(state.saved.bytes, 0);
  });
});

describe('verify gate', () => {
  const GATE = script('verify.mjs');
  const repoWith = (scripts) => {
    const root = sandbox('verify-');
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'probe', scripts }), 'utf8');
    return root;
  };
  const transcript = (root, text) => {
    const file = path.join(root, 'transcript.jsonl');
    writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`, 'utf8');
    return file;
  };
  const boxed = (root) => ({ ...process.env, HANDOFF_OS_DIR: root, CLAUDE_PROJECT_DIR: root });
  const stop = (root, payload) => fire(GATE, { cwd: root, ...payload }, boxed(root));

  it('blocks a done-claim no run supports, from the transcript, the payload, or beside a handoff card', () => {
    const root = repoWith({ verify: 'node --version' });
    const card = 'The refactor is finished.\n\nDONE post drafted\nFILE x.md\nYOU post -> Show HN -> today';
    assert.equal(stop(root, { session_id: 'unproven', transcript_path: transcript(root, 'All done, it works now.') }), BLOCKED);
    assert.equal(stop(root, { session_id: 'direct', last_assistant_message: 'Shipped.' }), BLOCKED);
    assert.equal(stop(root, { session_id: 'carded', transcript_path: transcript(root, card) }), BLOCKED);
  });

  it('stands down after two blocks so a session cannot be trapped', () => {
    const root = repoWith({ verify: 'node --version' });
    const claim = { session_id: 'stubborn', transcript_path: transcript(root, 'Done.') };
    assert.equal(stop(root, claim), BLOCKED);
    assert.equal(stop(root, claim), BLOCKED);
    assert.equal(stop(root, claim), ALLOWED);
  });

  it('writes no marker when the verification command fails', () => {
    const root = repoWith({ verify: 'node --eval "process.exit(1)"' });
    assert.notEqual(spawnSync(process.execPath, [GATE, 'red', root], { encoding: 'utf8', env: boxed(root) }).status, 0);
    assert.ok(!existsSync(path.join(root, '.claude', '.verified-red')));
  });

  it('blocks a substantive scout return that cites nothing', () => {
    const text = 'The repository routes every outward verb through one gate. '.repeat(4);
    assert.equal(stop(sandbox('scout-'), { hook_event_name: 'SubagentStop', last_assistant_message: text }), BLOCKED);
  });
});

describe('hooks', () => {
  it('never lets the audit interfere: exits 0 on garbage and on a payload naming no tool', () => {
    const root = sandbox('audit-');
    const env = { ...process.env, HANDOFF_OS_DIR: root };
    assert.equal(fire(script('audit.mjs'), '{not json', env), ALLOWED);
    assert.equal(fire(script('audit.mjs'), {}, env), ALLOWED);
    assert.ok(!existsSync(path.join(root, 'audit')));
  });

  it('tiers shell calls yellow and inside file reads green', () => {
    const root = sandbox('audit-');
    const env = { ...process.env, HANDOFF_OS_DIR: root };
    const month = new Date().toISOString().slice(0, 7);
    assert.equal(fire(script('audit.mjs'), { tool_name: 'Bash', tool_input: { command: 'ls' } }, env), ALLOWED);
    assert.equal(fire(script('audit.mjs'), { tool_name: 'Read', tool_input: { file_path: path.join(root, 'notes.md') } }, env), ALLOWED);
    const lines = readFileSync(path.join(root, 'audit', `${month}.jsonl`), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(lines[0].tier, 'YELLOW');
    assert.equal(lines[1].tier, 'GREEN');
  });

  it('releases the read ceiling on compact and clear, keeps it on startup and resume', () => {
    const root = sandbox('card-');
    const ledger = path.join(root, '.claude', '.session-rel.json');
    for (const [source, want] of [['compact', 0], ['clear', 0], ['startup', 600000], ['resume', 600000]]) {
      mkdirSync(path.join(root, '.claude'), { recursive: true });
      writeFileSync(ledger, JSON.stringify({ reads: { 'a.md': '1:2' }, read_bytes: 600000, saved: {} }), 'utf8');
      fire(script('card.mjs'), { session_id: 'rel', cwd: root, hook_event_name: 'SessionStart', source },
        { ...process.env, HANDOFF_OS_DIR: root });
      assert.equal(JSON.parse(readFileSync(ledger, 'utf8')).read_bytes, want, source);
    }
  });

  it('routes every judged tool to one guard, audits connector writes but not reads', () => {
    assert.equal(hooks.PreToolUse.length, 1);
    const pre = new RegExp(hooks.PreToolUse[0].matcher);
    for (const tool of ['Read', 'Bash', 'PowerShell', 'Edit', 'Write', 'Grep', 'Glob', 'mcp__server__send', ...SPAWN_TOOLS]) {
      assert.ok(pre.test(tool), tool);
    }
    const post = new RegExp(hooks.PostToolUse[0].matcher);
    for (const action of ['get_thread', 'list_labels', 'search_threads']) assert.ok(!post.test(`mcp__${SERVER}__${action}`), action);
    for (const action of ['send_message', 'create_update', 'delete_item']) assert.ok(post.test(`mcp__${SERVER}__${action}`), action);
  });

  it('fires the card at every session start and points every command at a script that exists', () => {
    for (const source of ['startup', 'resume', 'clear', 'compact', 'fork']) {
      assert.match(hooks.SessionStart[0].matcher, new RegExp(source), source);
    }
    for (const entries of Object.values(hooks)) for (const entry of entries) for (const handler of entry.hooks) {
      const file = (/scripts\/[a-z-]+\.mjs/.exec(handler.command) || [])[0];
      assert.ok(file && existsSync(path.join(PLUGIN, file)), handler.command);
    }
  });
});

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAWN_TOOLS, WRITE_TOOLS } from '../../plugins/handoff-os/scripts/lib/patterns.mjs';

const BLOCKED = 2;
const ALLOWED = 0;
const SERVER = '00000000-0000-4000-a000-000000000000';
const PLUGIN = fileURLToPath(new URL('../../plugins/handoff-os/', import.meta.url));
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
const ACCOUNT = 'PL10000000000000000000000000';
const ENC = Buffer.from([VCS, 'merge', 'main'].join(' '), 'utf16le').toString('base64');

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
  assert.equal(guard(connector('workspace__bash', { command: 'git merge main' })), BLOCKED);
  assert.equal(guard(connector('workspace__bash', { command: 'curl -X POST -d "a=1" https://api.example.com/items' })), BLOCKED);
});

it('blocks every state-changing git command while HANDOFF_GIT_WRITE is not 1', () => {
  for (const command of [`${VCS} ${OUT} origin main`, `${VCS} commit -m x`, `${VCS} add -A`, `${VCS} switch -c feat/x`, `${VCS} branch feat/x`]) {
    assert.equal(guard(bash(command), { ...process.env, HANDOFF_OS_DIR: box, HANDOFF_GIT_WRITE: '0' }), BLOCKED, command);
  }
});

it('blocks an account number through Write, Edit, MultiEdit, NotebookEdit and a shell redirect', () => {
  assert.equal(guard({ tool_name: 'Write', tool_input: { file_path: 'notes.md', content: `IBAN ${ACCOUNT}` } }), BLOCKED);
  assert.equal(guard({ tool_name: 'Edit', tool_input: { file_path: 'notes.md', old_string: 'a', new_string: ACCOUNT } }), BLOCKED);
  assert.equal(guard({ tool_name: 'MultiEdit', tool_input: { file_path: 'notes.md', edits: [{ old_string: 'a', new_string: ACCOUNT }] } }), BLOCKED);
  assert.equal(guard({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'notes.ipynb', new_source: ACCOUNT } }), BLOCKED);
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
    'ri -r docs',
    'rd /s /q docs',
    'find docs -delete',
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
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-dp.json'), 'utf8'));
    assert.equal(state.saved.redirects, 1);
    assert.equal(state.tiers.opus, 1);
    assert.equal(spawn({ prompt: 'ultrathink about the schema', model: 'sonnet' }), BLOCKED);
    assert.equal(spawn({ script: 'agent("find where opus is configured")' }, 'Workflow'), ALLOWED);
  });
  it('blocks a workflow that never states its agent count, and caps the count it states', () => {
    assert.equal(spawn({ script: "await Promise.all(rows.map((r) => agent('x', { model: 'sonnet' })))" }, 'Workflow'), BLOCKED);
    assert.equal(spawn({ script: '// AGENTS: 30\nawait parallel(rows.map((r) => () => agent(r)))' }, 'Workflow'), BLOCKED);
    assert.equal(spawn({ prompt: 'the wave a denied workflow claimed is free again', model: 'haiku' }), ALLOWED);
  });
  it('caps the wave when a stale file sits where the wave directory belongs', () => {
    mkdirSync(path.join(box, '.claude'), { recursive: true });
    writeFileSync(path.join(box, '.claude', '.wave-stale'), 'not a directory', 'utf8');
    const run = () => at('stale', { tool_name: 'Agent', tool_input: { prompt: 'x', model: 'haiku' } });
    run(); run(); run();
    assert.equal(run(), BLOCKED);
  });
  it('blocks the fourth agent in one wave', () => {
    for (let n = 0; n < 3; n += 1) spawn({ prompt: `s${n}`, model: 'haiku' });
    assert.equal(spawn({ prompt: 'fourth', model: 'haiku' }), BLOCKED);
  });
  it('caps the wave at HANDOFF_MAX_PER_WAVE, defaulting to 3 on garbage', () => {
    const run = (session, extra = {}) => guard({ cwd: box, session_id: session, tool_name: 'Agent', tool_input: { prompt: 'x', model: 'haiku' } },
      { ...process.env, HANDOFF_OS_DIR: box, ...extra });
    run('cap1', { HANDOFF_MAX_PER_WAVE: '1' });
    assert.equal(run('cap1', { HANDOFF_MAX_PER_WAVE: '1' }), BLOCKED);
    for (let n = 0; n < 3; n += 1) run('cap3', { HANDOFF_MAX_PER_WAVE: 'bogus' });
    assert.equal(run('cap3', { HANDOFF_MAX_PER_WAVE: 'bogus' }), BLOCKED);
  });
  it('counts a capped wave as blocked', () => {
    const run = () => at('wv', { tool_name: 'Agent', tool_input: { prompt: 'x', model: 'haiku' } });
    run(); run(); run();
    assert.equal(run(), BLOCKED);
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-wv.json'), 'utf8'));
    assert.equal(state.saved.blocked, 1);
    assert.equal(state.saved.agents, 3);
    assert.equal(state.saved.waves, 1);
    assert.equal(state.saved.agentsCapped, 1);
  });
  it('counts scout and runner dispatches apart from the wave', () => {
    const run = (subagent_type) => at('ct', { tool_name: 'Agent', tool_input: { prompt: 'x', model: 'haiku', subagent_type } });
    assert.equal(run('handoff-os:scout'), ALLOWED);
    assert.equal(run('handoff-os:runner'), ALLOWED);
    const state = JSON.parse(readFileSync(path.join(box, '.claude', '.session-ct.json'), 'utf8'));
    assert.equal(state.saved.scouts, 1);
    assert.equal(state.saved.runners, 1);
    assert.equal(state.saved.agents, 2);
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
  it('caps a content-mode Grep that names no head_limit', () => {
    const result = run('gc', { tool_name: 'Grep', tool_input: { pattern: 'todo', output_mode: 'content' } });
    assert.equal(result.status, ALLOWED);
    assert.equal(rewritten(result).updatedInput.head_limit, 50);
    assert.equal(state('gc').saved.caps, 1);
  });
  it('books a sed slice as admitted bytes, never as kept out', () => {
    const file = path.join(box, 'slice.txt');
    writeFileSync(file, `${'s'.repeat(63)}\n`.repeat(100));
    assert.equal(sh('sl', `sed -n '11,20p' ${file}`), ALLOWED);
    assert.equal(state('sl').saved.read, 640);
    assert.equal(state('sl').saved.trimmed + state('sl').saved.deferred + state('sl').saved.bytes, 0);
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
    assert.equal(sh('fl', `cat -n ${flagged}`), BLOCKED);
    assert.equal(sh('fl2', `cat ${flagged} 2>&1`), BLOCKED);
    assert.equal(sh('fl3', `cat ${flagged} 1>&2`), BLOCKED);
    const small = path.join(box, 'beside.txt');
    writeFileSync(small, 'beside');
    assert.equal(sh('fl4', `cat ${small}; cat -n ${flagged}`), BLOCKED);
    assert.equal(sh('fl4', `cat ${small}`), ALLOWED);
    assert.equal(state('fl4').saved.read, 6);
  });
  it('leaves a read redirected into a file alone — its bytes never reach the thread', () => {
    const piped = path.join(box, 'piped.txt');
    writeFileSync(piped, `${'x'.repeat(70)}\n`.repeat(500));
    const result = run('rd', { tool_name: 'Bash', tool_input: { command: `cat ${piped} &> ${path.join(box, 'out.txt')}` } });
    assert.equal(result.status, ALLOWED);
    assert.equal(result.stdout, '');
  });
  it('lets many small whole-file reads through — only bytes bound the thread', () => {
    for (let n = 0; n < 12; n += 1) {
      const file = path.join(box, `whole-${n}.txt`);
      writeFileSync(file, String(n).repeat(64));
      assert.equal(at('dl', { tool_name: 'Read', tool_input: { file_path: file } }), ALLOWED, file);
    }
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
  it('credits a refused read once however often it is retried', () => {
    const file = path.join(box, 'retry.txt');
    writeFileSync(file, 'w'.repeat(30 * 1024));
    for (let n = 0; n < 3; n += 1) {
      assert.equal(sh('rt', `cat -n ${file}`), BLOCKED);
    }
    assert.equal(state('rt').saved.slices, 1);
    assert.equal(state('rt').saved.deferred, 30 * 1024);
  });
  it('never blocks a read on how much the session has already read', () => {
    for (let n = 0; n < 40; n += 1) {
      const file = path.join(box, `long-${n}.txt`);
      writeFileSync(file, 'q'.repeat(20 * 1024));
      assert.equal(at('lg', { tool_name: 'Read', tool_input: { file_path: file } }), ALLOWED, file);
    }
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
  const wrote = (root, session_id) => guard({ cwd: root, session_id, tool_name: 'Edit', tool_input: { file_path: path.join(root, 'x.md'), old_string: 'a', new_string: 'b' } }, boxed(root));
  const proved = (root, session) => spawnSync(process.execPath, [GATE, session, root], { env: boxed(root), encoding: 'utf8' }).status;

  it('blocks a done-claim no run supports, from the transcript, the payload, or beside a handoff card, and never a sentence that claims nothing', () => {
    const root = repoWith({ verify: 'node --version' });
    const card = 'The refactor is finished.\n\nDONE post drafted\nFILE x.md\nYOU post -> Show HN -> today';
    for (const session of ['unproven', 'direct', 'carded', 'nonclaim']) wrote(root, session);
    assert.equal(stop(root, { session_id: 'unproven', transcript_path: transcript(root, 'All done, it works now.') }), BLOCKED);
    assert.equal(stop(root, { session_id: 'direct', last_assistant_message: 'Shipped.' }), BLOCKED);
    assert.equal(JSON.parse(readFileSync(path.join(root, '.claude', '.session-direct.json'), 'utf8')).saved.gated, 1);
    assert.equal(stop(root, { session_id: 'carded', transcript_path: transcript(root, card) }), BLOCKED);
    for (const text of ['I am ready to start', 'not fixed yet', 'step is complete; next…', 'nothing was done']) {
      assert.equal(stop(root, { session_id: 'nonclaim', last_assistant_message: text }), ALLOWED, text);
    }
    assert.equal(stop(root, { session_id: 'lookup-only', last_assistant_message: 'Done.' }), ALLOWED);
  });

  it('gates a done-claim again once a write follows the proving run', () => {
    const root = repoWith({ verify: 'node --version' });
    wrote(root, 'rearm');
    assert.equal(proved(root, 'rearm'), ALLOWED);
    wrote(root, 'rearm');
    assert.equal(stop(root, { session_id: 'rearm', last_assistant_message: 'Done.' }), BLOCKED);
  });

  it('stands down after two blocks so a session cannot be trapped', () => {
    const root = repoWith({ verify: 'node --version' });
    wrote(root, 'stubborn');
    const claim = { session_id: 'stubborn', transcript_path: transcript(root, 'Done.') };
    assert.equal(stop(root, claim), BLOCKED);
    assert.equal(stop(root, claim), BLOCKED);
    assert.equal(stop(root, claim), ALLOWED);
  });

  it('prints the session receipt once per change, never twice unchanged', () => {
    const root = sandbox('receipt-');
    const env = boxed(root);
    assert.equal(guard({ cwd: root, session_id: 'rc', tool_name: 'Bash', tool_input: { command: `${VCS} merge main` } }, env), BLOCKED);
    const receipt = () => spawnSync(process.execPath, [GATE], {
      input: JSON.stringify({ cwd: root, session_id: 'rc', hook_event_name: 'Stop' }), encoding: 'utf8', env,
    }).stdout;
    assert.match(receipt(), /"systemMessage":"HANDOFF OS · 1 blocked"/);
    assert.equal(receipt(), '');
  });

  it('blocks a substantive scout return that cites nothing', () => {
    const text = 'The repository routes every outward verb through one gate. '.repeat(4);
    assert.equal(stop(sandbox('scout-'), { hook_event_name: 'SubagentStop', last_assistant_message: text }), BLOCKED);
  });
});

describe('hooks', () => {
  it('routes every judged tool to one guard, audits connector writes but not reads', () => {
    assert.equal(hooks.PreToolUse.length, 1);
    const pre = new RegExp(hooks.PreToolUse[0].matcher);
    for (const tool of ['Read', 'Bash', 'PowerShell', 'Grep', 'Glob', 'mcp__server__send', ...WRITE_TOOLS, ...SPAWN_TOOLS]) {
      assert.ok(pre.test(tool), tool);
    }
    const post = new RegExp(hooks.PostToolUse[0].matcher);
    for (const action of ['get_thread', 'list_labels', 'search_threads']) assert.ok(!post.test(`mcp__${SERVER}__${action}`), action);
    for (const action of ['send_message', 'create_update', 'delete_item']) assert.ok(post.test(`mcp__${SERVER}__${action}`), action);
    for (const tool of WRITE_TOOLS) assert.ok(post.test(tool), tool);
  });
});

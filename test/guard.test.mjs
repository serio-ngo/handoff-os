import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED, BLOCKED, SERVER, fire, sandbox, scrub } from './helper.mjs';

const GUARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/guard.mjs', import.meta.url));
const MAX_PER_WAVE = 3;

const verdict = (payload) => fire(GUARD, payload).status;
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const powershell = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
const connector = (action) => ({ tool_name: `mcp__${SERVER}__${action}`, tool_input: {} });
const write = (file_path, content = 'x') => ({ tool_name: 'Write', tool_input: { file_path, content } });
const edit = (file_path, new_string = 'x') => ({ tool_name: 'Edit', tool_input: { file_path, old_string: 'a', new_string } });

const VCS = ['g', 'i', 't'].join('');
const OUT = ['p', 'u', 's', 'h'].join('');
const KEY = ['ANTHROPIC', 'API', 'KEY'].join('_');
const ACCOUNT = 'PL10000000000000000000000000';
const ACCOUNT_SPACED = 'DE89 3704 0044 0532 0130 00';

const blocks = (label, cases, payload) => it(label, () => {
  for (const c of cases) assert.equal(verdict(payload(c)), BLOCKED, c);
});
const allows = (label, cases, payload) => it(label, () => {
  for (const c of cases) assert.equal(verdict(payload(c)), ALLOWED, c);
});

after(scrub);

blocks('shell commands that leave the machine', [
  'gh pr create --title x --body y',
  'gh api repos/a/b/issues -X POST -f title=x',
  'npm publish --access public',
  'curl -X POST -d "a=1" https://api.example.com/items',
  "wget --post-data 'a=1' https://collector.example/x",
  'scp notes.md host:/tmp',
  'ssh host uptime',
  'docker push registry.example/img',
  'terraform apply',
  'vercel deploy',
], bash);

blocks('shell commands that would start spending API credits', [
  `export ${KEY}=sk-test`,
  'setx CLAUDE_CODE_OAUTH_TOKEN abc',
  'echo apiKeyHelper: ./k.sh >> settings.json',
], bash);

describe('git by default: everything but a merge or a delete', () => {
  it('allows the ordinary write commands, in every shape the matcher must see', () => {
    for (const command of [
      `${VCS} ${OUT} origin main`,
      `${VCS} --no-pager ${OUT} origin main`,
      `${VCS} -C /other/repo ${OUT} origin main`,
      `echo staged && ${VCS} ${OUT}`,
      `bash -c "${VCS} ${OUT} origin main"`,
      `${VCS} commit -m "work"`,
      `${VCS} add -A`,
      `${VCS} checkout -b feature`,
      `${VCS} rebase main`,
      `${VCS} stash`,
      `${VCS} remote set-url origin https://elsewhere.example/r.git`,
    ]) assert.equal(verdict(bash(command)), ALLOWED, command);
  });

  it('never allows a merge or a delete, whatever the flags', () => {
    for (const command of [
      `${VCS} merge main`,
      `${VCS} --no-pager merge main`,
      `echo x && ${VCS} merge main`,
      `${VCS} branch -D feature`,
      `${VCS} branch --delete feature`,
      `${VCS} tag -d v1`,
      `${VCS} ${OUT} --delete origin feature`,
      `${VCS} ${OUT} --force origin main`,
      `${VCS} rm notes.md`,
      `${VCS} remote remove origin`,
      `${VCS} stash drop`,
      `${VCS} clean -fd`,
      `${VCS} reset --hard HEAD~1`,
    ]) assert.equal(verdict(bash(command)), BLOCKED, command);
  });

  it('reads a merge or delete near-miss as ordinary work', () => {
    for (const command of [
      `${VCS} log --merges`,
      `${VCS} branch -a`,
      `${VCS} tag -l`,
      `${VCS} reset --soft HEAD~1`,
      `${VCS} clean -n`,
      `${VCS} stash list`,
    ]) assert.equal(verdict(bash(command)), ALLOWED, command);
  });
});

describe('git lock mode (HANDOFF_LOCK_GIT=1) restores the total ban', () => {
  const locked = (payload) => fire(GUARD, payload, { ...process.env, HANDOFF_LOCK_GIT: '1' }).status;

  it('blocks every state-changing git command', () => {
    for (const command of [`${VCS} ${OUT} origin main`, `${VCS} commit -m x`, `${VCS} add -A`,
      `${VCS} checkout -b feature`, `${VCS} stash`]) {
      assert.equal(locked(bash(command)), BLOCKED, command);
    }
  });

  it('leaves the read-only commands alone, so the agent can still see the repo', () => {
    for (const command of [`${VCS} status`, `${VCS} diff`, `${VCS} log --oneline -5`]) {
      assert.equal(locked(bash(command)), ALLOWED, command);
    }
  });

  it('still blocks everything else outward', () => {
    assert.equal(locked(bash('npm publish --access public')), BLOCKED);
    assert.equal(locked(bash('curl -X POST -d "a=1" https://api.example.com/items')), BLOCKED);
    assert.equal(locked(connector('send_message')), BLOCKED);
  });
});

describe('the HANDOFF_MCP_ALLOW escape hatch', () => {
  const env = { ...process.env, HANDOFF_MCP_ALLOW: 'submission_status' };

  it('admits a listed connector action the verb lock would trip on', () => {
    assert.equal(fire(GUARD, connector('submission_status'), env).status, ALLOWED);
  });

  it('leaves every unlisted action under the lock', () => {
    assert.equal(fire(GUARD, connector('send_message'), env).status, BLOCKED);
    assert.equal(fire(GUARD, connector('submission_status')).status, BLOCKED);
  });
});

allows('read-only and inward shell commands', [
  `${VCS} status`,
  `${VCS} diff`,
  `${VCS} commit -m "x"`,
  'npm run build',
  'curl https://api.example.com/health',
  'echo hi > /tmp/out.txt',
], bash);

describe('an egress word that is data, not a command', () => {
  it(`allows the outward verb quoted inside another interpreter's source`, () => {
    assert.equal(verdict(bash(`node -e "const s='${VCS} ${OUT}'; console.log(s)"`)), ALLOWED);
  });

  it('allows writing a permission rule that names the blocked command', () => {
    assert.equal(verdict(bash(`echo 'Bash(${VCS} ${OUT} *)' > policy.txt`)), ALLOWED);
  });

  it('allows a pipe that appears inside a quoted regex', () => {
    assert.equal(verdict(bash(`node -e "const re=/(scp|ssh|rsync)/; console.log(re)"`)), ALLOWED);
  });

  it('still blocks the same verb once it is genuinely the command', () => {
    assert.equal(verdict(bash(`${VCS} ${OUT} --force`)), BLOCKED);
  });
});

blocks('git operations that merge or delete, in any mode', [
  `${VCS} merge main`,
  `${VCS} merge --no-ff feature`,
  `${VCS} -C repo merge main`,
  `${VCS} rm -r legacy`,
  `${VCS} clean -fd`,
  `${VCS} clean -f scratch`,
  `${VCS} branch -D feature`,
  `${VCS} branch --delete feature`,
  `${VCS} tag -d v1`,
  `${VCS} remote remove origin`,
  `${VCS} push origin --delete feature`,
], bash);

allows('git operations an agent runs', [
  `${VCS} add -A`,
  `${VCS} commit -m "x"`,
  `${VCS} branch feature`,
  `${VCS} tag v1.0`,
  `${VCS} stash`,
  `${VCS} rebase main`,
  `${VCS} checkout -b feature`,
  `${VCS} pull`,
  `${VCS} clean -n`,
], bash);

describe('PowerShell', () => {
  it('blocks a web request carrying a body', () => assert.equal(
    verdict(powershell('Invoke-RestMethod -Uri https://api.example.com -Method Post -Body \'{"a":1}\'')), BLOCKED));
  it('blocks an environment token assignment', () => assert.equal(
    verdict(powershell('$env:ANTHROPIC_AUTH_TOKEN = "x"')), BLOCKED));
  it('allows a token name used as a plain string', () => assert.equal(
    verdict(powershell(`$x = '${KEY}'`)), ALLOWED));
  it('does not decode -EncodedCommand, a stated gap', () => assert.equal(
    verdict(powershell('powershell -EncodedCommand aQBmACgAJwBoAGkAJwApAA==')), ALLOWED));
});

blocks('connector actions that send outward', [
  'send_message', 'SEND_MESSAGE', 'create_and_send_email',
  'reply', 'forward', 'create_notification', 'publish-brand-template-v2',
  'respond_to_event', 'create_form_submission', 'vibe_publication',
  'mark_message_spam', 'request-outline-review',
], connector);

blocks('connector actions that destroy', [
  'trash_thread', 'delete_event', 'delete_label', 'unshare_board',
], connector);

allows('connector actions that only read', [
  'list_labels', 'search_threads', 'get_thread', 'list_calendars',
  'get_board_info', 'read_docs', 'asset_search', 'export-design', 'list-replies',
], connector);

allows('connector actions that restore or annotate', [
  'untrash_message', 'untrash_thread', 'unarchive_item', 'unmark_message_spam',
  'reply-to-comment', 'image_remove_background',
], connector);

it('judges a read by its verb, not its noun', () => {
  for (const [action, want] of [['list_posts', ALLOWED], ['get_reply_count', ALLOWED], ['list-reviews', ALLOWED],
    ['get_public_url', ALLOWED], ['get_send_result', BLOCKED], ['list_submissions', BLOCKED]]) {
    assert.equal(verdict(connector(action)), want, action);
  }
});

blocks('writes to brand-locked and secret-bearing paths', [
  'assets/brand-kit.zip',
  'assets/brand/logo.png',
  '/synthetic/repo/.env',
  'deploy/id_ed25519',
  'Secrets/token.json',
  '/synthetic/repo/contacts.csv',
], write);

allows('ordinary repository writes', ['src/content/blog/post.mdx', 'scripts/new-tool.mjs'], edit);
allows('agent-kept memory', ['config/memory.md', 'plugins/handoff-os/memory.md'], write);

describe('account numbers in written content', () => {
  it('blocks a 26-digit national account number', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', `IBAN ${ACCOUNT}`)), BLOCKED));
  it('blocks a spaced account number from another jurisdiction', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', `IBAN ${ACCOUNT_SPACED}`)), BLOCKED));
  it('blocks one arriving through Edit', () => assert.equal(
    verdict(edit('/synthetic/repo/notes.md', ACCOUNT)), BLOCKED));
  it('allows the word with no number after it', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', 'keep it in memory.md, never in git')), ALLOWED));
  it('allows an account number the owner dictates into memory.md', () => assert.equal(
    verdict(write('/synthetic/repo/config/memory.md', `IBAN ${ACCOUNT}`)), ALLOWED));
  it('allows a fixture inside a test file', () => assert.equal(
    verdict(write('/synthetic/repo/test/guard.test.mjs', `case ${ACCOUNT}`)), ALLOWED));
  it('keeps the path rule above the fixture exemption', () => assert.equal(
    verdict(write('/synthetic/repo/tests/secrets/x.json', '{}')), BLOCKED));
});

describe('malformed hook payloads', () => {
  it('fails open on empty stdin', () => assert.equal(verdict(''), ALLOWED));
  it('fails open when there is nothing to judge', () => assert.equal(verdict({}), ALLOWED));
  it('fails closed on an unparseable shell payload', () => assert.equal(
    verdict('{"tool_name": "Bash", "tool_input": '), BLOCKED));
  it('fails closed on a command that is not a string', () => assert.equal(
    verdict({ tool_name: 'Bash', tool_input: { command: 123 } }), BLOCKED));
  it('ignores tools outside its scope', () => assert.equal(
    verdict({ tool_name: 'TodoWrite', tool_input: { todos: [] } }), ALLOWED));
});

describe('context budgets', () => {
  const workspace = sandbox('budgets-');
  const launch = (payload) => fire(GUARD, { cwd: workspace, ...payload }, { ...process.env, HANDOFF_OS_DIR: workspace });
  const agent = (session_id) => launch({ session_id, tool_name: 'Agent', tool_input: { model: 'sonnet' } }).status;

  it('lets three subagents through and blocks the fourth', () => {
    assert.deepEqual([1, 2, 3, 4].map(() => agent('first-wave')), [ALLOWED, ALLOWED, ALLOWED, BLOCKED]);
  });

  it('names the law it enforces and where the procedure is', () => {
    const { stderr } = launch({ session_id: 'first-wave', tool_name: 'Agent', tool_input: { model: 'sonnet' } });
    assert.match(stderr, /law 7/i);
    assert.match(stderr, /research-budget/);
  });

  it('counts each session separately', () => assert.equal(agent('second-wave'), ALLOWED));

  const probe = path.join(workspace, 'probe.txt');
  const read = (tool_input) => launch({
    session_id: 'reader', tool_name: 'Read', tool_input: { file_path: probe, ...tool_input },
  }).status;

  it('allows the first read of a file', () => {
    writeFileSync(probe, 'one');
    assert.equal(read(), ALLOWED);
  });
  it('blocks a re-read of the same unchanged bytes', () => assert.equal(read(), BLOCKED));
  it('always allows a slice, so a large file stays reachable', () => assert.equal(read({ offset: 1, limit: 1 }), ALLOWED));
  it('allows a re-read once the file has changed', () => {
    writeFileSync(probe, 'one two three');
    assert.equal(read(), ALLOWED);
  });
  it('defers when the file does not exist', () => assert.equal(read({ file_path: path.join(workspace, 'absent.txt') }), ALLOWED));

  const bulky = path.join(workspace, 'bulky.txt');
  const bulk = (tool_input) => launch({
    session_id: 'slicer', tool_name: 'Read', tool_input: { file_path: bulky, ...tool_input },
  });

  it('blocks a whole-file read once the file is over the limit', () => {
    writeFileSync(bulky, 'x'.repeat(25 * 1024));
    const { status, stderr } = bulk();
    assert.equal(status, BLOCKED);
    assert.match(stderr, /offset\/limit/);
    assert.match(stderr, /scout/);
  });

  it('allows the same oversized file when a slice is asked for', () => assert.equal(bulk({ offset: 1, limit: 40 }).status, ALLOWED));

  it('allows a whole-file read just under the limit', () => {
    const lean = path.join(workspace, 'lean.txt');
    writeFileSync(lean, 'x'.repeat(23 * 1024));
    assert.equal(launch({ session_id: 'slicer', tool_name: 'Read', tool_input: { file_path: lean } }).status, ALLOWED);
  });
});

describe('the fan-out cap under a parallel dispatch', () => {
  const workspace = sandbox('parallel-');
  const spawnGuard = (session_id) => new Promise((resolve) => {
    const child = spawn(process.execPath, [GUARD], { env: { ...process.env, HANDOFF_OS_DIR: workspace } });
    child.stdin.end(JSON.stringify({ cwd: workspace, session_id, tool_name: 'Agent', tool_input: { model: 'sonnet' } }));
    child.on('close', resolve);
  });

  it('admits exactly three when ten launch at once', async () => {
    const codes = await Promise.all(Array.from({ length: 10 }, () => spawnGuard('burst')));
    assert.equal(codes.filter((code) => code === ALLOWED).length, MAX_PER_WAVE);
    assert.equal(codes.filter((code) => code === BLOCKED).length, 10 - MAX_PER_WAVE);
  });

  it('opens a fresh wave for a later bucket', async () => {
    const codes = await Promise.all(Array.from({ length: 2 }, () => spawnGuard('other-burst')));
    assert.deepEqual(codes, [ALLOWED, ALLOWED]);
  });
});

describe('every dispatch states its model', () => {
  const workspace = sandbox('dispatch-');
  const dispatch = (tool_input) => fire(GUARD, { cwd: workspace, session_id: 'd', tool_name: 'Agent', tool_input },
    { ...process.env, HANDOFF_OS_DIR: workspace });

  it('blocks a dispatch that names no model', () => {
    const { status, stderr } = dispatch({ prompt: 'search the web for grant deadlines' });
    assert.equal(status, BLOCKED);
    assert.match(stderr, /law 8/);
  });

  it('blocks opus without a QUALITY flag', () => assert.equal(
    dispatch({ model: 'opus', prompt: 'search the web for grant deadlines' }).status, BLOCKED));

  it('allows opus once the prompt claims the quality it needs', () => assert.equal(
    dispatch({ model: 'opus', prompt: 'QUALITY: writing — draft the grant narrative' }).status, ALLOWED));

  it('allows the cheap models a lookup should use', () => {
    for (const model of ['haiku', 'sonnet']) {
      assert.equal(dispatch({ model, prompt: 'find the config' }).status, ALLOWED, model);
    }
  });
});

describe('every spawn tool reaches the gate, whatever this build calls it', () => {
  const spawnAt = (workspace, tool_name, tool_input) => fire(GUARD,
    { cwd: workspace, session_id: 'spawn', tool_name, tool_input },
    { ...process.env, HANDOFF_OS_DIR: workspace });
  const each = (tool_name, tool_input) => spawnAt(sandbox('spawn-'), tool_name, tool_input).status;

  it('judges Task and Agent alike, because only the name differs between builds', () => {
    for (const tool of ['Agent', 'Task']) {
      assert.equal(each(tool, { prompt: 'audit the repo', description: 'Audit', subagent_type: 'Explore' }), BLOCKED, `${tool} no model`);
      assert.equal(each(tool, { model: 'opus', prompt: 'review the diff' }), BLOCKED, `${tool} opus review`);
      assert.equal(each(tool, { model: 'sonnet', prompt: 'review the diff' }), ALLOWED, `${tool} sonnet review`);
    }
  });

  it('never lets opus review, not even behind a QUALITY flag', () => {
    assert.equal(each('Agent', { model: 'opus', prompt: 'QUALITY: writing — review the diff' }), BLOCKED);
  });

  it('reads the subagent type and the description too, not just the prompt', () => {
    assert.equal(each('Agent', { model: 'opus', subagent_type: 'code-reviewer', prompt: 'QUALITY: writing — check it' }), BLOCKED);
    assert.equal(each('Agent', { model: 'opus', description: 'Audit the config', prompt: 'QUALITY: writing — check it' }), BLOCKED);
  });

  it('lets a spawn tool that cannot name a model through, instead of demanding one it has no field for', () => {
    assert.equal(each('Workflow', { script: "export const meta = { name: 'sweep', description: 'summarise three docs' }" }), ALLOWED);
    assert.equal(each('TaskCreate', { description: 'analyse the config', subject: 'config', activeForm: 'Analysing' }), ALLOWED);
  });

  it('still finds opus inside the payload of a tool that carries no model field', () => {
    assert.equal(each('Workflow', { script: "agent(d.prompt, { model: 'opus' }) // review each dimension" }), BLOCKED);
    assert.equal(each('Workflow', { script: "agent(d.prompt, { model: 'opus' }) // draft the narrative" }), BLOCKED);
  });

  it('denies fable by default, but allows its prose like opus', () => {
    assert.equal(each('Agent', { model: 'fable', prompt: 'search the web' }), BLOCKED);
    assert.equal(each('Agent', { model: 'fable', prompt: 'QUALITY: writing — draft the narrative' }), ALLOWED);
  });

  it('ignores a denied name inside another word', () => {
    assert.equal(each('Workflow', { script: "export const meta = { name: 'octopus facts' }" }), ALLOWED);
  });

  it('names all four tiers when the model names none', () => {
    const { status, stderr } = spawnAt(sandbox('tier-'), 'Agent', { model: 'cheapest', prompt: 'x' });
    assert.equal(status, BLOCKED);
    assert.match(stderr, /fable/);
  });

  it('lets the owner shrink the deny list to none', () => {
    const workspace = sandbox('deny-var-');
    let n = 0;
    const open = (value, tool_input) => fire(GUARD, { cwd: workspace, session_id: `deny-${n++}`, tool_name: 'Agent', tool_input },
      { ...process.env, HANDOFF_OS_DIR: workspace, HANDOFF_DENY_SUBAGENT_MODELS: value }).status;
    for (const value of ['none', '']) {
      assert.equal(open(value, { model: 'opus', prompt: 'search the web' }), ALLOWED, JSON.stringify(value));
      assert.equal(open(value, { model: 'opus', prompt: 'QUALITY: writing — draft the narrative' }), ALLOWED, JSON.stringify(value));
    }
    assert.equal(open('Opus', { model: 'opus', prompt: 'search the web' }), BLOCKED, 'case-insensitive like HANDOFF_MCP_ALLOW');
  });

  it('counts a teammate spawn against the wave cap, model or no model', () => {
    const workspace = sandbox('spawn-cap-');
    const spawn = () => spawnAt(workspace, 'TaskCreate', { description: 'analyse', subject: 'x' }).status;
    assert.deepEqual([1, 2, 3, 4].map(spawn), [ALLOWED, ALLOWED, ALLOWED, BLOCKED]);
  });

  it('fails closed on an unparseable payload from any spawn tool', () => {
    for (const tool of ['Agent', 'Task', 'TaskCreate', 'Workflow']) {
      assert.equal(fire(GUARD, `{"tool_name": "${tool}", "tool_input": `).status, BLOCKED, tool);
    }
  });

  it('receipts what it let through, and leaves no receipt for what it refused', () => {
    const workspace = sandbox('spawn-receipt-');
    spawnAt(workspace, 'Agent', { model: 'sonnet', subagent_type: 'general-purpose', prompt: 'sweep' });
    spawnAt(workspace, 'Agent', { model: 'opus', prompt: 'review the diff' });
    const month = new Date().toISOString().slice(0, 7);
    const lines = readFileSync(path.join(workspace, 'audit', `${month}.jsonl`), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const only = JSON.parse(lines[0]);
    assert.equal(only.action, 'Agent');
    assert.equal(only.target, 'sonnet:general-purpose');
  });

  it('names the tier it inherited when the tool could not state one', () => {
    const workspace = sandbox('spawn-inherit-');
    spawnAt(workspace, 'TaskCreate', { description: 'analyse the config', subject: 'config' });
    const month = new Date().toISOString().slice(0, 7);
    const only = JSON.parse(readFileSync(path.join(workspace, 'audit', `${month}.jsonl`), 'utf8').trim());
    assert.equal(only.target, 'inherit:analyse the config');
  });
});

describe('the session ledger', () => {
  const workspace = sandbox('ledger-');
  const launch = (payload) => fire(GUARD, { cwd: workspace, ...payload }, { ...process.env, HANDOFF_OS_DIR: workspace });
  const probe = path.join(workspace, 'counted.txt');
  const state = () => JSON.parse(readFileSync(path.join(workspace, '.claude', '.session-counter.json'), 'utf8'));

  it('counts a blocked re-read and the bytes it kept out of context', () => {
    writeFileSync(probe, 'y'.repeat(4096));
    const read = () => launch({ session_id: 'counter', tool_name: 'Read', tool_input: { file_path: probe } }).status;
    assert.equal(read(), ALLOWED);
    assert.equal(read(), BLOCKED);
    assert.deepEqual(state().saved, { agents: 0, blocked: 0, rereads: 1, slices: 0, bytes: 4096, cache: 0 });
  });

  it('counts a forced slice separately from a re-read', () => {
    writeFileSync(path.join(workspace, 'huge.txt'), 'z'.repeat(30 * 1024));
    launch({ session_id: 'counter', tool_name: 'Read', tool_input: { file_path: path.join(workspace, 'huge.txt') } });
    assert.deepEqual(state().saved, { agents: 0, blocked: 0, rereads: 1, slices: 1, bytes: 4096 + (30 * 1024 - 24 * 1024), cache: 0 });
  });

  it('keeps reads and savings in one file per session', () => {
    assert.deepEqual(Object.keys(state()).sort(), ['read_bytes', 'reads', 'saved']);
  });
});

describe('a whole-file shell read spends the same budget as Read', () => {
  const workspace = sandbox('shellread-');
  const probe = path.join(workspace, 'notes.md');
  const shell = (command) => fire(GUARD, { cwd: workspace, session_id: 'sh', tool_name: 'Bash', tool_input: { command } },
    { ...process.env, HANDOFF_OS_DIR: workspace });

  it('blocks the second bare cat of an unchanged file', () => {
    writeFileSync(probe, 'one two three');
    assert.equal(shell('cat notes.md').status, ALLOWED);
    assert.equal(shell('cat notes.md').status, BLOCKED);
  });

  it('leaves every partial read alone, because none of it lands whole in context', () => {
    for (const command of ['cat notes.md | grep one', 'sed -n 1,5p notes.md', 'head -n 2 notes.md',
      'tail -1 notes.md', 'grep one notes.md', 'wc -l notes.md']) {
      assert.equal(shell(command).status, ALLOWED, command);
    }
  });

  it('counts the shell re-read into the same ledger the Read tool uses', () => {
    const state = JSON.parse(readFileSync(path.join(workspace, '.claude', '.session-sh.json'), 'utf8'));
    assert.equal(state.saved.rereads, 1);
    assert.equal(state.saved.bytes, 13);
  });
});

describe('the query budget', () => {
  const workspace = sandbox('query-');
  const launch = (tool_input, tool_name = 'Grep') => fire(GUARD, { cwd: workspace, session_id: 'q', tool_name, tool_input },
    { ...process.env, HANDOFF_OS_DIR: workspace });

  it('blocks a content-mode grep with no head_limit', () => {
    const { status, stderr } = launch({ pattern: 'todo', output_mode: 'content' });
    assert.equal(status, BLOCKED);
    assert.match(stderr, /head_limit/);
  });

  it('allows a bounded content grep and a files-mode grep', () => {
    assert.equal(launch({ pattern: 'todo', output_mode: 'content', head_limit: 30 }).status, ALLOWED);
    assert.equal(launch({ pattern: 'todo' }).status, ALLOWED);
  });

  it('blocks the identical call a second time, per tool', () => {
    assert.equal(launch({ pattern: 'todo', output_mode: 'content', head_limit: 30 }).status, BLOCKED);
    assert.equal(launch({ pattern: 'todo' }).status, BLOCKED);
    assert.equal(launch({ pattern: 'todo' }, 'Glob').status, ALLOWED);
  });
});

describe('the session read ceiling', () => {
  const workspace = sandbox('ceiling-');
  const probe = path.join(workspace, 'bulk.txt');
  const read = (tool_input = {}) => fire(GUARD,
    { cwd: workspace, session_id: 'ceil', tool_name: 'Read', tool_input: { file_path: probe, ...tool_input } },
    { ...process.env, HANDOFF_OS_DIR: workspace });

  it('admits whole-file reads until the ceiling', () => {
    for (let i = 0; i < 22; i += 1) {
      writeFileSync(probe, String(i).padEnd(23 * 1024 + i, 'x'));
      assert.equal(read().status, ALLOWED, `read ${i + 1}`);
    }
  });

  it('blocks the next whole-file read, but never a slice', () => {
    writeFileSync(probe, 'final'.padEnd(23 * 1024 + 99, 'x'));
    const { status, stderr } = read();
    assert.equal(status, BLOCKED);
    assert.match(stderr, /ceiling/);
    assert.equal(read({ offset: 1, limit: 10 }).status, ALLOWED);
  });
});

blocks('raw web-fetch connectors that pour a page into context', [
  'mcp__tavily__search',
  'mcp__fetch__fetch_url',
  'mcp__brave-search__web_search',
  'mcp__firecrawl__scrape_page',
], (name) => ({ tool_name: name, tool_input: {} }));

allows('connector fetches on ordinary org servers', [
  'mcp__github__search_code',
  'mcp__notion__read_docs',
], (name) => ({ tool_name: name, tool_input: {} }));

describe('the ledger counts what the operator wants to see', () => {
  const workspace = sandbox('counters-');
  const launch = (payload) => fire(GUARD, { cwd: workspace, session_id: 'vis', ...payload },
    { ...process.env, HANDOFF_OS_DIR: workspace });
  const saved = () => JSON.parse(readFileSync(path.join(workspace, '.claude', '.session-vis.json'), 'utf8')).saved;

  it('counts an allowed subagent as a dispatch', () => {
    launch({ tool_name: 'Agent', tool_input: { model: 'haiku', prompt: 'find it' } });
    assert.equal(saved().agents, 1);
  });

  it('counts a refused outward action as a block', () => {
    launch({ tool_name: 'Bash', tool_input: { command: 'npm publish' } });
    assert.equal(saved().blocked, 1);
  });

  it('counts a refused dispatch as a block, not a dispatch', () => {
    launch({ tool_name: 'Agent', tool_input: { model: 'opus', prompt: 'search the web' } });
    const s = saved();
    assert.equal(s.blocked, 2);
    assert.equal(s.agents, 1);
  });
});

describe('the query budget reopens when the repo changes', () => {
  const workspace = sandbox('requery-');
  const launch = (payload) => fire(GUARD, { cwd: workspace, session_id: 'rq', ...payload },
    { ...process.env, HANDOFF_OS_DIR: workspace });
  const grep = () => launch({ tool_name: 'Grep', tool_input: { pattern: 'todo' } }).status;

  it('blocks the identical query while nothing has been written', () => {
    assert.equal(grep(), ALLOWED);
    assert.equal(grep(), BLOCKED);
  });

  it('allows it again after a write, so a change can be verified', () => {
    assert.equal(launch({ tool_name: 'Write', tool_input: { file_path: path.join(workspace, 'a.md'), content: 'x' } }).status, ALLOWED);
    assert.equal(grep(), ALLOWED);
  });
});

allows('read tools on org servers whose name merely contains a fetch word', [
  'mcp__elasticsearch__get_index',
  'mcp__hexagon__read_model',
  'mcp__texas-registry__list_items',
  'mcp__github__search_code',
  'mcp__notion__read_docs',
], (name) => ({ tool_name: name, tool_input: {} }));

blocks('read tools on servers that are a fetcher', [
  'mcp__tavily__search',
  'mcp__fetch__fetch_url',
  'mcp__brave-search__web_search',
  'mcp__firecrawl__scrape_page',
], (name) => ({ tool_name: name, tool_input: {} }));

describe('the holes a bypass pass found', () => {
  const workspace = sandbox('bypass-');
  const shell = (command) => fire(GUARD, { cwd: workspace, session_id: 'bp', tool_name: 'Bash', tool_input: { command } },
    { ...process.env, HANDOFF_OS_DIR: workspace }).status;

  it('sees a merge or a delete through a wrapper that hides the verb', () => {
    for (const command of [
      `command ${VCS} merge main`,
      `eval "${VCS} merge main"`,
      `bash -lc "${VCS} merge main"`,
      `pwsh --command "${VCS} merge main"`,
      'rm -rf docs',
      'Remove-Item -Recurse -Force docs',
    ]) assert.equal(shell(command), BLOCKED, command);
  });

  it('stops an outward call an argv matcher would miss', () => {
    for (const command of [
      'gh api graphql -f query=mutation{addComment}',
      'gh api repos/a/b/issues --field title=x',
      'python -c "import requests;requests.post(u, json=d)"',
      'node -e "fetch(u, { method: 0 })"',
    ]) assert.equal(shell(command), BLOCKED, command);
  });

  it('applies the write deny-list to a shell redirect, not only to Edit and Write', () => {
    for (const command of [
      'echo k > .env',
      'echo k >> config/.env.local',
      'printf x | tee assets/logo.svg',
      `echo ${ACCOUNT} >> README.md`,
      `sed -i "s/a/${ACCOUNT}/" README.md`,
    ]) assert.equal(shell(command), BLOCKED, command);
  });

  it('still lets an ordinary redirect through', () => {
    for (const command of ['echo note > notes.md', 'npm test > out.log', 'printf x | tee build/report.txt']) {
      assert.equal(shell(command), ALLOWED, command);
    }
  });

  it('spends the read budget on a chained whole-file read, not just a bare one', () => {
    writeFileSync(path.join(workspace, 'chained.md'), 'one two three');
    assert.equal(shell('cat chained.md && echo ok'), ALLOWED);
    assert.equal(shell('cat chained.md && echo ok'), BLOCKED);
    assert.equal(shell('type chained.md'), BLOCKED);
  });

  it('names a tier or does not dispatch', () => {
    const agent = (model) => fire(GUARD, { cwd: workspace, session_id: 'bp', tool_name: 'Agent', tool_input: { prompt: 'x', model } },
      { ...process.env, HANDOFF_OS_DIR: workspace }).status;
    assert.equal(agent('best-available'), BLOCKED);
    assert.equal(agent('cheapest'), BLOCKED);
  });

  it('reads the connector payload, not only the connector name', () => {
    const call = (action, tool_input) => fire(GUARD, { cwd: workspace, session_id: 'bp', tool_name: `mcp__${SERVER}__${action}`, tool_input },
      { ...process.env, HANDOFF_OS_DIR: workspace }).status;
    assert.equal(call('d1_database_query', { sql: 'DROP TABLE donors' }), BLOCKED);
    assert.equal(call('d1_database_query', { sql: 'SELECT 1' }), ALLOWED);
    assert.equal(call('execute_code', {}), BLOCKED);
    assert.equal(call('write_api', {}), BLOCKED);
    assert.equal(call('read_api', {}), ALLOWED);
  });
});

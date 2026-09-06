import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED, BLOCKED, SERVER, fire, sandbox, scrub } from './helper.mjs';

const GUARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/guard.mjs', import.meta.url));

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

const blocks = (label, cases, payload) => describe(label, () => {
  for (const c of cases) it(`blocks ${c}`, () => assert.equal(verdict(payload(c)), BLOCKED));
});
const allows = (label, cases, payload) => describe(label, () => {
  for (const c of cases) it(`allows ${c}`, () => assert.equal(verdict(payload(c)), ALLOWED));
});

after(scrub);

blocks('shell commands that leave the machine', [
  `${VCS} ${OUT} origin main`,
  `${VCS} --no-pager ${OUT} origin main`,
  `${VCS} remote set-url origin https://elsewhere.example/r.git`,
  `echo staged && ${VCS} ${OUT}`,
  `bash -c "${VCS} ${OUT} origin main"`,
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
], connector);

blocks('connector actions that destroy', [
  'trash_thread', 'delete_event', 'delete_label', 'unshare_board',
], connector);

allows('connector actions that only read', [
  'list_labels', 'search_threads', 'get_thread', 'list_calendars',
  'get_board_info', 'read_docs', 'asset_search', 'export-design', 'list-replies',
], connector);

allows('connector actions that restore or annotate', [
  'untrash_message', 'untrash_thread', 'unarchive_item',
  'reply-to-comment', 'image_remove_background',
], connector);

it('blocks an outward verb hidden inside a longer action name', () => assert.equal(
  verdict(connector('get_reply_count')), BLOCKED));

blocks('writes to brand-locked and secret-bearing paths', [
  'assets/brand-kit.zip',
  'assets/brand/logo.png',
  '/synthetic/repo/.env',
  'deploy/id_ed25519',
  'Secrets/token.json',
  '/synthetic/repo/canon/org.json',
], write);

allows('ordinary repository writes', ['src/content/blog/post.mdx', 'scripts/new-tool.mjs'], edit);

describe('account numbers in written content', () => {
  it('blocks a 26-digit national account number', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', `IBAN ${ACCOUNT}`)), BLOCKED));
  it('blocks a spaced account number from another jurisdiction', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', `IBAN ${ACCOUNT_SPACED}`)), BLOCKED));
  it('blocks one arriving through Edit', () => assert.equal(
    verdict(edit('/synthetic/repo/notes.md', ACCOUNT)), BLOCKED));
  it('allows the word with no number after it', () => assert.equal(
    verdict(write('/synthetic/repo/notes.md', 'read the IBAN live from the canon')), ALLOWED));
  it('allows a fixture inside a test file', () => assert.equal(
    verdict(write('/synthetic/repo/test/guard.test.mjs', `case ${ACCOUNT}`)), ALLOWED));
  it('keeps the path rule above the fixture exemption', () => assert.equal(
    verdict(write('/synthetic/repo/tests/canon/org.json', '{}')), BLOCKED));
});

describe('malformed hook payloads', () => {
  it('fails open on empty stdin', () => assert.equal(verdict(''), ALLOWED));
  it('fails open when there is nothing to judge', () => assert.equal(verdict({}), ALLOWED));
  it('fails closed on an unparseable shell payload', () => assert.equal(
    verdict('{"tool_name": "Bash", "tool_input": '), BLOCKED));
  it('fails closed on a command that is not a string', () => assert.equal(
    verdict({ tool_name: 'Bash', tool_input: { command: 123 } }), BLOCKED));
  it('ignores tools outside its scope', () => assert.equal(
    verdict({ tool_name: 'Glob', tool_input: { pattern: '*' } }), ALLOWED));
});

describe('context budgets', () => {
  const workspace = sandbox('budgets-');
  const launch = (payload) => fire(GUARD, { cwd: workspace, ...payload }, { ...process.env, HANDOFF_OS_DIR: workspace });
  const agent = (session_id) => launch({ session_id, tool_name: 'Agent', tool_input: {} }).status;

  it('lets three subagents through and blocks the fourth', () => {
    assert.deepEqual([1, 2, 3, 4].map(() => agent('first-wave')), [ALLOWED, ALLOWED, ALLOWED, BLOCKED]);
  });

  it('names the law it enforces and where the procedure is', () => {
    const { stderr } = launch({ session_id: 'first-wave', tool_name: 'Agent', tool_input: {} });
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
});

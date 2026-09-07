import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheTokens, resolveSteps, stepsToCommand } from '../plugins/handoff-os/scripts/verify.mjs';
import { ALLOWED, BLOCKED, fire, sandbox, scrub } from './helper.mjs';

const SCRIPTS = fileURLToPath(new URL('../plugins/handoff-os/scripts/', import.meta.url));
const GATE = path.join(SCRIPTS, 'verify.mjs');
const RUNNER = path.join(SCRIPTS, 'verify.mjs');

after(scrub);

function repoWith(scripts) {
  const root = sandbox('verify-');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'probe', scripts }), 'utf8');
  return root;
}

function transcript(root, text) {
  const file = path.join(root, 'transcript.jsonl');
  writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`, 'utf8');
  return file;
}

const stop = (root, payload) => fire(GATE, { cwd: root, ...payload });

describe('which command counts as verification', () => {
  it('resolves the command from what the repo actually defines', () => {
    assert.deepEqual(resolveSteps({ verify: 'x', build: 'y' }), ['verify']);
    assert.deepEqual(resolveSteps({ typecheck: 'tsc', build: 'vite build' }), ['typecheck', 'build']);
    assert.deepEqual(resolveSteps({ dev: 'vite' }), []);
    assert.equal(stepsToCommand(['typecheck', 'build']), 'npm run typecheck && npm run build');
  });
});

describe('Stop gate', () => {
  it('blocks a done-claim that no run supports, naming the only command that clears it', () => {
    const root = repoWith({ verify: 'node --version' });
    const result = stop(root, { session_id: 'unproven', transcript_path: transcript(root, 'All done, it works now.') });
    assert.equal(result.status, BLOCKED);
    assert.match(result.stderr, /scripts\/verify\.mjs/);
    assert.match(result.stderr, /npm run verify/);
  });

  it('lets a turn end when nothing was claimed done', () => {
    const root = repoWith({ verify: 'node --version' });
    const result = stop(root, { session_id: 'quiet', transcript_path: transcript(root, 'Here is what I found so far.') });
    assert.equal(result.status, ALLOWED);
  });

  it('reads the claim from last_assistant_message when the payload carries one', () => {
    const root = repoWith({ verify: 'node --version' });
    const result = stop(root, { session_id: 'direct', last_assistant_message: 'Shipped.' });
    assert.equal(result.status, BLOCKED);
  });

  it('stands down in a repo that has no checks to run', () => {
    const root = repoWith({ dev: 'vite' });
    const result = stop(root, { session_id: 'nothing', transcript_path: transcript(root, 'Done.') });
    assert.equal(result.status, ALLOWED);
  });

  it('stands down after two blocks so a session cannot be trapped', () => {
    const root = repoWith({ verify: 'node --version' });
    const claim = { session_id: 'stubborn', transcript_path: transcript(root, 'Done.') };
    assert.equal(stop(root, claim).status, BLOCKED);
    assert.equal(stop(root, claim).status, BLOCKED);
    const third = stop(root, claim);
    assert.equal(third.status, ALLOWED);
    assert.match(third.stdout, /must check it/);
  });

  it('accepts a marker the runner wrote', () => {
    const root = repoWith({ verify: 'node --version' });
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude', '.verified-proven'), 'ok\n', 'utf8');
    const result = stop(root, { session_id: 'proven', transcript_path: transcript(root, 'Done.') });
    assert.equal(result.status, ALLOWED);
  });
});

describe('verify runner', () => {
  const run = (root, session) => spawnSync(process.execPath, [RUNNER, session, root], { encoding: 'utf8' });

  it('writes the marker only after the real command exits 0', () => {
    const root = repoWith({ verify: 'node --version' });
    const result = run(root, 'green');
    assert.equal(result.status, 0);
    assert.ok(existsSync(path.join(root, '.claude', '.verified-green')));
  });

  it('leaves no marker when the command fails', () => {
    const root = repoWith({ verify: 'node --eval "process.exit(1)"' });
    const result = run(root, 'red');
    assert.notEqual(result.status, 0);
    assert.ok(!existsSync(path.join(root, '.claude', '.verified-red')));
  });

  it('refuses to run without a session id', () => {
    const root = repoWith({ verify: 'node --version' });
    assert.notEqual(spawnSync(process.execPath, [RUNNER, '', root], { encoding: 'utf8' }).status, 0);
  });
});

describe('the scout citation contract', () => {
  const root = sandbox('scout-');
  const subagent = (text) => fire(GATE, {
    cwd: root, hook_event_name: 'SubagentStop', last_assistant_message: text,
  }).status;
  const long = (tail) => `${'The repository routes every outward verb through one gate. '.repeat(4)}${tail}`;

  it('blocks a substantive return that cites nothing', () => assert.equal(subagent(long('')), BLOCKED));

  it('allows the same return once a fact carries its source', () => {
    for (const tail of ['guard.mjs:117', 'https://code.claude.com/docs/en/hooks.md', 'UNVERIFIED']) {
      assert.equal(subagent(long(tail)), ALLOWED, tail);
    }
  });

  it('allows a short return, which claims nothing worth checking', () => assert.equal(subagent('No match found.'), ALLOWED));

  it('names what a citation looks like when it blocks', () => {
    const { stderr } = fire(GATE, { cwd: root, hook_event_name: 'SubagentStop', last_assistant_message: long('') });
    assert.match(stderr, /file:line/);
    assert.match(stderr, /UNVERIFIED/);
  });
});

describe('the savings line the operator sees', () => {
  const ledgerAt = (root, saved) => {
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude', '.session-spender.json'),
      JSON.stringify({ reads: {}, saved }), 'utf8');
  };
  const finish = (root) => fire(GATE, { cwd: root, session_id: 'spender' }, { ...process.env, HANDOFF_OS_DIR: root });

  it('reports every figure the operator asked to see', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { agents: 4, blocked: 2, rereads: 3, slices: 2, bytes: 40000, cache: 51000 });
    const { status, stdout } = finish(root);
    assert.equal(status, ALLOWED);
    const { systemMessage } = JSON.parse(stdout);
    assert.match(systemMessage, /HANDOFF OS · ~61.0k tok saved · 11 guard actions/);
    assert.doesNotMatch(systemMessage, /re-reads|sliced/);
  });

  it('says nothing at all when nothing was saved', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { agents: 0, blocked: 0, rereads: 0, slices: 0, bytes: 0, cache: 0 });
    assert.equal(finish(root).stdout, '');
  });

  it('leaves a history line in the audit ledger and resets the counters', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { agents: 1, blocked: 1, rereads: 1, slices: 0, bytes: 8000, cache: 0 });
    finish(root);
    const month = new Date().toISOString().slice(0, 7);
    const entry = JSON.parse(readFileSync(path.join(root, 'audit', `${month}.jsonl`), 'utf8').trim());
    assert.equal(entry.action, 'read-budget');
    assert.match(entry.result, /2000 tokens saved/);
    assert.equal(finish(root).stdout, '');
  });
});

describe('cache reads are counted from the transcript', () => {
  const root = sandbox('cache-');
  const write = (name, entries) => {
    const file = path.join(root, name);
    writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    return file;
  };
  const turn = (cache) => ({ type: 'assistant', message: { role: 'assistant', usage: { cache_read_input_tokens: cache } } });

  it('sums cache_read_input_tokens across assistant turns', () => {
    const file = write('t1.jsonl', [turn(1000), turn(2500), { type: 'user', message: { role: 'user' } }]);
    assert.deepEqual(cacheTokens(file, 0), { sum: 3500, cursor: 3 });
  });

  it('counts only turns after the cursor, so a second Stop does not double count', () => {
    const file = write('t2.jsonl', [turn(1000), turn(2500)]);
    assert.equal(cacheTokens(file, 2).sum, 0);
  });

  it('returns zero for a transcript that is missing or unreadable', () => {
    assert.deepEqual(cacheTokens(path.join(root, 'absent.jsonl'), 0), { sum: 0, cursor: 0 });
    assert.deepEqual(cacheTokens('', 4), { sum: 0, cursor: 4 });
  });
});

describe('the handoff card is not a done-claim', () => {
  it('lets the RED stop end a turn without demanding a test run', () => {
    const root = repoWith({ verify: 'node --version' });
    const card = 'Draft is prepared.\n\nDONE post drafted\nFILE scratchpad/launch-post.md\nYOU post -> Show HN -> this week';
    assert.equal(stop(root, { session_id: 'carded', transcript_path: transcript(root, card) }).status, ALLOWED);
  });

  it('still catches a done-claim sitting next to a card', () => {
    const root = repoWith({ verify: 'node --version' });
    const card = 'The refactor is finished.\n\nDONE post drafted\nFILE x.md\nYOU post -> Show HN -> today';
    assert.equal(stop(root, { session_id: 'carded2', transcript_path: transcript(root, card) }).status, BLOCKED);
  });
});

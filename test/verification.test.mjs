import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSteps, stepsToCommand } from '../plugins/handoff-os/scripts/verify.mjs';
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
      JSON.stringify({ reads: {}, wave: null, saved }), 'utf8');
  };
  const finish = (root) => fire(GATE, { cwd: root, session_id: 'spender' }, { ...process.env, HANDOFF_OS_DIR: root });

  it('reports three figures once anything was saved', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { rereads: 3, slices: 2, bytes: 40000 });
    const { status, stdout } = finish(root);
    assert.equal(status, ALLOWED);
    const { systemMessage } = JSON.parse(stdout);
    assert.match(systemMessage, /re-reads blocked 3/);
    assert.match(systemMessage, /large reads sliced 2/);
    assert.match(systemMessage, /10,000 tokens saved/);
  });

  it('says nothing at all when nothing was saved', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { rereads: 0, slices: 0, bytes: 0 });
    assert.equal(finish(root).stdout, '');
  });

  it('leaves a history line in the audit ledger and resets the counters', () => {
    const root = repoWith({ verify: 'node --test' });
    ledgerAt(root, { rereads: 1, slices: 0, bytes: 8000 });
    finish(root);
    const month = new Date().toISOString().slice(0, 7);
    const entry = JSON.parse(readFileSync(path.join(root, 'audit', `${month}.jsonl`), 'utf8').trim());
    assert.equal(entry.action, 'read-budget');
    assert.match(entry.result, /2000 tokens saved/);
    assert.equal(finish(root).stdout, '');
  });
});

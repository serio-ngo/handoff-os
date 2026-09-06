import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seenPath } from '../plugins/handoff-os/scripts/card.mjs';
import { fire, sandbox, scrub } from './helper.mjs';

const CARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/card.mjs', import.meta.url));
const GUARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/guard.mjs', import.meta.url));
const MAX_LINES = 20;
const MAX_TOKENS = 400;

after(scrub);

function print(memoryText, payload = {}) {
  const env = { ...process.env };
  if (memoryText !== null && memoryText !== undefined) {
    const root = sandbox('card-');
    mkdirSync(path.join(root, 'config'), { recursive: true });
    writeFileSync(path.join(root, 'config', 'memory.md'), memoryText, 'utf8');
    env.HANDOFF_OS_DIR = root;
  }
  return fire(CARD, payload, env);
}

const card = print();

describe('session card', () => {
  it('runs clean and prints', () => {
    assert.equal(card.status, 0);
    assert.ok(card.stdout.trim().length > 0);
  });

  it(`fits the budget: ${MAX_LINES} lines, ${MAX_TOKENS} tokens`, () => {
    assert.ok(card.stdout.trim().split('\n').length <= MAX_LINES);
    assert.ok(Math.round(card.stdout.length / 4) <= MAX_TOKENS);
  });

  it('carries the contract: planes, tiers, never-list, handoff card, memory, proof, scout', () => {
    for (const token of ['TRUTH=', 'STATE=', 'BUILD=', 'BRAND=', 'HUMAN=',
      'GREEN', 'YELLOW', 'RED', 'HANDOFF', 'DONE', 'FILE', 'YOU',
      'NEVER', 'MEMORY', 'memory.md', 'verify.mjs', 'scout']) {
      assert.match(card.stdout, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('reports the memory file as set or empty', () => {
    assert.match(print('Acme Corp, invoiced monthly.').stdout, /MEMORY set \(1 lines\)/);
    assert.match(print('').stdout, /MEMORY empty/);
  });

  it('names git merge and delete as human-only, whatever the mode', () => {
    assert.match(card.stdout, /git merge \/ delete/);
    assert.doesNotMatch(card.stdout, /state-changing git/);
  });

  it('adds the total git ban to the never-list only when git is locked', () => {
    const env = { ...process.env, HANDOFF_LOCK_GIT: '1' };
    assert.match(fire(CARD, {}, env).stdout, /every state-changing git \(locked\)/);
  });

  it('leaks no org fact the guard would refuse to commit', () => {
    assert.equal(fire(GUARD, { tool_name: 'Write', tool_input: { file_path: 'notes.md', content: card.stdout } }).status, 0);
  });
});

describe('first-prompt backup, for when SessionStart never fired', () => {
  const prompt = (session_id) => print(null, { session_id, hook_event_name: 'UserPromptSubmit' });
  const clear = (session) => { try { rmSync(seenPath(session), { force: true }); } catch { } };

  it('prints once per session, then stays silent — and never blocks a prompt', () => {
    for (const session of ['guard-miss', 'guard-twice']) {
      clear(session);
      assert.match(prompt(session).stdout, /PLANES/);
      assert.equal(prompt(session).stdout.trim(), '');
      clear(session);
    }
    clear('guard-hit');
    print(null, { session_id: 'guard-hit' });
    assert.ok(existsSync(seenPath('guard-hit')));
    assert.equal(prompt('guard-hit').stdout.trim(), '');
    clear('guard-hit');
    assert.equal(print(null, { hook_event_name: 'UserPromptSubmit' }).status, 0);
  });
});

describe('the read ceiling releases when the context is freed', () => {
  const root = sandbox('release-');
  const ledger = () => path.join(root, '.claude', '.session-rel.json');
  const seed = () => {
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(ledger(), JSON.stringify({ reads: { 'a.md': '1:2' }, read_bytes: 600000, saved: {} }), 'utf8');
  };
  const start = (source) => fire(CARD, { session_id: 'rel', cwd: root, hook_event_name: 'SessionStart', source },
    { ...process.env, HANDOFF_OS_DIR: root });
  const bytes = () => JSON.parse(readFileSync(ledger(), 'utf8')).read_bytes;

  it('zeroes the ceiling on a compact and on a clear', () => {
    for (const source of ['compact', 'clear']) {
      seed();
      start(source);
      assert.equal(bytes(), 0, source);
    }
  });

  it('leaves it standing on a plain start or resume, where the context survives', () => {
    for (const source of ['startup', 'resume']) {
      seed();
      start(source);
      assert.equal(bytes(), 600000, source);
    }
  });
});

describe('the running total the operator can pin to every reply', () => {
  it('stays silent unless the operator asks for it', () => {
    const root = sandbox('stats-');
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude', '.session-run.json'),
      JSON.stringify({ reads: {}, saved: {}, lifetime: { agents: 2, blocked: 3, rereads: 1, slices: 0, bytes: 40000, cache: 0 } }), 'utf8');
    writeFileSync(seenPath('run'), 'card', 'utf8');
    const payload = { cwd: root, session_id: 'run', hook_event_name: 'UserPromptSubmit' };

    assert.equal(fire(CARD, payload, { ...process.env, HANDOFF_OS_DIR: root }).stdout, '');

    const on = fire(CARD, payload, { ...process.env, HANDOFF_OS_DIR: root, HANDOFF_STATS: '1' }).stdout;
    assert.match(on, /HANDOFF OS · ~10.0k tok saved · 6 guard actions/);
    assert.match(on, /Close your reply with that line/);
  });

  it('says nothing when the plugin has not fired yet', () => {
    const root = sandbox('stats-quiet-');
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(seenPath('idle'), 'card', 'utf8');
    const out = fire(CARD, { cwd: root, session_id: 'idle', hook_event_name: 'UserPromptSubmit' },
      { ...process.env, HANDOFF_OS_DIR: root, HANDOFF_STATS: '1' }).stdout;
    assert.equal(out, '');
  });
});

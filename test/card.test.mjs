import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  it('drops state-changing git from the never-list in cowork mode', () => {
    const env = { ...process.env, HANDOFF_ALLOW_GIT: '1' };
    assert.doesNotMatch(fire(CARD, {}, env).stdout, /state-changing git/);
    assert.match(card.stdout, /state-changing git/);
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

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

function print(org, payload = {}) {
  const env = { ...process.env };
  if (org) {
    const root = sandbox('card-');
    mkdirSync(path.join(root, 'config'), { recursive: true });
    writeFileSync(path.join(root, 'config', 'org.json'), JSON.stringify(org), 'utf8');
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

  it(`stays under ${MAX_LINES} lines`, () => {
    assert.ok(card.stdout.trim().split('\n').length <= MAX_LINES, `${card.stdout.trim().split('\n').length} lines`);
  });

  it(`stays under ${MAX_TOKENS} tokens, the whole reason it replaces a document read`, () => {
    assert.ok(Math.round(card.stdout.length / 4) <= MAX_TOKENS, `${Math.round(card.stdout.length / 4)} tokens`);
  });

  it('names every plane', () => {
    for (const plane of ['TRUTH=', 'STATE=', 'BUILD=', 'BRAND=', 'HUMAN=']) assert.match(card.stdout, new RegExp(plane));
  });

  it('names every tier and the handoff a RED tier ends in', () => {
    for (const tier of ['GREEN', 'YELLOW', 'RED']) assert.match(card.stdout, new RegExp(tier));
    assert.match(card.stdout, /handoff-card/);
  });

  it('carries the never-list', () => assert.match(card.stdout, /NEVER/));

  it('points at the canon instead of quoting it', () => {
    assert.match(card.stdout, /CANON/);
    assert.match(card.stdout, /NOT IN CANON/);
  });

  it('states how a done-claim is proved', () => assert.match(card.stdout, /verify\.mjs/));

  it('routes cheap lookups away from the main model', () => assert.match(card.stdout, /scout/));
});

describe('identity', () => {
  it('reads what setup wrote', () => {
    const { stdout } = print({
      name: 'Marker Org', sources: ['https://marker.example/about'], tracker: 'a tracker',
      docStore: 'a store', brandTools: 'a tool',
    });
    assert.match(stdout, /https:\/\/marker\.example\/about/);
    assert.match(stdout, /STATE=a tracker/);
  });

  it('accepts a configuration that is nothing but a name', () => {
    const { stdout } = print({ name: 'Solo' });
    assert.equal(print({ name: 'Solo' }).status, 0);
    assert.match(stdout, /no sources configured/);
  });

  it('lists several sources when the owner gave several', () => {
    const { stdout } = print({ sources: ['https://a.example', 'a shared doc', 'a wiki page'] });
    assert.match(stdout, /a shared doc/);
    assert.match(stdout, /\+1 more/);
  });

  it('falls back to generic wording when nothing is configured', () => {
    assert.match(print({}).stdout, /ask the owner/);
  });

  it('names no vendor by default, so any org installs clean', () => {
    assert.doesNotMatch(print({}).stdout, /monday|canva|google drive/i);
  });

  it('leaks no org fact the guard would refuse to commit', () => {
    assert.equal(fire(GUARD, { tool_name: 'Write', tool_input: { file_path: 'notes.md', content: card.stdout } }).status, 0);
  });
});

describe('first-prompt backup, for when SessionStart never fired', () => {
  const prompt = (session_id) => print(null, { session_id, hook_event_name: 'UserPromptSubmit' });
  const clear = (session) => { try { rmSync(seenPath(session), { force: true }); } catch { } };

  it('prints the same card when the session card has not run', () => {
    const session = 'guard-miss';
    clear(session);
    const result = prompt(session);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /PLANES/);
    clear(session);
  });

  it('stays silent once the session card already ran', () => {
    const session = 'guard-hit';
    clear(session);
    print(null, { session_id: session });
    assert.ok(existsSync(seenPath(session)));
    assert.equal(prompt(session).stdout.trim(), '');
    clear(session);
  });

  it('stays silent on its own second run', () => {
    const session = 'guard-twice';
    clear(session);
    assert.ok(prompt(session).stdout.trim().length > 0);
    assert.equal(prompt(session).stdout.trim(), '');
    clear(session);
  });

  it('never blocks a prompt, whatever happens', () => {
    assert.equal(print(null, { hook_event_name: 'UserPromptSubmit' }).status, 0);
  });
});

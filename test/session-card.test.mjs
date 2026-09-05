import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/session-card.mjs', import.meta.url));
const GUARD = fileURLToPath(new URL('../plugins/handoff-os/scripts/egress-guard.mjs', import.meta.url));
const MAX_LINES = 20;
const MAX_TOKENS = 400;

const sandboxes = [];
after(() => sandboxes.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function print(org) {
  const env = { ...process.env };
  if (org) {
    const root = mkdtempSync(path.join(tmpdir(), 'card-'));
    sandboxes.push(root);
    mkdirSync(path.join(root, 'config'), { recursive: true });
    writeFileSync(path.join(root, 'config', 'org.json'), JSON.stringify(org), 'utf8');
    env.HANDOFF_OS_DIR = root;
  }
  return spawnSync(process.execPath, [CARD], { encoding: 'utf8', env });
}

const card = print();

describe('session card', () => {
  it('runs clean', () => {
    assert.equal(card.status, 0);
    assert.ok(card.stdout.trim().length > 0);
  });

  it(`stays under ${MAX_LINES} lines`, () => {
    assert.ok(card.stdout.trim().split('\n').length <= MAX_LINES);
  });

  it(`stays under ${MAX_TOKENS} tokens, the whole reason it replaces a document read`, () => {
    assert.ok(Math.round(card.stdout.length / 4) <= MAX_TOKENS);
  });

  it('names every plane', () => {
    for (const plane of ['TRUTH=', 'STATE=', 'BUILD=', 'BRAND=', 'HUMAN=']) {
      assert.match(card.stdout, new RegExp(plane));
    }
  });

  it('names every tier', () => {
    for (const tier of ['GREEN', 'YELLOW', 'RED']) assert.match(card.stdout, new RegExp(tier));
  });

  it('carries the never-list and the handoff it ends in', () => {
    assert.match(card.stdout, /NEVER/);
    assert.match(card.stdout, /handoff-card/);
  });

  it('points at the canon instead of quoting it', () => {
    assert.match(card.stdout, /CANON/);
    assert.match(card.stdout, /NOT IN CANON/);
  });

  it('states how a done-claim is proved', () => {
    assert.match(card.stdout, /verify-run\.mjs/);
  });
});

describe('session card identity', () => {
  it('reads the identity that setup wrote', () => {
    const { stdout } = print({
      orgName: 'Marker Org',
      publicUrl: 'https://marker.example/about',
      tracker: 'github',
      docStore: 'Store',
      brandTools: 'Tools',
    });
    assert.match(stdout, /https:\/\/marker\.example\/about/);
    assert.match(stdout, /STATE=github/);
  });

  it('falls back to generic wording when no identity is configured', () => {
    assert.match(card.stdout, /task tracker|public site/);
  });

  it('leaks no org fact the guard would refuse to commit', () => {
    const vet = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'notes.md', content: card.stdout } }),
      encoding: 'utf8',
    });
    assert.equal(vet.status, 0);
  });
});

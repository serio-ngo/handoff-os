import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SETUP = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
const EXAMPLE = JSON.parse(readFileSync(new URL('../config/org.example.json', import.meta.url), 'utf8'));

const workspace = mkdtempSync(path.join(tmpdir(), 'setup-'));
after(() => rmSync(workspace, { recursive: true, force: true }));

let counter = 0;
const scratch = () => path.join(workspace, `org-${counter += 1}.json`);
const setup = (...args) => spawnSync(process.execPath, [SETUP, '--non-interactive', ...args], { encoding: 'utf8' });

describe('setup writes the one file that carries the owner identity', () => {
  const target = scratch();
  const result = setup('--target', target, '--org-name', 'Acme', '--tracker', 'github');
  const written = JSON.parse(readFileSync(target, 'utf8'));

  it('succeeds', () => assert.equal(result.status, 0));
  it('stores what the owner answered', () => {
    assert.equal(written.orgName, 'Acme');
    assert.equal(written.tracker, 'github');
  });
  it('fills every remaining field with a default', () => {
    assert.deepEqual(Object.keys(written).sort(), Object.keys(EXAMPLE).sort());
  });
  it('produces the shape the example documents', () => {
    for (const key of Object.keys(EXAMPLE)) assert.equal(typeof written[key], typeof EXAMPLE[key]);
  });
});

describe('setup refuses input it cannot honour', () => {
  it('rejects a tracker it has no adapter for', () => {
    assert.notEqual(setup('--target', scratch(), '--tracker', 'carrier-pigeon').status, 0);
  });

  it('writes nothing when it refuses', () => {
    const target = scratch();
    setup('--target', target, '--tracker', 'carrier-pigeon');
    assert.ok(!existsSync(target));
  });

  it('rejects an unknown flag rather than silently ignoring it', () => {
    assert.notEqual(setup('--bogus').status, 0);
  });

  it('rejects --target with no path after it', () => {
    assert.notEqual(setup('--target').status, 0);
  });
});

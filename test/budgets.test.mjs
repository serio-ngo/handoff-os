import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = fileURLToPath(new URL('../plugins/handoff-os/scripts/', import.meta.url));
const BLOCKED = 2;
const ALLOWED = 0;

const workspace = mkdtempSync(path.join(tmpdir(), 'budgets-'));
after(() => rmSync(workspace, { recursive: true, force: true }));

const fire = (script, payload) => spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
  input: JSON.stringify({ cwd: workspace, ...payload }),
  encoding: 'utf8',
  env: { ...process.env, HANDOFF_OS_DIR: workspace },
});

describe('fan-out cap', () => {
  const launch = (session_id) => fire('subagent-cap.mjs', { session_id, tool_name: 'Agent', tool_input: {} });

  it('lets three subagents through and blocks the fourth', () => {
    const wave = [1, 2, 3, 4].map(() => launch('first-wave').status);
    assert.deepEqual(wave, [ALLOWED, ALLOWED, ALLOWED, BLOCKED]);
  });

  it('tells the caller which law it enforces and where the procedure is', () => {
    const { stderr } = launch('first-wave');
    assert.match(stderr, /law 7/i);
    assert.match(stderr, /research-budget/);
  });

  it('counts each session separately', () => {
    assert.equal(launch('second-wave').status, ALLOWED);
  });

  it('counts nothing but the Agent tool', () => {
    const other = fire('subagent-cap.mjs', { session_id: 'first-wave', tool_name: 'Read', tool_input: {} });
    assert.equal(other.status, ALLOWED);
  });
});

describe('read budget', () => {
  const probe = path.join(workspace, 'probe.txt');
  const read = (tool_input) => fire('read-budget.mjs', {
    session_id: 'reader', tool_name: 'Read', tool_input: { file_path: probe, ...tool_input },
  }).status;

  it('allows the first read of a file', () => {
    writeFileSync(probe, 'one');
    assert.equal(read(), ALLOWED);
  });

  it('blocks a re-read of the same unchanged bytes', () => {
    assert.equal(read(), BLOCKED);
  });

  it('always allows a slice, so a large file stays reachable', () => {
    assert.equal(read({ offset: 1, limit: 1 }), ALLOWED);
  });

  it('allows a re-read once the file has changed', () => {
    writeFileSync(probe, 'one two three');
    assert.equal(read(), ALLOWED);
  });

  it('ignores tools other than Read', () => {
    const edit = fire('read-budget.mjs', {
      session_id: 'reader', tool_name: 'Edit', tool_input: { file_path: probe },
    });
    assert.equal(edit.status, ALLOWED);
  });

  it('defers when the file does not exist', () => {
    assert.equal(read({ file_path: path.join(workspace, 'absent.txt') }), ALLOWED);
  });
});

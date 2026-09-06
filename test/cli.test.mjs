import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { policyFor } from '../scripts/generate.mjs';
import { run, sandbox, scrub } from './helper.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(REPO, 'scripts', 'handoff.mjs');
const POLICY = JSON.parse(readFileSync(path.join(REPO, 'settings', 'policy.json'), 'utf8'));

const workspace = sandbox('cli-');
after(scrub);

let counter = 0;
const scratch = (name) => path.join(workspace, `${counter += 1}-${name}`);
const seed = (contents) => {
  const file = scratch('settings.json');
  writeFileSync(file, typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
  return file;
};
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const cli = (...args) => run(CLI, args);

describe('one policy source, three projections', () => {
  it('gives every scope the identical deny list', () => {
    for (const scope of ['user', 'project', 'managed']) {
      assert.deepEqual(policyFor(scope).permissions.deny, POLICY.deny, scope);
    }
  });

  it('prompts on connectors only where a human is present', () => {
    assert.deepEqual(policyFor('user').permissions.ask, POLICY.ask);
    assert.equal(policyFor('project').permissions.ask, undefined);
  });

  it('forces subscription login everywhere a login can be chosen', () => {
    assert.equal(policyFor('user').forceLoginMethod, 'claudeai');
    assert.equal(policyFor('managed').forceLoginMethod, 'claudeai');
  });

  it('closes the bypass flag only where an administrator writes it', () => {
    assert.equal(policyFor('managed').permissions.disableBypassPermissionsMode, true);
    assert.equal(policyFor('user').permissions.disableBypassPermissionsMode, undefined);
  });

  it('ships no connector prompt, so no vendor is assumed', () => {
    assert.deepEqual(POLICY.ask, []);
  });

  it('drops only the ask rules the owner filtered out', () => {
    const stub = { deny: POLICY.deny, ask: ['mcp__alpha__create_item', 'mcp__beta__create_item'] };
    const filtered = policyFor('user', ['alpha'], stub);
    assert.deepEqual(filtered.permissions.ask, ['mcp__beta__create_item']);
    assert.deepEqual(filtered.permissions.deny, POLICY.deny);
  });

  it('adds the lock bundle only when git is locked', () => {
    const open = policyFor('user', [], undefined, []);
    const locked = policyFor('user', [], undefined, ['git']);
    assert.deepEqual(open.permissions.deny, POLICY.deny);
    assert.equal(locked.permissions.deny.length, POLICY.deny.length + POLICY.lock.git.length);
    for (const rule of POLICY.lock.git) assert.ok(locked.permissions.deny.includes(rule), rule);
  });

  it('keeps merge and delete denied in both modes', () => {
    for (const lock of [[], ['git']]) {
      const deny = policyFor('user', [], undefined, lock).permissions.deny;
      assert.ok(deny.includes('Bash(git merge *)'), String(lock));
      assert.ok(deny.includes('Bash(git branch -D *)'), String(lock));
    }
  });
});

describe('merging policy into a live settings file', () => {
  const CUSTOM = 'Bash(a-rule-the-owner-added *)';
  const target = seed({
    skipWorkflowUsageWarning: true,
    permissions: { deny: [CUSTOM, POLICY.deny[0]], allow: ['Bash(npm run test)'] },
  });
  const result = cli('sync', '--target', target);
  const merged = read(target);

  it('succeeds', () => assert.equal(result.status, 0));

  it('keeps everything the owner put there by hand', () => {
    assert.ok(merged.permissions.deny.includes(CUSTOM));
    assert.ok(merged.permissions.allow.includes('Bash(npm run test)'));
    assert.equal(merged.skipWorkflowUsageWarning, true);
  });

  it('adds every policy deny rule, each exactly once', () => {
    for (const rule of POLICY.deny) assert.ok(merged.permissions.deny.includes(rule), rule);
    assert.equal(merged.permissions.deny.filter((rule) => rule === POLICY.deny[0]).length, 1);
  });

  it('wires the install without anyone typing it', () => {
    assert.equal(Object.values(merged.enabledPlugins).every(Boolean), true);
    assert.ok(existsSync(path.join(merged.env.HANDOFF_OS_DIR, 'package.json')));
  });
  it('locks git on request and unlocks it again on a plain sync', () => {
    const target = seed({});
    cli('sync', '--target', target, '--lock', 'git');
    const shut = read(target);
    assert.equal(shut.env.HANDOFF_LOCK_GIT, '1');
    for (const rule of POLICY.lock.git) assert.ok(shut.permissions.deny.includes(rule), rule);
    cli('sync', '--target', target);
    const open = read(target);
    assert.equal(open.env?.HANDOFF_LOCK_GIT, undefined);
    assert.deepEqual([...open.permissions.deny].sort(), [...POLICY.deny].sort());
  });

  it('denies a merge or a delete even when git is unlocked', () => {
    const target = seed({});
    cli('sync', '--target', target);
    const deny = read(target).permissions.deny;
    assert.ok(deny.includes('Bash(git merge *)'));
    assert.ok(deny.includes('Bash(git branch -D *)'));
    assert.ok(deny.every((rule) => rule !== 'Bash(git commit *)'));
  });
  it('writes a runnable user file: subscription login, full deny list, install env', () => {
    const target = seed({});
    assert.equal(cli('sync', '--target', target).status, 0);
    const written = read(target);
    assert.equal(written.forceLoginMethod, 'claudeai');
    assert.deepEqual(written.permissions.deny, POLICY.deny);
    assert.ok(existsSync(path.join(written.env.HANDOFF_OS_DIR, 'package.json')));
  });
});

describe('a settings file that would start spending API credits', () => {
  it('is refused, naming the key, and left untouched', () => {
    for (const [key, fragment] of [
      ['ANTHROPIC_API_KEY', { env: { ANTHROPIC_API_KEY: 'sk-ant-synthetic' } }],
      ['ANTHROPIC_AUTH_TOKEN', { env: { ANTHROPIC_AUTH_TOKEN: 'synthetic' } }],
      ['CLAUDE_CODE_OAUTH_TOKEN', { env: { CLAUDE_CODE_OAUTH_TOKEN: 'synthetic' } }],
      ['apiKeyHelper', { apiKeyHelper: '/bin/echo' }],
    ]) {
      const target = seed(fragment);
      const before = readFileSync(target, 'utf8');
      const result = cli('sync', '--target', target);
      assert.notEqual(result.status, 0, key);
      assert.match(result.stderr, new RegExp(key));
      assert.equal(readFileSync(target, 'utf8'), before);
    }
  });
});

describe('refusing to guess', () => {
  it('exits non-zero on an unparseable target', () => {
    assert.notEqual(cli('sync', '--target', seed('{not json')).status, 0);
  });
  it('exits non-zero on an unknown scope', () => {
    assert.notEqual(cli('sync', '--scope', 'galactic', '--target', scratch('t.json')).status, 0);
  });
  it('writes nothing on a dry run', () => {
    const target = scratch('dry.json');
    assert.equal(cli('sync', '--target', target, '--dry-run').status, 0);
    assert.ok(!existsSync(target));
  });
});

describe('a healthy install reports healthy', () => {
  const config = sandbox('doctor-');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  const cache = path.join(config, 'plugins', 'cache', 'serio-ngo', 'handoff-os');

  it('never asks the default mode to block a push, because the default mode allows one', () => {
    run(CLI, ['install'], { env });
    const { stdout } = run(CLI, ['doctor'], { env });
    assert.doesNotMatch(stdout, /NO {2}the installed guard blocks a push/);
    assert.match(stdout, /yes {2}the installed guard blocks a merge/);
  });

  it('keeps one installed copy, not one per version ever released', () => {
    run(CLI, ['install'], { env });
    assert.deepEqual(readdirSync(cache).length, 1);
  });
});

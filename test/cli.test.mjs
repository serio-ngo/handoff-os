import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { policyFor } from '../scripts/generate.mjs';
import { run, sandbox, scrub } from './helper.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(REPO, 'scripts', 'handoff.mjs');
const POLICY = JSON.parse(readFileSync(path.join(REPO, 'settings', 'policy.json'), 'utf8'));
const EXAMPLE = JSON.parse(readFileSync(path.join(REPO, 'config', 'org.example.json'), 'utf8'));

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
  it('ends the file with exactly one newline', () => {
    const text = readFileSync(target, 'utf8');
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  });
  it('is idempotent', () => {
    const first = readFileSync(target, 'utf8');
    cli('sync', '--target', target);
    assert.equal(readFileSync(target, 'utf8'), first);
  });
  it('overwrites a wrong login method rather than merging around it', () => {
    const wrong = seed({ forceLoginMethod: 'console' });
    cli('sync', '--target', wrong);
    assert.equal(read(wrong).forceLoginMethod, 'claudeai');
  });
});

describe('a settings file that would start spending API credits', () => {
  const cases = [
    ['ANTHROPIC_API_KEY', { env: { ANTHROPIC_API_KEY: 'sk-ant-synthetic' } }],
    ['ANTHROPIC_AUTH_TOKEN', { env: { ANTHROPIC_AUTH_TOKEN: 'synthetic' } }],
    ['CLAUDE_CODE_OAUTH_TOKEN', { env: { CLAUDE_CODE_OAUTH_TOKEN: 'synthetic' } }],
    ['apiKeyHelper', { apiKeyHelper: '/bin/echo' }],
  ];
  for (const [key, fragment] of cases) {
    it(`is refused when it carries ${key}`, () => {
      const target = seed(fragment);
      const before = readFileSync(target, 'utf8');
      const result = cli('sync', '--target', target);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(key));
      assert.equal(readFileSync(target, 'utf8'), before);
    });
  }
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

describe('setup, end to end, in a copy of this repo', () => {
  const box = sandbox('setup-');
  const home = path.join(box, 'claude-home');
  for (const part of ['plugins', 'settings', 'config', 'scripts', '.claude-plugin']) {
    cpSync(path.join(REPO, part), path.join(box, part), { recursive: true });
  }
  cpSync(path.join(REPO, 'package.json'), path.join(box, 'package.json'));
  mkdirSync(path.join(box, 'docs'), { recursive: true });

  const org = path.join(box, 'config', 'org.json');
  const result = run(path.join(box, 'scripts', 'handoff.mjs'),
    ['setup', '--config', org, '--target', path.join(box, 'user-settings.json'),
      '--project', path.join(box, '.claude', 'settings.json'), '--name', 'Acme', '--yes'],
    { env: { ...process.env, CLAUDE_CONFIG_DIR: home } });

  it('succeeds in one command, with nothing to answer', () => assert.equal(result.status, 0, result.stderr));

  it('writes the identity file in the documented shape', () => {
    assert.deepEqual(Object.keys(read(org)).sort(), Object.keys(EXAMPLE).sort());
    assert.equal(read(org).name, 'Acme');
  });

  it('writes user settings carrying the full deny list', () => {
    const user = read(path.join(box, 'user-settings.json'));
    assert.equal(user.forceLoginMethod, 'claudeai');
    assert.deepEqual(user.permissions.deny, POLICY.deny);
  });

  it('writes project settings for the checkout too', () => {
    assert.deepEqual(read(path.join(box, '.claude', 'settings.json')).permissions.deny, POLICY.deny);
  });

  it('installs the plugin where a session actually loads it', () => {
    const version = read(path.join(box, 'plugins', 'handoff-os', '.claude-plugin', 'plugin.json')).version;
    const cache = path.join(home, 'plugins', 'cache', 'serio-ngo', 'handoff-os', version);
    assert.ok(existsSync(path.join(cache, 'hooks', 'hooks.json')), cache);
    assert.equal(readFileSync(path.join(cache, 'scripts', 'guard.mjs'), 'utf8'),
      readFileSync(path.join(box, 'plugins', 'handoff-os', 'scripts', 'guard.mjs'), 'utf8'));
  });

  it('carries the identity into the installed copy, so the card is not generic', () => {
    const version = read(path.join(box, 'plugins', 'handoff-os', '.claude-plugin', 'plugin.json')).version;
    assert.ok(existsSync(path.join(home, 'plugins', 'cache', 'serio-ngo', 'handoff-os', version, 'org.json')));
  });

  it('reports what it did instead of leaving the owner to check', () => {
    assert.match(result.stdout, /yes|NO/);
  });

  it('overwrites a stale version the marketplace clone still declares', () => {
    const stale = path.join(home, 'plugins', 'cache', 'serio-ngo', 'handoff-os', '0.0.1');
    mkdirSync(path.join(stale, 'scripts'), { recursive: true });
    writeFileSync(path.join(stale, 'scripts', 'guard.mjs'), 'process.exit(0)\n', 'utf8');
    writeFileSync(path.join(stale, 'scripts', 'gone.mjs'), 'x\n', 'utf8');

    const result = run(path.join(box, 'scripts', 'handoff.mjs'), ['install'],
      { env: { ...process.env, CLAUDE_CONFIG_DIR: home } });
    assert.equal(result.status, 0, result.stderr);

    assert.equal(readFileSync(path.join(stale, 'scripts', 'guard.mjs'), 'utf8'),
      readFileSync(path.join(box, 'plugins', 'handoff-os', 'scripts', 'guard.mjs'), 'utf8'));
    assert.ok(!existsSync(path.join(stale, 'scripts', 'gone.mjs')));
  });

  describe('and then an edit to the plugin', () => {
    const script = path.join(box, 'plugins', 'handoff-os', 'scripts', 'guard.mjs');

    it('bumps the version and reinstalls, so the edit is what loads', () => {
      const before = read(path.join(box, 'package.json'));
      writeFileSync(script, `${readFileSync(script, 'utf8')}export const REVISION = 2;\n`, 'utf8');
      const upkeep = run(path.join(box, 'scripts', 'handoff.mjs'), ['upkeep', '--install'],
        { env: { ...process.env, CLAUDE_CONFIG_DIR: home } });
      assert.equal(upkeep.status, 0, upkeep.stderr);
      const after = read(path.join(box, 'package.json'));
      assert.notEqual(after.version, before.version);
      const cache = path.join(home, 'plugins', 'cache', 'serio-ngo', 'handoff-os', after.version);
      assert.equal(readFileSync(path.join(cache, 'scripts', 'guard.mjs'), 'utf8'), readFileSync(script, 'utf8'));
    });
  });
});

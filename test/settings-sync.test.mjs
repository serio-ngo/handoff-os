import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/sync-settings.mjs', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('../settings/user-settings.template.json', import.meta.url));
const MARKETPLACE = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'));
const template = JSON.parse(readFileSync(TEMPLATE, 'utf8'));

const workspace = mkdtempSync(path.join(tmpdir(), 'settings-'));
after(() => rmSync(workspace, { recursive: true, force: true }));

let counter = 0;
const scratch = (name) => path.join(workspace, `${counter += 1}-${name}`);
const sync = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const seed = (contents) => {
  const file = scratch('settings.json');
  writeFileSync(file, typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
  return file;
};
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

describe('merging the policy template into a live settings file', () => {
  const CUSTOM_RULE = 'Bash(a-rule-the-owner-added *)';
  const OVERLAPPING_RULE = template.permissions.deny[0];
  const target = seed({
    skipWorkflowUsageWarning: true,
    extraKnownMarketplaces: { 'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } } },
    permissions: { deny: [CUSTOM_RULE, OVERLAPPING_RULE], allow: ['Bash(npm run test)'] },
  });
  const result = sync('--target', target);
  const merged = read(target);

  it('succeeds', () => assert.equal(result.status, 0));
  it('keeps a deny rule the owner added by hand', () => assert.ok(merged.permissions.deny.includes(CUSTOM_RULE)));
  it('keeps an allow rule the owner added by hand', () => assert.ok(merged.permissions.allow.includes('Bash(npm run test)')));
  it('keeps unrelated settings untouched', () => assert.equal(merged.skipWorkflowUsageWarning, true));
  it('keeps a marketplace the owner already had', () => assert.ok(merged.extraKnownMarketplaces['claude-plugins-official']));
  it('adds every template deny rule', () => {
    for (const rule of template.permissions.deny) assert.ok(merged.permissions.deny.includes(rule));
  });
  it('adds a rule present on both sides exactly once', () => {
    assert.equal(merged.permissions.deny.filter((rule) => rule === OVERLAPPING_RULE).length, 1);
  });
  it('forces subscription login', () => assert.equal(merged.forceLoginMethod, 'claudeai'));
  it('ends the file with exactly one newline', () => {
    const text = readFileSync(target, 'utf8');
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  });
  it('is idempotent', () => {
    const first = readFileSync(target, 'utf8');
    sync('--target', target);
    assert.equal(readFileSync(target, 'utf8'), first);
  });
});

describe('the installation block, which no human should have to type', () => {
  const target = seed({});
  sync('--target', target);
  const merged = read(target);

  it('registers the marketplace under the name the repo gives itself', () => {
    assert.ok(merged.extraKnownMarketplaces[MARKETPLACE.name]);
  });

  it('points that marketplace at the fork the owner actually cloned', () => {
    const { repo } = merged.extraKnownMarketplaces[MARKETPLACE.name].source;
    assert.match(repo, /^[^/]+\/[^/]+$/);
  });

  it('enables every plugin the marketplace ships', () => {
    for (const plugin of MARKETPLACE.plugins) {
      assert.equal(merged.enabledPlugins[`${plugin.name}@${MARKETPLACE.name}`], true);
    }
  });

  it('points the audit trail at this checkout', () => {
    assert.ok(existsSync(path.join(merged.env.HANDOFF_OS_DIR, 'package.json')));
  });
});

describe('a template that would start spending API credits', () => {
  const cases = [
    ['ANTHROPIC_API_KEY', { env: { ANTHROPIC_API_KEY: 'sk-ant-synthetic' } }],
    ['ANTHROPIC_AUTH_TOKEN', { env: { ANTHROPIC_AUTH_TOKEN: 'synthetic' } }],
    ['CLAUDE_CODE_OAUTH_TOKEN', { env: { CLAUDE_CODE_OAUTH_TOKEN: 'synthetic' } }],
    ['apiKeyHelper', { apiKeyHelper: '/bin/echo' }],
  ];

  for (const [key, fragment] of cases) {
    it(`is refused when it carries ${key}`, () => {
      const bad = seed({ ...template, ...fragment });
      const target = scratch('never-written.json');
      const result = sync('--target', target, '--template', bad);
      assert.notEqual(result.status, 0);
      assert.ok(!existsSync(target));
      assert.match(result.stderr, new RegExp(key));
    });
  }
});

describe('refusing to guess', () => {
  it('exits non-zero on an unparseable target', () => {
    assert.notEqual(sync('--target', seed('{not json'), '--template', TEMPLATE).status, 0);
  });

  it('exits non-zero when the template is missing', () => {
    assert.notEqual(sync('--target', scratch('t.json'), '--template', scratch('absent.json')).status, 0);
  });

  it('exits non-zero on an unknown argument', () => {
    assert.notEqual(sync('--target', scratch('t.json'), '--bogus').status, 0);
  });

  it('exits non-zero with no target at all', () => {
    assert.notEqual(sync().status, 0);
  });
});

describe('dry run', () => {
  const target = scratch('dry.json');
  const result = sync('--target', target, '--dry-run');

  it('succeeds', () => assert.equal(result.status, 0));
  it('writes nothing', () => assert.ok(!existsSync(target)));
  it('shows what would change', () => {
    assert.match(result.stdout, /--- before ---/);
    assert.match(result.stdout, /--- after ---/);
  });
});

describe('leaving connectors out', () => {
  const target = seed({});
  const result = sync('--target', target, '--without', 'canva,gmail');
  const merged = read(target);

  it('succeeds', () => assert.equal(result.status, 0));
  it('drops only the ask rules that name those servers', () => {
    assert.ok(!merged.permissions.ask.some((rule) => /canva|gmail/i.test(rule)));
    assert.ok(merged.permissions.ask.some((rule) => /monday/i.test(rule)));
    assert.ok(merged.permissions.ask.some((rule) => /drive/i.test(rule)));
  });
  it('never drops a deny rule', () => {
    for (const rule of template.permissions.deny) assert.ok(merged.permissions.deny.includes(rule));
  });
  it('names what it dropped', () => assert.match(result.stdout, /without.*canva/i));
  it('refuses --without with nothing after it', () => {
    assert.notEqual(sync('--target', scratch('t.json'), '--without').status, 0);
  });
});

it('overwrites a wrong login method rather than merging around it', () => {
  const target = seed({ forceLoginMethod: 'console' });
  sync('--target', target);
  assert.equal(read(target).forceLoginMethod, 'claudeai');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (...parts) => readFileSync(path.join(REPO, ...parts), 'utf8');

const walk = (dir, base = '') => readdirSync(path.join(REPO, dir || '.'), { withFileTypes: true })
  .flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(rel, rel) : [rel];
  });

const IGNORED = ['.git/', 'node_modules/', '.claude/', 'audit/'];
const tracked = walk('')
  .filter((file) => /\.(md|mjs|json|jsonc|ya?ml|cff)$/.test(file))
  .filter((file) => !IGNORED.some((prefix) => file.startsWith(prefix)))
  .filter((file) => file !== 'config/memory.md');

describe('the permission policy assumes no vendor', () => {
  it('ships an ask list an owner fills in, empty by default', () => {
    assert.deepEqual(JSON.parse(read('settings', 'policy.json')).ask, []);
  });
});

describe('the repository carries no private data', () => {
  const PRIVATE = [/adrian@/i, /kontakt@/i, /\b[A-Z]{2}\d{24,26}\b/, /\bKRS\b/, /\bNIP\b/, /\bREGON\b/];
  const scanned = tracked.filter((file) => !file.startsWith('test/'));

  it('nothing matches a secret, identifier or registry pattern', () => {
    const leaked = [];
    for (const pattern of PRIVATE) {
      for (const file of scanned) if (pattern.test(read(file))) leaked.push(`${pattern} in ${file}`);
    }
    assert.deepEqual(leaked, []);
  });
});

describe('the owner memory never reaches git', () => {
  const gitignore = read('.gitignore');

  it('ignores the memory file in both its locations', () => {
    assert.match(gitignore, /^config\/memory\.md$/m);
    assert.match(gitignore, /^plugins\/handoff-os\/memory\.md$/m);
  });
  it('ignores the audit ledger but keeps its README', () => {
    assert.match(gitignore, /^audit\/\*\.jsonl$/m);
    assert.ok(existsSync(path.join(REPO, 'audit', 'README.md')));
  });
  it('has no memory file committed', () => {
    for (const file of ['config/memory.md', 'plugins/handoff-os/memory.md']) {
      const result = spawnSync('git', ['ls-files', '--error-unmatch', file], { encoding: 'utf8', cwd: REPO });
      assert.notEqual(result.status, 0, file);
    }
  });
});

describe('licensing is consistent everywhere a machine reads it', () => {
  it('one licence in package.json, the plugin manifest and every skill', () => {
    const license = JSON.parse(read('package.json')).license;
    assert.equal(JSON.parse(read('plugins', 'handoff-os', '.claude-plugin', 'plugin.json')).license, license);
    for (const skill of readdirSync(path.join(REPO, 'plugins', 'handoff-os', 'skills'))) {
      assert.match(read('plugins', 'handoff-os', 'skills', skill, 'SKILL.md'), new RegExp(`^license: ${license}$`, 'm'), skill);
    }
    assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
  });
});

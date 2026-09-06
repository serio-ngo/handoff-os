import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, stamp } from '../scripts/generate.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (...parts) => readFileSync(path.join(REPO, ...parts), 'utf8');

describe('generated artefacts, which npm run upkeep rewrites on every turn', () => {
  it('the manifest matches its generator', () => {
    assert.equal(read('docs', 'MANIFEST.md'), manifest(), 'stale — npm run upkeep');
  });

  it('the stamp matches the content it describes', () => {
    assert.equal(JSON.parse(read('package.json')).contentHash, stamp(), 'stale — npm run upkeep');
  });
});

const walk = (dir, base = '') => readdirSync(path.join(REPO, dir || '.'), { withFileTypes: true })
  .flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(rel, rel) : [rel];
  });

const IGNORED = ['.git/', 'node_modules/', '.claude/', 'audit/'];
const tracked = walk('')
  .filter((file) => /\.(md|mjs|json|jsonc|ya?ml|cff)$/.test(file))
  .filter((file) => !IGNORED.some((prefix) => file.startsWith(prefix)))
  .filter((file) => file !== 'config/org.json');

const PRODUCT = tracked.filter((file) => file.startsWith('plugins/') || file.startsWith('settings/') || file.startsWith('scripts/'));

describe('the publisher is named where attribution belongs, and nowhere else', () => {
  const ATTRIBUTION = [
    'README.md', 'NOTICE', 'CITATION.cff', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'GOVERNANCE.md',
    'package.json', '.claude-plugin/marketplace.json', 'plugins/handoff-os/.claude-plugin/plugin.json',
    '.github/FUNDING.yml', 'docs/CLAUDE_CODE_FACTS.md', 'test/repo-hygiene.test.mjs', 'test/cli.test.mjs',
  ];
  const PUBLISHER = /serio|fundacja/i;

  it('scans a meaningful number of files', () => assert.ok(tracked.length > 25, `${tracked.length} files`));

  it('leaves the product organisation-neutral, so a fork needs no find-and-replace', () => {
    assert.deepEqual(tracked.filter((file) => !ATTRIBUTION.includes(file) && PUBLISHER.test(read(file))), []);
  });
});

describe('the product names no vendor, so any company installs it clean', () => {
  const VENDORS = /\b(monday\.com|monday|canva|google drive|gmail|notion|asana|trello|jira)\b/i;


  it('keeps vendor names out of skills, hooks and scripts', () => {
    const leaked = PRODUCT.filter((file) => VENDORS.test(read(file)));
    assert.deepEqual(leaked, []);
  });

  it('ships a generic identity example', () => {
    assert.doesNotMatch(read('config', 'org.example.json'), VENDORS);
  });

  it('ships an ask list an owner fills in, empty by default', () => {
    assert.deepEqual(JSON.parse(read('settings', 'policy.json')).ask, []);
  });
});

describe('the repository carries no private or jurisdiction-bound data', () => {
  const PRIVATE = [/adrian@/i, /kontakt@/i, /\b[A-Z]{2}\d{24,26}\b/];
  const JURISDICTION = [/\bKRS\b/, /\bNIP\b/, /\bREGON\b/, /\bstatut\b/i, /profil zaufany/i];
  const scanned = tracked.filter((file) => !file.startsWith('test/'));

  for (const pattern of [...PRIVATE, ...JURISDICTION]) {
    it(`contains nothing matching ${pattern}`, () => {
      assert.deepEqual(scanned.filter((file) => pattern.test(read(file))), []);
    });
  }
});

describe('the owner identity never reaches git', () => {
  const gitignore = read('.gitignore');

  it('ignores the config setup writes', () => assert.match(gitignore, /^config\/org\.json$/m));
  it('ignores the audit ledger but keeps its README', () => {
    assert.match(gitignore, /^audit\/\*\.jsonl$/m);
    assert.ok(existsSync(path.join(REPO, 'audit', 'README.md')));
  });
  it('has no generated config committed', () => {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', 'config/org.json'], { encoding: 'utf8', cwd: REPO });
    assert.notEqual(result.status, 0);
  });
});

describe('the canon skill sources facts from setup, never from this repo', () => {
  const canon = read('plugins', 'handoff-os', 'skills', 'canon', 'SKILL.md');

  it('reads the public URL the owner configured', () => assert.match(canon, /org\.json/));
  it('names no connector-gated home, so it works on every account', () => assert.doesNotMatch(canon, /Google Drive/i));
  it('names no fact file inside this repository', () => assert.doesNotMatch(canon, /canon\/\*?\.json/i));
  it('states the refusal that replaces a guess', () => assert.match(canon, /NOT IN CANON/));
});

describe('licensing is consistent everywhere a machine reads it', () => {
  const license = JSON.parse(read('package.json')).license;

  it('matches the plugin manifest', () => {
    assert.equal(JSON.parse(read('plugins', 'handoff-os', '.claude-plugin', 'plugin.json')).license, license);
  });

  it('matches every skill', () => {
    for (const skill of readdirSync(path.join(REPO, 'plugins', 'handoff-os', 'skills'))) {
      assert.match(read('plugins', 'handoff-os', 'skills', skill, 'SKILL.md'), new RegExp(`^license: ${license}$`, 'm'), skill);
    }
  });

  it('ships the full licence text and a NOTICE', () => {
    assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
    assert.match(read('NOTICE'), /Apache License, Version 2\.0/);
  });
});

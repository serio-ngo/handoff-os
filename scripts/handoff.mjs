#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PLUGIN, REPO, manifest, policyFor, readJson, stamp, walk } from './generate.mjs';

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude');
const BANNED = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'];
const RULE_LISTS = ['deny', 'ask', 'allow'];
const RUNTIME_OWNED = [/^\.in_use[/\\]/, /^\.DS_Store$/, /^\.installed$/];
const TEXT = /\.(md|mjs|json|jsonc|ya?ml|cff)$/;

const marketplace = readJson('.claude-plugin', 'marketplace.json');
const PLUGIN_NAME = marketplace.plugins[0].name;

const fail = (message) => {
  console.error(`handoff: ${message}`);
  process.exit(1);
};

const rows = [];
const row = (label, value) => rows.push([label, String(value)]);
const report = () => {
  const width = Math.max(...rows.map(([label]) => label.length));
  console.log(rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join('\n'));
  rows.length = 0;
};

function parse(argv) {
  const args = { _: [], without: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { args._.push(arg); continue; }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = argv[++i];
  }
  if (typeof args.without === 'string') {
    args.without = args.without.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return args;
}

function readJsonFile(file, fallback) {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    return fail(`cannot read ${file}`);
  }
  try {
    const text = readFileSync(file, 'utf8');
    return text.trim() === '' ? fallback ?? {} : JSON.parse(text);
  } catch (error) {
    return fail(`${file} is not valid JSON: ${error.message}`);
  }
}

const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const originRepo = () => {
  const url = spawnSync('git', ['-C', REPO, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout || '';
  return (/[:/]([^/:]+\/[^/]+?)(?:\.git)?\s*$/.exec(url) || [])[1];
};

function merge(target, patch) {
  const merged = { ...target, ...patch };
  if (patch.permissions) {
    merged.permissions = { ...target.permissions, ...patch.permissions };
    for (const key of RULE_LISTS) {
      if (patch.permissions[key]) {
        merged.permissions[key] = [...new Set([...(target.permissions?.[key] ?? []), ...patch.permissions[key]])];
      }
    }
  }
  for (const key of ['env', 'extraKnownMarketplaces', 'enabledPlugins']) {
    if (patch[key]) merged[key] = { ...target[key], ...patch[key] };
  }
  return merged;
}

function refuseMeteredAuth(settings) {
  const offenders = [
    ...BANNED.filter((key) => key in (settings.env ?? {})).map((key) => `env.${key}`),
    ...('apiKeyHelper' in settings ? ['apiKeyHelper'] : []),
  ];
  if (offenders.length) fail(`refusing to write — ${offenders.join(', ')} outranks subscription login. Nothing was written.`);
}

function installation() {
  const repo = originRepo();
  const patch = {
    env: { HANDOFF_OS_DIR: REPO },
    enabledPlugins: { [`${PLUGIN_NAME}@${marketplace.name}`]: true },
  };
  if (repo) patch.extraKnownMarketplaces = { [marketplace.name]: { source: { source: 'github', repo } } };
  return patch;
}

function sync(args) {
  const scope = args.scope || 'user';
  if (!['user', 'project', 'managed'].includes(scope)) fail(`unknown scope "${scope}"`);
  const target = path.resolve(args.target
    || (scope === 'project' ? path.join(REPO, '.claude', 'settings.json') : path.join(CONFIG_DIR, 'settings.json')));
  const before = readJsonFile(target, {});
  let after = merge(before, policyFor(scope, args.without));
  if (scope === 'user') after = merge(after, installation());
  after.env = { ...after.env };
  if ((args.without ?? []).includes('git')) after.env.HANDOFF_ALLOW_GIT = '1';
  else delete after.env.HANDOFF_ALLOW_GIT;
  if (Object.keys(after.env).length === 0) delete after.env;
  refuseMeteredAuth(after);
  if (!args.dryRun) writeJson(target, after);
  const counts = RULE_LISTS
    .map((key) => `${key}+=${(after.permissions?.[key] ?? []).filter((r) => !(before.permissions?.[key] ?? []).includes(r)).length}`);
  row(`settings (${scope})`, `${target} ${counts.join(' ')}${args.dryRun ? ' DRY RUN' : ''}`);
  return after;
}

const cacheRoot = () => path.join(CONFIG_DIR, 'plugins', 'cache', marketplace.name, PLUGIN_NAME);

function installTargets() {
  const declared = readJson('plugins', PLUGIN_NAME, '.claude-plugin', 'plugin.json').version;
  const existing = existsSync(cacheRoot())
    ? readdirSync(cacheRoot(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  return { declared, targets: [...new Set([declared, ...existing])] };
}

function install() {
  const { declared, targets } = installTargets();
  const wanted = walk(PLUGIN);
  const memory = path.join(REPO, 'config', 'memory.md');
  let pruned = 0;
  for (const version of targets) {
    const dest = path.join(cacheRoot(), version);
    for (const rel of wanted) {
      mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
      copyFileSync(path.join(PLUGIN, rel), path.join(dest, rel));
    }
    for (const rel of walk(dest)) {
      if (wanted.includes(rel) || rel === 'memory.md' || RUNTIME_OWNED.some((rx) => rx.test(rel))) continue;
      rmSync(path.join(dest, rel), { force: true });
      pruned += 1;
    }
    if (existsSync(memory)) copyFileSync(memory, path.join(dest, 'memory.md'));
  }
  row('plugin', `${PLUGIN_NAME} ${declared} -> ${targets.join(', ')} (${wanted.length} files each, ${pruned} pruned)`);
  return { declared, targets };
}

const HEADING = /^#{1,6}\s/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const FENCE = /^\s*(?:```|~~~)/;

export function markdown(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = false;
  let frontmatter = lines[0] === '---';

  const blankBefore = () => {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
  };
  const continues = (i) => {
    const next = lines[i + 1];
    return next !== undefined && (LIST_ITEM.test(next) || /^\s+\S/.test(next) || next.trim() === '');
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (frontmatter) {
      out.push(line);
      if (i > 0 && line === '---') frontmatter = false;
      continue;
    }
    if (FENCE.test(line)) { fence = !fence; out.push(line); continue; }
    if (fence) { out.push(line); continue; }

    if (line.trim() === '') {
      if (out.length && out[out.length - 1].trim() === '') continue;
      out.push('');
      continue;
    }
    if (HEADING.test(line)) {
      blankBefore();
      out.push(line);
      if (lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('');
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const previous = out[out.length - 1] ?? '';
      if (previous.trim() !== '' && !LIST_ITEM.test(previous) && !/^\s+\S/.test(previous)) blankBefore();
      out.push(line);
      if (!continues(i)) out.push('');
      continue;
    }
    out.push(line);
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

function normalise() {
  const files = walk(REPO)
    .filter((file) => TEXT.test(file))
    .filter((file) => !/^(\.git|node_modules|audit)\//.test(file));
  let touched = 0;
  for (const rel of files) {
    const file = path.join(REPO, rel);
    const before = readFileSync(file, 'utf8');
    let after = before.replace(/\r\n/g, '\n');
    if (rel.endsWith('.md')) after = markdown(after);
    else after = `${after.replace(/[ \t]+$/gm, '').replace(/\n+$/, '')}\n`;
    if (after !== before) { writeFileSync(file, after, 'utf8'); touched += 1; }
  }
  return touched;
}

function upkeep() {
  const touched = normalise();
  const pkgPath = path.join(REPO, 'package.json');
  const pkg = readJsonFile(pkgPath);
  const manifestPath = path.join(PLUGIN, '.claude-plugin', 'plugin.json');
  const plugin = readJsonFile(manifestPath);
  const current = stamp();
  let bumped = 'unchanged';
  if (pkg.contentHash !== current) {
    const [major, minor, patch] = plugin.version.split('.').map(Number);
    plugin.version = [major, minor, patch + 1].join('.');
    writeJson(manifestPath, plugin);
    pkg.version = plugin.version;
    pkg.contentHash = stamp();
    writeJson(pkgPath, pkg);
    bumped = `${plugin.version} (content changed)`;
  }
  writeFileSync(path.join(REPO, 'docs', 'MANIFEST.md'), manifest(), 'utf8');
  row('formatted', `${touched} file(s)`);
  row('version', bumped);
}

const BLOCKED = 2;
function doctor() {
  const settings = readJsonFile(path.join(CONFIG_DIR, 'settings.json'), {});
  const { declared, targets } = installTargets();
  const cache = path.join(cacheRoot(), declared);
  const checks = [];
  const check = (question, ok, detail = '') => {
    checks.push(ok);
    console.log(`  ${ok ? 'yes' : 'NO '}  ${question}${detail ? ` — ${detail}` : ''}`);
  };

  check('the plugin is enabled', settings.enabledPlugins?.[`${PLUGIN_NAME}@${marketplace.name}`] === true);
  check('login is restricted to the subscription', settings.forceLoginMethod === 'claudeai');
  const cowork = settings.env?.HANDOFF_ALLOW_GIT === '1';
  check(cowork ? 'git is open — cowork mode' : 'outward git is denied',
    cowork ? true : (settings.permissions?.deny ?? []).some((r) => /git push/i.test(r)));
  check('no metered credential is configured', !new RegExp(`${BANNED.join('|')}|apiKeyHelper`).test(JSON.stringify(settings)));
  check('no metered credential is in the environment', !BANNED.some((key) => process.env[key]));

  const current = (version) => {
    const dest = path.join(cacheRoot(), version);
    return existsSync(dest) && walk(PLUGIN).every((rel) => existsSync(path.join(dest, rel))
      && readFileSync(path.join(dest, rel), 'utf8') === readFileSync(path.join(PLUGIN, rel), 'utf8'));
  };
  const installed = check('every installed copy is this checkout', targets.every(current),
    `${targets.length} version(s): ${targets.join(', ')}`);

  if (existsSync(cache)) {
    const fire = (script, payload) => spawnSync(process.execPath, [path.join(cache, 'scripts', script)], {
      input: JSON.stringify(payload), encoding: 'utf8',
    }).status;
    check('the installed guard blocks a push', fire('guard.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin main' } }) === BLOCKED);
    check('the installed guard blocks an outward connector call', fire('guard.mjs', { hook_event_name: 'PreToolUse', tool_name: 'mcp__x__send_message', tool_input: {} }) === BLOCKED);
    check('the installed card prints', spawnSync(process.execPath, [path.join(cache, 'scripts', 'card.mjs')], { encoding: 'utf8' }).stdout.trim().length > 0);
  }
  const failed = checks.filter((ok) => !ok).length;
  console.log(`  ${checks.length - failed} of ${checks.length} yes`);
  return { failed, installed };
}

function publish() {
  const repo = originRepo();
  const version = readJson('plugins', PLUGIN_NAME, '.claude-plugin', 'plugin.json').version;
  const PORTABLE = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
  const problems = [];
  if (!repo) problems.push('no git origin — Cowork installs from a git URL only');
  if (readJson('package.json').version !== version) problems.push('package.json and plugin.json disagree on version');
  if (readJson('package.json').contentHash !== stamp()) problems.push('content changed since the last stamp — run npm run upkeep');
  for (const skill of walk(path.join(PLUGIN, 'skills')).filter((f) => f.endsWith('SKILL.md'))) {
    const block = (/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path.join(PLUGIN, 'skills', skill), 'utf8')) || [])[1] || '';
    for (const [, key] of block.matchAll(/^([A-Za-z-]+):/gm)) {
      if (!PORTABLE.includes(key)) problems.push(`${skill} carries "${key}", which Cowork rejects on upload`);
    }
  }
  const dirty = (spawnSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).stdout || '').trim();
  row('marketplace', `${marketplace.name} @ ${repo || 'UNSET'}`);
  row('version', version);
  row('uncommitted', dirty ? `${dirty.split('\n').length} file(s) — Cowork installs the pushed commit, not these` : 'none');
  row('cowork', problems.length ? `${problems.length} blocker(s)` : `add "${repo}" under Cowork > Customize > Add plugin`);
  report();
  for (const problem of problems) console.log(`  BLOCKER  ${problem}`);
  return problems.length;
}

function release(args) {
  const [bump, ...rest] = args._;
  const note = rest.join(' ').trim();
  const BUMPS = {
    major: ([a]) => [a + 1, 0, 0],
    minor: ([a, b]) => [a, b + 1, 0],
    patch: ([a, b, c]) => [a, b, c + 1],
  };
  if (!BUMPS[bump]) fail(`usage: npm run release <${Object.keys(BUMPS).join('|')}> "one-line note"`);
  if (!note) fail('a one-line note is required — it becomes the changelog entry');
  if (spawnSync(process.execPath, ['--test'], { cwd: REPO, stdio: 'inherit' }).status !== 0) fail('the suite is red');

  const manifestPath = path.join(PLUGIN, '.claude-plugin', 'plugin.json');
  const plugin = readJsonFile(manifestPath);
  plugin.version = BUMPS[bump](plugin.version.split('.').map(Number)).join('.');
  writeJson(manifestPath, plugin);
  writeFileSync(path.join(REPO, 'docs', 'MANIFEST.md'), manifest(), 'utf8');
  const pkgPath = path.join(REPO, 'package.json');
  const pkg = readJsonFile(pkgPath);
  pkg.version = plugin.version;
  pkg.contentHash = stamp();
  writeJson(pkgPath, pkg);
  const citation = path.join(REPO, 'CITATION.cff');
  if (existsSync(citation)) {
    writeFileSync(citation, readFileSync(citation, 'utf8')
      .replace(/^version: .*$/m, `version: ${plugin.version}`)
      .replace(/^date-released: .*$/m, `date-released: ${args.date || 'unreleased'}`), 'utf8');
  }
  const changelog = path.join(REPO, 'CHANGELOG.md');
  const previous = existsSync(changelog) ? readFileSync(changelog, 'utf8').replace(/^# Changelog\n/, '') : '';
  writeFileSync(changelog,
    `# Changelog\n\n## ${plugin.version} — ${args.date || 'unreleased'}\n\n- ${note}\n\n${previous.replace(/^\n+/, '')}`,
    'utf8');
  row('released', `${plugin.version} stamped ${pkg.contentHash}`);
  report();
}

function setup(args) {
  sync(args);
  if (args.project) sync({ ...args, scope: 'project', target: args.project });
  upkeep();
  install();
  report();
  console.log('');
  const { failed } = doctor();
  console.log('');
  console.log(failed
    ? '  Restart Claude Code, then run: npm run doctor'
    : '  Ready. Restart Claude Code so the session card loads.');
}

const args = parse(process.argv.slice(2));
const command = ['sync', 'install', 'upkeep', 'doctor', 'publish', 'release', 'setup'].includes(args._[0])
  ? args._.shift()
  : 'setup';

if (command === 'setup') await setup(args);
else if (command === 'sync') { sync(args); report(); }
else if (command === 'install') { install(); report(); }
else if (command === 'upkeep') { upkeep(); if (args.install) install(); report(); }
else if (command === 'doctor') process.exit(doctor().failed ? 1 : 0);
else if (command === 'publish') process.exit(publish() ? 1 : 0);
else if (command === 'release') release(args);

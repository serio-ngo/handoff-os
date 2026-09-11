#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { SPAWN_TOOLS } from '../plugins/handoff-os/scripts/patterns.mjs';
import { writeFigures } from './figures.mjs';
import { PLUGIN, REPO, inventory, manifest, markdown, policyFor, readJson, walk, writeBlock } from './generate.mjs';

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
  const args = { _: [], without: [], lock: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { args._.push(arg); continue; }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = argv[++i];
  }
  for (const key of ['without', 'lock']) {
    if (typeof args[key] === 'string') {
      args[key] = args[key].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (args[key] === true) args[key] = [];
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

function releaseLocks(settings, requested) {
  const bundles = readJson('settings', 'policy.json').lock ?? {};
  const stale = Object.entries(bundles)
    .filter(([token]) => !requested.includes(token))
    .flatMap(([, rules]) => rules);
  if (!stale.length || !settings.permissions?.deny) return settings;
  const deny = settings.permissions.deny.filter((rule) => !stale.includes(rule));
  return { ...settings, permissions: { ...settings.permissions, deny } };
}

function sync(args) {
  const scope = args.scope || 'user';
  if (!['user', 'project'].includes(scope)) fail(`unknown scope "${scope}"`);
  const target = path.resolve(args.target
    || (scope === 'project' ? path.join(REPO, '.claude', 'settings.json') : path.join(CONFIG_DIR, 'settings.json')));
  const before = readJsonFile(target, {});
  let after = merge(before, policyFor(scope, args.without, undefined, args.lock));
  if (scope === 'user') after = merge(after, installation());
  after = releaseLocks(after, args.lock ?? []);
  after.env = { ...after.env };
  if ((args.lock ?? []).includes('git')) after.env.HANDOFF_LOCK_GIT = '1';
  else delete after.env.HANDOFF_LOCK_GIT;
  if (Object.keys(after.env).length === 0) delete after.env;
  refuseMeteredAuth(after);
  if (!args.dryRun) writeJson(target, after);
  const counts = RULE_LISTS
    .map((key) => `${key}+=${(after.permissions?.[key] ?? []).filter((r) => !(before.permissions?.[key] ?? []).includes(r)).length}`);
  row(`settings (${scope})`, `${target} ${counts.join(' ')}${args.dryRun ? ' DRY RUN' : ''}`);
  return after;
}

const cacheRoot = () => path.join(CONFIG_DIR, 'plugins', 'cache', marketplace.name, PLUGIN_NAME);
const registryPath = () => path.join(CONFIG_DIR, 'plugins', 'installed_plugins.json');
const registryKey = () => `${PLUGIN_NAME}@${marketplace.name}`;

function registration() {
  const entries = readJsonFile(registryPath(), {}).plugins?.[registryKey()];
  return Array.isArray(entries) ? entries[0] : undefined;
}

function register(version) {
  const file = registryPath();
  const registry = readJsonFile(file, {});
  const now = new Date().toISOString();
  const previous = registration() ?? {};
  const entry = {
    ...previous,
    scope: previous.scope || 'user',
    installPath: path.join(cacheRoot(), version),
    version,
    installedAt: previous.installedAt || now,
    lastUpdated: now,
  };
  writeJson(file, { ...registry, version: registry.version ?? 2, plugins: { ...registry.plugins, [registryKey()]: [entry] } });
  return entry;
}

function installTargets() {
  const declared = readJson('plugins', PLUGIN_NAME, '.claude-plugin', 'plugin.json').version;
  const existing = existsSync(cacheRoot())
    ? readdirSync(cacheRoot(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  return { declared, targets: [declared], stale: existing.filter((version) => version !== declared) };
}

function install() {
  const { declared, targets, stale } = installTargets();
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
  const entry = register(declared);
  for (const version of stale) {
    rmSync(path.join(cacheRoot(), version), { recursive: true, force: true });
  }
  row('plugin', `${PLUGIN_NAME} ${declared} (${wanted.length} files, ${pruned} file(s) and ${stale.length} old version(s) pruned)`);
  row('registered', `${entry.installPath}`);
  return { declared, targets };
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
  const figures = writeFigures();
  const touched = normalise();
  writeFileSync(path.join(REPO, 'docs', 'MANIFEST.md'), manifest(), 'utf8');
  row('figures', `${figures.length} file(s)`);
  row('formatted', `${touched} file(s)`);
}

function check() {
  const diff = spawnSync('git', ['diff', '--exit-code'], { cwd: REPO, stdio: 'inherit' });
  if (diff.status !== 0) fail('generated artefacts are stale — review the diff, then commit it');
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
    return ok;
  };

  check('the plugin is enabled', settings.enabledPlugins?.[`${PLUGIN_NAME}@${marketplace.name}`] === true);
  check('login is restricted to the subscription', settings.forceLoginMethod === 'claudeai');
  const gitLock = readJson('settings', 'policy.json').lock?.git ?? [];
  const denied = (settings.permissions?.deny ?? []).some((r) => gitLock.includes(r));
  check(denied ? 'every git write is denied by a deny rule' : 'git writes are allowed — the default',
    denied === (settings.env?.HANDOFF_LOCK_GIT === '1'), 'deny rules and HANDOFF_LOCK_GIT must agree');
  check('no metered credential is configured', !new RegExp(`${BANNED.join('|')}|apiKeyHelper`).test(JSON.stringify(settings)));
  check('no metered credential is in the environment', !BANNED.some((key) => process.env[key]));

  const current = (version) => {
    const dest = path.join(cacheRoot(), version);
    return existsSync(dest) && walk(PLUGIN).every((rel) => existsSync(path.join(dest, rel))
      && readFileSync(path.join(dest, rel), 'utf8') === readFileSync(path.join(PLUGIN, rel), 'utf8'));
  };
  const installed = check('every installed copy is this checkout', targets.every(current),
    `${targets.length} version(s): ${targets.join(', ')}`);
  check('the installed copy is on disk', existsSync(cache), cache);

  const entry = registration();
  const root = entry ? String(entry.installPath || '') : '';
  check('the plugin registration names a path', Boolean(root), root || 'no entry in installed_plugins.json');
  check('the path Claude Code resolves exists', Boolean(root) && existsSync(root), root || '—');
  check('the registered version is the declared one', entry?.version === declared,
    `registered ${entry?.version ?? 'none'} vs declared ${declared}`);

  const probe = mkdtempSync(path.join(tmpdir(), 'handoff-doctor-'));
  const at = (dir, script, payload, env) => spawnSync(process.execPath, [path.join(dir, 'scripts', script)], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, HANDOFF_OS_DIR: probe, ...env },
  });
  const session = () => `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pre = (tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', session_id: session(), cwd: probe, tool_name, tool_input });

  if (root) {
    check('the guard Claude Code resolves actually blocks',
      at(root, 'guard.mjs', pre('Bash', { command: 'git merge main' })).status === BLOCKED,
      'live hook path, not the cache');
  }

  const fire = (payload, env) => at(cache, 'guard.mjs', payload, env).status;
  const shell = (command, env) => fire(pre('Bash', { command }), env);
  check('the installed guard blocks a merge', shell('git merge main') === BLOCKED);
  check('the installed guard blocks a commit and a push under the git lock',
    ['git commit -m x', 'git push origin main'].every((c) => shell(c, { HANDOFF_LOCK_GIT: '1' }) === BLOCKED),
    'whatever the deny list currently says');
  check('the installed guard blocks an outward connector call', fire(pre('mcp__x__send_message', {})) === BLOCKED);
  check('the installed guard blocks an opus review, whatever the spawn tool',
    SPAWN_TOOLS.every((tool) => fire(pre(tool, { model: 'opus', prompt: 'review the diff' })) === BLOCKED),
    SPAWN_TOOLS.join(', '));
  check('the installed guard blocks a dispatch that names no model', fire(pre('Agent', { prompt: 'audit the repo' })) === BLOCKED);
  check('the installed guard lets a sonnet review through', fire(pre('Agent', { model: 'sonnet', prompt: 'review the diff' })) === 0);
  check('the installed guard lets a teammate spawn through, which cannot name a model',
    fire(pre('TaskCreate', { description: 'analyse the config', subject: 'config' })) === 0);
  check('the installed card prints', spawnSync(process.execPath, [path.join(cache, 'scripts', 'card.mjs')], { encoding: 'utf8' }).stdout.trim().length > 0);
  const month = new Date().toISOString().slice(0, 7);
  check('every probe receipt landed in the throwaway root, not the repo ledger',
    existsSync(path.join(probe, 'audit', `${month}.jsonl`)), probe);
  check(`the plugin costs ~${Math.round(inventory().contextChars / 4)} tok of context`, true,
    'card plus skill and agent descriptions, always in context');

  const failed = checks.filter((ok) => !ok).length;
  console.log(`  ${checks.length - failed} of ${checks.length} yes`);
  return { failed, installed };
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
  writeJson(pkgPath, pkg);
  const changelog = path.join(REPO, 'CHANGELOG.md');
  const head = '# Changelog\n\n<!-- one row per version; `npm run release` updates -->\n\n| Version | Date | Change |\n|---|---|---|\n';
  const rows = existsSync(changelog)
    ? readFileSync(changelog, 'utf8').split('\n').filter((line) => /^\| \d/.test(line))
    : [];
  const date = args.date || new Date().toISOString().slice(0, 10);
  rows.unshift(`| ${plugin.version} | ${date} | ${note.replaceAll('|', '\\|')} |`);
  writeFileSync(changelog, `${head}${rows.join('\n')}\n`, 'utf8');
  writeFileSync(path.join(REPO, 'docs', 'MANIFEST.md'), manifest(), 'utf8');
  row('released', plugin.version);
  report();
  const bench = (...args) => spawnSync(process.execPath, [path.join(REPO, 'scripts', 'benchmark.mjs'), REPO, ...args], { stdio: 'inherit' });
  bench('--eval', '--compare', '--write');
  bench('--write');
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
const command = ['sync', 'install', 'upkeep', 'doctor', 'release', 'setup'].includes(args._[0])
  ? args._.shift()
  : 'setup';

if (command === 'setup') await setup(args);
else if (command === 'sync') { sync(args); report(); }
else if (command === 'install') { install(); report(); }
else if (command === 'upkeep') { upkeep(); if (args.install) install(); report(); if (args.check) check(); }
else if (command === 'doctor') process.exit(doctor().failed ? 1 : 0);
else if (command === 'release') release(args);

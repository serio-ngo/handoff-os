import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN = path.join(REPO, 'plugins', 'handoff-os');

export const read = (...parts) => readFileSync(path.join(REPO, ...parts), 'utf8');
export const readJson = (...parts) => JSON.parse(read(...parts));

export const walk = (dir, base = '') => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
  .flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });

export const SCOPES = {
  user: ({ deny, ask }) => ({
    forceLoginMethod: 'claudeai',
    permissions: { defaultMode: 'default', deny, ask },
  }),
  project: ({ deny }) => ({ permissions: { deny } }),
  managed: ({ deny }) => ({
    forceLoginMethod: 'claudeai',
    permissions: { disableBypassPermissionsMode: true, deny },
  }),
};

export function policyFor(scope, without = [], policy = readJson('settings', 'policy.json')) {
  const drop = (rules) => without.length
    ? rules.filter((rule) => !without.some((token) => rule.toLowerCase().includes(token)))
    : rules;
  return SCOPES[scope]({ deny: drop(policy.deny), ask: drop(policy.ask) });
}

const SHIPPED = [['plugins/handoff-os', /\.(md|mjs|json)$/], ['settings', /\.json$/]];

export function stamp(root = REPO) {
  const files = SHIPPED
    .filter(([dir]) => existsSync(path.join(root, dir)))
    .flatMap(([dir, pattern]) => walk(path.join(root, dir), dir).filter((f) => pattern.test(path.basename(f))))
    .filter((file) => file !== 'plugins/handoff-os/memory.md')
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

const table = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `|${header.map(() => '---').join('|')}|`,
  ...rows,
].join('\n');

function skillRows() {
  const dir = path.join(PLUGIN, 'skills');
  return readdirSync(dir).sort().map((name) => {
    const text = readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    const description = (/^description:\s*(.*)$/m.exec(text) || [])[1] || '';
    return `| \`${name}\` | ${description.replace(/^["']|["']$/g, '').length} | ${text.split('\n').length} |`;
  });
}

const cell = (value) => String(value).replace(/\|/g, '\\|');

function hookRows() {
  return Object.entries(readJson('plugins', 'handoff-os', 'hooks', 'hooks.json').hooks)
    .flatMap(([event, entries]) => entries.flatMap((entry) => entry.hooks.map((handler) => {
      const script = (/scripts\/[a-z-]+\.mjs/.exec(handler.command) || [])[0];
      return `| \`${event}\` | \`${cell(entry.matcher || '*')}\` | \`${script}\` |`;
    })))
    .sort();
}

export function manifest() {
  const { version } = readJson('plugins', 'handoff-os', '.claude-plugin', 'plugin.json');
  return [
    '# Manifest',
    '',
    `Everything the plugin loads, at version ${version}. Generated — \`npm run upkeep\` rewrites it.`,
    '',
    '## Skills', '',
    table(['Skill', 'Description chars, always in context', 'Body lines, on use'], skillRows()), '',
    '## Hooks', '',
    table(['Event', 'Matcher', 'Script'], hookRows()), '',
  ].join('\n');
}

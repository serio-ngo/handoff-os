import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { footprint, frontmatter } from '../plugins/handoff-os/scripts/card.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN = path.join(REPO, 'plugins', 'handoff-os');

export const read = (...parts) => readFileSync(path.join(REPO, ...parts), 'utf8');
export const readJson = (...parts) => JSON.parse(read(...parts));

export const walk = (dir, base = '') => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
  .flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
  });

const SCOPES = {
  user: ({ deny, ask }) => ({
    forceLoginMethod: 'claudeai',
    permissions: { defaultMode: 'default', deny, ask },
  }),
  project: ({ deny }) => ({ permissions: { deny } }),
};

export function policyFor(scope, without = [], policy = readJson('settings', 'policy.json'), unlock = []) {
  const drop = (rules) => without.length
    ? rules.filter((rule) => !without.some((token) => rule.toLowerCase().includes(token)))
    : rules;
  const shut = Object.entries(policy.unlock ?? {})
    .filter(([token]) => !unlock.includes(token)).flatMap(([, rules]) => rules);
  return SCOPES[scope]({ deny: drop([...policy.deny, ...shut]), ask: drop(policy.ask) });
}

const table = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `|${header.map(() => '---').join('|')}|`,
  ...rows,
].join('\n');

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

export function writeBlock(file, open, close, lines) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return `no file at ${file}`; }
  const all = text.split('\n');
  const a = all.indexOf(open);
  const z = all.indexOf(close);
  if (a < 0 || z < a) return `no markers in ${file}`;
  let next = `${[...all.slice(0, a + 1), ...lines, ...all.slice(z)].join('\n').replace(/\n+$/, '')}\n`;
  if (file.endsWith('.md')) next = markdown(next.replace(/\r\n/g, '\n'));
  writeFileSync(file, next, 'utf8');
  return `refreshed ${path.basename(file)}`;
}

export function inventory(root = REPO) {
  const plugin = path.join(root, 'plugins', 'handoff-os');
  const scripts = readdirSync(path.join(plugin, 'scripts')).filter((f) => f.endsWith('.mjs'));
  let lines = 0;
  let code = 0;
  for (const file of scripts) {
    const text = readFileSync(path.join(plugin, 'scripts', file), 'utf8').split(/\r?\n/);
    lines += text.length;
    code += text.filter((line) => line.trim() && !line.trim().startsWith('//')).length;
  }

  const skills = readdirSync(path.join(plugin, 'skills'));
  const agents = readdirSync(path.join(plugin, 'agents')).filter((f) => f.endsWith('.md'));

  const events = Object.entries(JSON.parse(readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks);
  const handlers = events.reduce((sum, [, group]) => sum
    + group.reduce((n, entry) => n + entry.hooks.length, 0), 0);

  const patterns = (readFileSync(path.join(plugin, 'scripts', 'patterns.mjs'), 'utf8').match(/^export const/gm) || []).length;
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { cardChars, skillChars, agentChars, contextChars } = footprint('');

  return {
    skills: skills.length,
    agents: agents.length,
    hookEvents: events.length,
    hookHandlers: handlers,
    scripts: scripts.length,
    logicLines: lines,
    codeLines: code,
    patterns,
    dependencies: Object.keys(pkg.dependencies || {}).length,
    cardChars,
    skillChars,
    agentChars,
    contextChars,
    contextTokens: Math.round(contextChars / 4),
  };
}

function inventoryBlock(inv = inventory()) {
  return [
    table(['What ships', 'Count'], [
      `| Guard logic | **${inv.logicLines}** lines of Node across ${inv.scripts} scripts (${inv.codeLines} non-blank) |`,
      `| Pattern rules | **${inv.patterns}** |`,
      `| Hooks | **${inv.hookHandlers}** handlers on ${inv.hookEvents} events |`,
      `| Skills | **${inv.skills}** |`,
      `| Subagents | **${inv.agents}** |`,
      `| Third-party packages | **${inv.dependencies}** |`,
      `| Network calls, API keys, model calls | **0** |`,
    ]),
  ].join('\n').split('\n');
}

function skillRows() {
  const dir = path.join(PLUGIN, 'skills');
  return readdirSync(dir).sort().map((name) => {
    const text = readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    return `| \`${name}\` | ${frontmatter(text, 'description').length} | ${text.split('\n').length} |`;
  });
}

function agentRows() {
  const dir = path.join(PLUGIN, 'agents');
  return readdirSync(dir).sort().map((name) => {
    const text = readFileSync(path.join(dir, name), 'utf8');
    return `| \`${name.replace('.md', '')}\` | ${frontmatter(text, 'model')} | ${cell(frontmatter(text, 'tools'))} |`;
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
    `<sub><b>Answers</b> · everything the plugin loads at version ${version} · generated, \`npm run upkeep\` rewrites it · <a href="../README.md">README</a></sub>`,
    '',
    '## Skills', '',
    table(['Skill', 'Description chars, always in context', 'Body lines, on use'], skillRows()), '',
    '## Agents', '',
    table(['Agent', 'model', 'Tools'], agentRows()), '',
    '## Hooks', '',
    table(['Event', 'Matcher', 'Script'], hookRows()), '',
    '## Inventory', '',
    ...inventoryBlock(), '',
  ].join('\n');
}

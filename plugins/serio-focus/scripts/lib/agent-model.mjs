import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_TIERS = /\b(?:haiku|sonnet|opus|fable)\b/i;
const FRONTMATTER_MODEL = /^model:\s*['"]?([\w.-]+)/m;

// A "plugin:agent" name resolves inside that plugin; a bare name is a project or user agent
// and must never be shadowed by a plugin agent that happens to share it.
const definitionPaths = (subagent, cwd) => {
  if (subagent.includes(':')) return [path.join(PLUGIN_ROOT, 'agents', `${subagent.split(':').pop()}.md`)];
  return [
    path.join(cwd, '.claude', 'agents', `${subagent}.md`),
    path.join(homedir(), '.claude', 'agents', `${subagent}.md`),
  ];
};

// The tier a named agent will run on, or null when nothing on disk declares one.
export function declaredModel(subagent, cwd = process.cwd()) {
  if (!subagent) return null;
  for (const file of definitionPaths(String(subagent), cwd)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const tier = (FRONTMATTER_MODEL.exec(text) || [])[1] || '';
    return MODEL_TIERS.test(tier) ? tier.toLowerCase() : null;
  }
  return null;
}

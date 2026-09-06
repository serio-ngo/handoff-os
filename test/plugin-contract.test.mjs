import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = path.join(REPO, 'plugins', 'handoff-os');
const SKILLS = path.join(PLUGIN, 'skills');

const MAX_SKILLS = 3;
const MAX_AGENTS = 1;
const MAX_DESCRIPTION_CHARS = 800;
const MAX_DESCRIPTION_TOTAL = 4000;
const MAX_BODY_LINES = 160;
const PORTABLE_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];

const read = (...parts) => readFileSync(path.join(...parts), 'utf8');
const readJson = (...parts) => JSON.parse(read(...parts));

const marketplace = readJson(REPO, '.claude-plugin', 'marketplace.json');
const manifest = readJson(PLUGIN, '.claude-plugin', 'plugin.json');
const hooks = readJson(PLUGIN, 'hooks', 'hooks.json').hooks;
const skillNames = readdirSync(SKILLS);

function frontmatter(text) {
  const block = (/^---\r?\n([\s\S]*?)\r?\n---/.exec(text) || [])[1] || '';
  const fields = Object.fromEntries(
    block.split(/\r?\n/).map((line) => /^([A-Za-z-]+):\s*(.*)$/.exec(line)).filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]),
  );
  return { fields, bodyLines: text.split('\n').length };
}

describe('marketplace and plugin manifests', () => {
  it('names the marketplace in kebab-case, as the loader requires', () => {
    assert.match(marketplace.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every listed plugin a source that exists on disk', () => {
    for (const plugin of marketplace.plugins) assert.ok(existsSync(path.resolve(REPO, plugin.source)), plugin.source);
  });

  it('carries a version, because the plugin cache is keyed by it', () => {
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  });

  it('keeps every component at the plugin root, never inside .claude-plugin', () => {
    assert.deepEqual(readdirSync(path.join(PLUGIN, '.claude-plugin')), ['plugin.json']);
  });
});

describe('hook wiring', () => {
  const scriptsOf = (event) => JSON.stringify(hooks[event] ?? []);

  it('injects the session card at SessionStart, the only event whose stdout reaches context', () => {
    assert.match(scriptsOf('SessionStart'), /card\.mjs/);
  });

  it('re-injects the card on resume, clear, compact and fork', () => {
    const entry = hooks.SessionStart[0];
    for (const source of ['startup', 'resume', 'clear', 'compact', 'fork']) {
      assert.match(entry.matcher, new RegExp(source));
    }
  });

  it('backs up the first prompt with the same card, so the text has one home', () => {
    assert.match(scriptsOf('UserPromptSubmit'), /card\.mjs/);
  });

  it('spawns one guard per tool call, not one per concern', () => {
    assert.equal(hooks.PreToolUse.length, 1);
    assert.match(JSON.stringify(hooks.PreToolUse), /guard\.mjs/);
  });

  it('routes every guarded tool into it', () => {
    const matcher = new RegExp(hooks.PreToolUse[0].matcher);
    for (const tool of ['Read', 'Bash', 'PowerShell', 'Edit', 'Write', 'Agent', 'Grep', 'Glob', 'mcp__server__send']) {
      assert.ok(matcher.test(tool), tool);
    }
  });

  it('spends no process on tools it has no opinion about', () => {
    const matcher = new RegExp(hooks.PreToolUse[0].matcher);
    for (const tool of ['WebFetch', 'TodoWrite']) assert.ok(!matcher.test(tool), tool);
  });

  it('caps fan-out on PreToolUse, the event that can actually block', () => {
    assert.ok(!hooks.SubagentStart);
    assert.match(new RegExp(hooks.PreToolUse[0].matcher).source, /Agent/);
  });

  it('appends the audit receipt after the tool ran, never before', () => {
    assert.match(scriptsOf('PostToolUse'), /audit\.mjs/);
  });

  it('holds the verification gate at Stop', () => {
    assert.match(scriptsOf('Stop'), /verify\.mjs/);
  });

  it('points every command at a script that exists', () => {
    for (const entries of Object.values(hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          const script = (/scripts\/[a-z-]+\.mjs/.exec(handler.command) || [])[0];
          assert.ok(script && existsSync(path.join(PLUGIN, script)), handler.command);
        }
      }
    }
  });
});

describe('context budget — every skill description is loaded in every session', () => {
  it(`ships at most ${MAX_SKILLS} skills`, () => assert.ok(skillNames.length <= MAX_SKILLS, skillNames.join(' ')));

  it(`ships at most ${MAX_AGENTS} subagent, because the built-ins cover the rest`, () => {
    const agents = path.join(PLUGIN, 'agents');
    const count = existsSync(agents) ? readdirSync(agents).filter((n) => n.endsWith('.md')).length : 0;
    assert.ok(count <= MAX_AGENTS);
  });

  it('ships a haiku scout for cheap lookups, so simple tasks stop burning the main model', () => {
    const scout = read(PLUGIN, 'agents', 'scout.md');
    assert.match(scout, /^name: scout$/m);
    assert.match(scout, /^model: haiku$/m);
    const tools = (/^tools:\s*(.*)$/m.exec(scout) || [])[1] || '';
    assert.doesNotMatch(tools, /Edit|Write|Bash/);
    assert.match(tools, /Read/);
    assert.match(tools, /Grep/);
  });

  const parsed = skillNames.map((name) => ({ name, ...frontmatter(read(SKILLS, name, 'SKILL.md')) }));

  it('every skill uses only the six frontmatter fields that survive an upload to every surface', () => {
    for (const { name, fields } of parsed) {
      assert.deepEqual(Object.keys(fields).filter((key) => !PORTABLE_FIELDS.includes(key)), [], name);
    }
  });

  it(`every description fits ${MAX_DESCRIPTION_CHARS} characters`, () => {
    for (const { name, fields } of parsed) assert.ok(fields.description.length <= MAX_DESCRIPTION_CHARS, name);
  });

  it(`every body fits ${MAX_BODY_LINES} lines`, () => {
    for (const { name, bodyLines } of parsed) assert.ok(bodyLines <= MAX_BODY_LINES, name);
  });

  it('every skill is named after its own directory, so the slash command is predictable', () => {
    for (const { name, fields } of parsed) assert.equal(fields.name, name);
  });

  it(`spends at most ${MAX_DESCRIPTION_TOTAL} characters of permanent context in total`, () => {
    const total = parsed.reduce((sum, { fields }) => sum + fields.description.length, 0);
    assert.ok(total <= MAX_DESCRIPTION_TOTAL, `${total} chars`);
  });
});

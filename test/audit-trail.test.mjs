import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUDIT = fileURLToPath(new URL('../plugins/handoff-os/scripts/audit-append.mjs', import.meta.url));
const HOOKS = JSON.parse(readFileSync(new URL('../plugins/handoff-os/hooks/hooks.json', import.meta.url), 'utf8'));
const FIELDS = ['ts', 'actor', 'tier', 'action', 'target', 'result'];

const sandboxes = [];
after(() => sandboxes.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-'));
  sandboxes.push(root);
  return root;
}

function append(payload, root = sandbox()) {
  const result = spawnSync(process.execPath, [AUDIT], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HANDOFF_OS_DIR: root },
  });
  const month = new Date().toISOString().slice(0, 7);
  const ledger = path.join(root, 'audit', `${month}.jsonl`);
  const lines = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { result, lines, root };
}

describe('audit receipt', () => {
  it('appends one line per write, into a file named for the month', () => {
    const { lines } = append({ tool_name: 'Write', tool_input: { file_path: 'notes.md' } });
    assert.equal(lines.length, 1);
  });

  it('carries exactly the six agreed fields', () => {
    const { lines } = append({ tool_name: 'Write', tool_input: { file_path: 'notes.md' } });
    assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), [...FIELDS].sort());
  });

  it('records a write inside the repo as GREEN', () => {
    const root = sandbox();
    const { lines } = append({ tool_name: 'Write', tool_input: { file_path: path.join(root, 'notes.md') } }, root);
    assert.equal(JSON.parse(lines[0]).tier, 'GREEN');
  });

  it('records a write outside the repo as YELLOW', () => {
    const { lines } = append({ tool_name: 'Write', tool_input: { file_path: path.join(tmpdir(), 'elsewhere.md') } });
    assert.equal(JSON.parse(lines[0]).tier, 'YELLOW');
  });

  it('records a connector call as YELLOW, because it left the repo', () => {
    const { lines } = append({ tool_name: 'mcp__server__create_item', tool_input: {} });
    assert.equal(JSON.parse(lines[0]).tier, 'YELLOW');
  });

  it('truncates a shell command so the ledger stays one line per act', () => {
    const { lines } = append({ tool_name: 'Bash', tool_input: { command: 'x'.repeat(500) } });
    assert.ok(JSON.parse(lines[0]).target.length <= 120);
  });
});

describe('audit never interferes', () => {
  it('exits 0 on a payload it cannot parse', () => {
    assert.equal(append('{not json').result.status, 0);
  });

  it('writes nothing when no tool is named', () => {
    const { result, lines } = append({});
    assert.equal(result.status, 0);
    assert.equal(lines.length, 0);
  });
});

describe('which tool calls reach the audit', () => {
  const matcher = new RegExp(
    HOOKS.hooks.PostToolUse.find((entry) => String(entry.matcher).startsWith('^mcp__')).matcher,
  );
  const tool = (action) => `mcp__00000000-0000-4000-a000-000000000000__${action}`;

  for (const action of ['get_thread', 'list_labels', 'search_threads', 'read_docs', 'asset_search', 'resolve-shortlink', 'list-replies', 'get-export-formats']) {
    it(`skips the read-only call ${action}`, () => assert.ok(!matcher.test(tool(action))));
  }

  for (const action of ['send_message', 'create_update', 'change_item_column_values', 'delete_item', 'export-design', 'reply-to-comment', 'comment-on-design', 'create_and_send_email']) {
    it(`records the write call ${action}`, () => assert.ok(matcher.test(tool(action))));
  }

  it('records getaway_count rather than reading it as a "get" call', () => {
    assert.ok(matcher.test(tool('getaway_count')));
  });
});

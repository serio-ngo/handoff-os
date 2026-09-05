#!/usr/bin/env node
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveSteps, stepsToCommand } from './verify-steps.mjs';

const DONE_CLAIM = /\b(done|complete|completed|finished|works now|fixed|ready|shipped)\b/i;
const MARKER_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BLOCKS = 2;

function standDown(message) {
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: { hookEventName: 'Stop' },
  }));
  process.exit(0);
}

try {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const pkgPath = `${root}/package.json`;
  if (!existsSync(pkgPath)) process.exit(0);

  function lastAssistantText(p) {
    if (!p || !existsSync(p)) return '';
    let lines;
    try { lines = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean); } catch { return ''; }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let row;
      try { row = JSON.parse(lines[i]); } catch { continue; }
      const msg = row.message || row;
      if ((row.type || msg.role) !== 'assistant' && msg.role !== 'assistant') continue;
      const content = msg.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const text = content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
        if (text.trim()) return text;
      }
    }
    return '';
  }

  const message = String(payload.last_assistant_message || '') ||
    lastAssistantText(payload.transcript_path);
  if (!DONE_CLAIM.test(message)) process.exit(0);

  let steps = [];
  try { steps = resolveSteps(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts); } catch { process.exit(0); }
  const verifyCommand = stepsToCommand(steps);
  if (!verifyCommand) process.exit(0);

  const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  const claudeDir = `${root}/.claude`;
  const marker = `${claudeDir}/.verified-${session}`;
  const counterFile = `${claudeDir}/.verify-gate-count-${session}`;

  if (existsSync(marker)) {
    try {
      if (Date.now() - statSync(marker).mtimeMs < MARKER_MAX_AGE_MS) process.exit(0);
    } catch { process.exit(0); }
  }

  let blocks = 0;
  try { blocks = parseInt(readFileSync(counterFile, 'utf8').trim(), 10) || 0; } catch { blocks = 0; }

  if (blocks >= MAX_BLOCKS) {
    standDown(`Verify gate stood down after ${MAX_BLOCKS} blocks this session. Verification of "${verifyCommand}" is unproven - the human must check it.`);
  }

  try {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(counterFile, String(blocks + 1), 'utf8');
  } catch {
  }

  process.stderr.write(
    `Verify gate: you claimed done with no evidence. Run exactly this, then say done again:\n` +
    `  node "\${CLAUDE_PLUGIN_ROOT}/scripts/verify-run.mjs" ${session}\n` +
    `It runs ${verifyCommand} and writes the marker only if that exits 0. ` +
    `Writing the marker by hand is forbidden - it would make this gate theatre.\n`
  );
  process.exit(2);
} catch {
  process.exit(0);
}

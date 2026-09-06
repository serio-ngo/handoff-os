#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DONE_CLAIM = /\b(?:done|complete|completed|finished|works now|fixed|ready|shipped)\b/i;
const MARKER_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BLOCKS = 2;

export const FALLBACK_STEPS = ['content:check', 'typecheck', 'build'];
export const resolveSteps = (scripts) => (scripts?.verify ? ['verify'] : FALLBACK_STEPS.filter((step) => scripts?.[step]));
export const stepsToCommand = (steps) => steps.map((step) => `npm run ${step}`).join(' && ');

const scriptsAt = (root) => {
  try { return JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).scripts || {}; } catch { return null; }
};

function lastAssistantText(file) {
  if (!file || !existsSync(file)) return '';
  let lines;
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch { return ''; }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    const message = entry.message || entry;
    if ((entry.type || message.role) !== 'assistant' && message.role !== 'assistant') continue;
    const { content } = message;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n');
      if (text.trim()) return text;
    }
  }
  return '';
}

function gate() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const scripts = scriptsAt(root);
  if (!scripts) process.exit(0);

  const message = String(payload.last_assistant_message || '') || lastAssistantText(payload.transcript_path);
  if (!DONE_CLAIM.test(message)) process.exit(0);

  const command = stepsToCommand(resolveSteps(scripts));
  if (!command) process.exit(0);

  const session = String(payload.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  const marker = `${root}/.claude/.verified-${session}`;
  const counter = `${root}/.claude/.verify-gate-count-${session}`;

  if (existsSync(marker)) {
    try {
      if (Date.now() - statSync(marker).mtimeMs < MARKER_MAX_AGE_MS) process.exit(0);
    } catch { process.exit(0); }
  }

  let blocks = 0;
  try { blocks = parseInt(readFileSync(counter, 'utf8').trim(), 10) || 0; } catch { blocks = 0; }

  if (blocks >= MAX_BLOCKS) {
    process.stdout.write(JSON.stringify({
      systemMessage: `Verify gate stood down after ${MAX_BLOCKS} blocks. "${command}" is unproven — the human must check it.`,
      hookSpecificOutput: { hookEventName: 'Stop' },
    }));
    process.exit(0);
  }

  try {
    mkdirSync(`${root}/.claude`, { recursive: true });
    writeFileSync(counter, String(blocks + 1), 'utf8');
  } catch { }

  process.stderr.write(`Verify gate: you claimed done with no evidence. Run this, then say done again:\n  node "\${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" ${session}\nIt runs ${command} and writes the marker only on exit 0. Writing the marker by hand is forbidden.\n`);
  process.exit(2);
}

function runner(session, root) {
  const scripts = scriptsAt(root);
  if (!scripts) {
    console.error(`verify: no readable package.json at ${root}`);
    process.exit(1);
  }
  const steps = resolveSteps(scripts);
  if (!steps.length) {
    console.error(`verify: package.json defines none of verify, ${FALLBACK_STEPS.join(', ')}`);
    process.exit(1);
  }
  for (const step of steps) {
    console.log(`verify: npm run ${step}`);
    const result = spawnSync('npm', ['run', step], { cwd: root, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      console.error(`verify: FAILED at "npm run ${step}" (exit ${result.status}). No marker written.`);
      process.exit(result.status || 1);
    }
  }
  mkdirSync(`${root}/.claude`, { recursive: true });
  writeFileSync(`${root}/.claude/.verified-${session}`, `${new Date().toISOString()} ${steps.join(' && ')}\n`, 'utf8');
  console.log(`verify: PASSED ${stepsToCommand(steps)} — marker written.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const session = String(process.argv[2] || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (process.argv[2] === undefined) gate();
  else if (!session) {
    console.error('verify: pass the session id the gate printed.');
    process.exit(1);
  } else runner(session, (process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/'));
}

#!/usr/bin/env node

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolveSteps } from './verify-steps.mjs';

const session = String(process.argv[2] || '').replace(/[^A-Za-z0-9_-]/g, '');
const root = (process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/');

if (!session) {
  console.error('verify-run: pass the session id. It is the session_id shown by the verify gate.');
  process.exit(1);
}

const pkgPath = `${root}/package.json`;
if (!existsSync(pkgPath)) {
  console.error(`verify-run: no package.json at ${root} - nothing to verify.`);
  process.exit(1);
}

let scripts = {};
try {
  scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts || {};
} catch (e) {
  console.error(`verify-run: unreadable package.json - ${e.message}`);
  process.exit(1);
}

const steps = resolveSteps(scripts);

if (steps.length === 0) {
  console.error('verify-run: package.json has no verify, content:check, typecheck or build script.');
  process.exit(1);
}

for (const step of steps) {
  console.log(`verify-run: npm run ${step}`);
  const r = spawnSync('npm', ['run', step], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`verify-run: FAILED at "npm run ${step}" (exit ${r.status}). No marker written.`);
    process.exit(r.status || 1);
  }
}

const dir = `${root}/.claude`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/.verified-${session}`, `${new Date().toISOString()} ${steps.join(' && ')}\n`, 'utf8');
console.log(`verify-run: PASSED ${steps.map((s) => `npm run ${s}`).join(' && ')} - marker written.`);

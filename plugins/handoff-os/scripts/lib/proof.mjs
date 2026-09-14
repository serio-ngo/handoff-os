import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

const FALLBACK_STEPS = ['content:check', 'typecheck', 'build'];

export const scriptsAt = (root) => {
  try { return JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).scripts || {}; } catch { return null; }
};

export const resolveSteps = (scripts) => (scripts?.verify ? ['verify'] : FALLBACK_STEPS.filter((step) => scripts?.[step]));
export const stepsToCommand = (steps) => steps.map((step) => `npm run ${step}`).join(' && ');

const markerPath = (stateRoot, session) => `${stateRoot}/.claude/.verified-${session}`;
export const counterPath = (stateRoot, session) => `${stateRoot}/.claude/.verify-gate-count-${session}`;

export function provedAt(stateRoot, session) {
  const marker = markerPath(stateRoot, session);
  if (!existsSync(marker)) return 0;
  try {
    const text = readFileSync(marker, 'utf8');
    return Date.parse(text.slice(0, text.indexOf(' '))) || statSync(marker).mtimeMs;
  } catch { return Date.now(); }
}

export function blocksSoFar(stateRoot, session) {
  try { return parseInt(readFileSync(counterPath(stateRoot, session), 'utf8').trim(), 10) || 0; } catch { return 0; }
}

export function recordBlock(stateRoot, session, blocks) {
  try {
    mkdirSync(`${stateRoot}/.claude`, { recursive: true });
    writeFileSync(counterPath(stateRoot, session), String(blocks + 1), 'utf8');
  } catch { }
}

// Runs the project's own verification and leaves a dated marker only if every step passed.
export function runProof(session, root, stateRoot) {
  const scripts = scriptsAt(root);
  if (!scripts) {
    console.error(`verify: no readable package.json at ${root}`);
    return 1;
  }
  const steps = resolveSteps(scripts);
  if (!steps.length) {
    console.error(`verify: package.json defines none of verify, ${FALLBACK_STEPS.join(', ')}`);
    return 1;
  }
  for (const step of steps) {
    console.log(`verify: npm run ${step}`);
    const result = spawnSync('npm', ['run', step], { cwd: root, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      console.error(`verify: FAILED at "npm run ${step}" (exit ${result.status}). No marker written.`);
      return result.status || 1;
    }
  }
  mkdirSync(`${stateRoot}/.claude`, { recursive: true });
  writeFileSync(markerPath(stateRoot, session), `${new Date().toISOString()} ${steps.join(' && ')}\n`, 'utf8');
  rmSync(counterPath(stateRoot, session), { force: true });
  console.log(`verify: PASSED ${stepsToCommand(steps)} — marker written.`);
  return 0;
}

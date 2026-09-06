import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const BLOCKED = 2;
export const ALLOWED = 0;
export const SERVER = '00000000-0000-4000-a000-000000000000';

export const fire = (script, payload, env) => spawnSync(process.execPath, [script], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
  encoding: 'utf8',
  env: env ?? process.env,
});

export const run = (script, args = [], opts = {}) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', ...opts,
});

export const boxes = [];
export const sandbox = (prefix) => {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  boxes.push(root);
  return root;
};
export const scrub = () => {
  for (const dir of boxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { }
  }
};

import { closeSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { waveCap, waveWindow } from './limits.mjs';
import { load, rootOf, save, sessionOf } from './ledger.mjs';
import { Blocked } from './blocked.mjs';

// One file per claimed slot: exclusive create is the only counter that survives
// concurrent hook processes, which have no shared memory.
function claimSlot(dir, bucket, cap) {
  try { mkdirSync(dir, { recursive: true }); } catch {
    try { rmSync(dir, { force: true, recursive: true }); mkdirSync(dir, { recursive: true }); } catch { return cap + 1; }
  }
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(`${bucket}-`)) rmSync(path.join(dir, name), { force: true });
    }
  } catch { }
  for (let n = 1; n <= cap + 1; n += 1) {
    try {
      closeSync(openSync(path.join(dir, `${bucket}-${n}`), 'wx'));
      if (n > cap) rmSync(path.join(dir, `${bucket}-${n}`), { force: true });
      return n;
    } catch { }
  }
  return cap + 1;
}

export function fanOutCap(payload, count = 1) {
  const cap = waveCap();
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const bucket = Math.floor(Date.now() / waveWindow());
  const claimed = [];

  for (let n = 0; n < count; n += 1) {
    const slot = claimSlot(dir, bucket, cap);
    if (slot <= cap) { claimed.push(slot); continue; }

    for (const held of claimed) {
      try { rmSync(path.join(dir, `${bucket}-${held}`), { force: true }); } catch { }
    }
    const root = rootOf(payload);
    const session = sessionOf(payload);
    const state = load(root, session);
    state.saved.blocked += 1;
    state.saved.waves += 1;
    state.saved.agentsCapped += count;
    save(root, session, state);
    throw new Blocked(count > 1
      ? `FAN-OUT CAP: ${count} subagents requested, wave capped at ${cap}\n`
      : `FAN-OUT CAP: subagent ${slot}, wave capped at ${cap}\n`,
    `HANDOFF_MAX_PER_WAVE=${Math.max(count, cap + 1)} (restart)`);
  }
}

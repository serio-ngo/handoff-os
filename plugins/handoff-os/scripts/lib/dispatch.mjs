import { closeSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DENY_SUBAGENT_DEFAULT, MODEL_OPTION, deniedSubagentRx, waveCap, waveWindow } from './patterns.mjs';
import { bump, rootOf, sessionOf } from './ledger.mjs';

export class Blocked extends Error {}

export function deniedModel(input, denied = deniedSubagentRx(process.env.HANDOFF_DENY_SUBAGENT_MODELS ?? DENY_SUBAGENT_DEFAULT)) {
  const selected = [...String(input.script ?? '').matchAll(MODEL_OPTION)].map((hit) => hit[1]);
  const hit = (String(input.model || '').match(denied) || [])[0] || selected.find((tier) => denied.test(tier));
  return hit ? `blocked a ${hit.toLowerCase()} subagent` : null;
}

function claimSlot(dir, bucket, cap) {
  try { mkdirSync(dir, { recursive: true }); } catch { return 1; }
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(`${bucket}-`)) rmSync(path.join(dir, name), { force: true });
  }
  for (let n = 1; n <= cap; n += 1) {
    try { closeSync(openSync(path.join(dir, `${bucket}-${n}`), 'wx')); return n; } catch { }
  }
  return cap + 1;
}

export function fanOutCap(payload) {
  const cap = waveCap();
  const dir = path.join(rootOf(payload), '.claude', `.wave-${sessionOf(payload)}`);
  const slot = claimSlot(dir, Math.floor(Date.now() / waveWindow()), cap);
  if (slot <= cap) return;
  bump(payload, 'agentsCapped');
  throw new Blocked(`FAN-OUT CAP: subagent ${slot}, wave capped at ${cap}\n`);
}

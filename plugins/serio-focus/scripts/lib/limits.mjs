export const BIG_FILE_BYTES = 24 * 1024;
export const GREP_HEAD_LIMIT = 50;
export const BASH_OUTPUT_CAP = 30000;
export const MAX_PER_WAVE = 3;
export const WAVE_MS = 60 * 1000;
export const DENY_SUBAGENT_DEFAULT = 'opus,fable';

const positive = (raw, fallback) => {
  const n = Math.floor(Number(raw));
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const waveCap = (raw = process.env.HANDOFF_MAX_PER_WAVE) => positive(raw, MAX_PER_WAVE);
export const waveWindow = (raw = process.env.HANDOFF_WAVE_MS) => positive(raw, WAVE_MS);
export const delegateOn = (raw = process.env.HANDOFF_DELEGATE) => String(raw ?? '1').trim() !== '0';
export const statsOn = () => process.env.HANDOFF_STATS !== '0';
export const gitWriteAllowed = () => process.env.HANDOFF_GIT_WRITE === '1';

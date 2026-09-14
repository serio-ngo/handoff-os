import { existsSync, readFileSync } from 'node:fs';

export function usage(file) {
  const empty = { fresh: 0, cacheRead: 0, turns: 0 };
  if (!file || !existsSync(file)) return empty;
  let lines;
  try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { return empty; }
  const out = { ...empty };
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const u = entry.message?.usage;
    if (!u) continue;
    out.turns += 1;
    out.fresh += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
    out.cacheRead += u.cache_read_input_tokens || 0;
  }
  return out;
}

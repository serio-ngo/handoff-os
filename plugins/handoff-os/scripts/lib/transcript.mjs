import { existsSync, readFileSync } from 'node:fs';

export function lastAssistantText(file) {
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

import {
  ANYWHERE, AT_HEAD, DISPOSABLE, GH_MUTATION, GIT_DESTRUCTIVE, GIT_SHOW_FILE, GIT_WRITE, INTERPRETER_READ,
  NO_OP_FLAG, PIPE, REDIRECT, REDIRECTED, REDIRECT_AMP, TO_FILE, FD_DUP, REWRITABLE_READ, SED_QUIET, SED_RANGE,
  SHELL_DESTRUCTIVE, SHELL_WRITE_TARGET, SLICE_CMD, WHOLE_FILE_CMD,
} from './patterns.mjs';

export function split(command, breakers, subshell) {
  const out = [];
  let buffer = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote && command[i - 1] !== '\\') quote = null;
      buffer += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; buffer += char; continue; }
    if (char === '&' && REDIRECT_AMP(command[i - 1], command[i + 1])) { buffer += char; continue; }
    if (breakers.includes(char)) { out.push(buffer); buffer = ''; continue; }
    if (subshell && char === '$' && command[i + 1] === '(') { out.push(buffer); buffer = ''; i += 1; continue; }
    buffer += char;
  }
  out.push(buffer);
  return out.map((part) => part.replace(/^\s*(?:\w+=\S+\s+)*/, '').trim()).filter(Boolean);
}

export const segments = (command) => split(command, ';\n&|`', true);
export const pipelines = (command) => split(command, ';\n&', false);

export function onlyDisposable(segment) {
  const operands = segment.split(/\s+/).slice(1)
    .filter((token) => !/^-|^\/[A-Za-z]$|^\d+$/.test(token))
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return operands.length > 0 && operands.every((token) => DISPOSABLE.test(token));
}

export function judgeShell(command) {
  const gitWrite = process.env.HANDOFF_GIT_WRITE === '1';
  for (const rx of ANYWHERE) if (rx.test(command)) return 'blocked a metered-credential assignment';
  for (const segment of segments(command)) {
    if (NO_OP_FLAG.test(segment.replace(/'[^']*'|"[^"]*"/g, ' '))) continue;
    const quoted = `blocked "${segment.slice(0, 80)}"`;
    for (const rx of GIT_DESTRUCTIVE) {
      if (rx.test(segment)) return `${quoted} — merge or delete`;
    }
    for (const rx of SHELL_DESTRUCTIVE) {
      if (rx.test(segment) && !onlyDisposable(segment)) {
        return `${quoted} — delete outside build and temp paths`;
      }
    }
    if (!gitWrite) {
      for (const rx of GIT_WRITE) {
        if (rx.test(segment)) return `${quoted} — a git write`;
      }
    }
    for (const rx of AT_HEAD) {
      if (rx.test(segment)) return `${quoted} — outward action`;
    }
    if (GH_MUTATION.test(segment)) return `${quoted} — a gh api write`;
  }
  return null;
}

export function shellWords(segment) {
  const out = [];
  let buffer = '';
  let quote = null;
  let open = false;
  for (const char of String(segment)) {
    if (quote) {
      if (char === quote) quote = null; else buffer += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; open = true; continue; }
    if (/\s/.test(char)) { if (open || buffer) out.push(buffer); buffer = ''; open = false; continue; }
    buffer += char;
  }
  if (open || buffer) out.push(buffer);
  return out;
}

export const shellQuote = (file) => (/[\s'"]/.test(file) ? `"${file.replace(/(["\\$`])/g, '\\$1')}"` : file);

export function tokens(segment) {
  const out = [];
  let toFile = false;
  const raw = shellWords(segment).filter(Boolean);
  for (let i = 0; i < raw.length; i += 1) {
    const word = raw[i];
    if (REDIRECT.test(word)) {
      const detached = /[<>]&?$/.test(word);
      const target = detached ? (raw[i + 1] || '') : '';
      if (TO_FILE.test(word) && !FD_DUP.test(word) && !target.startsWith('&')) toFile = true;
      if (detached) i += 1;
      continue;
    }
    if (REDIRECTED.test(word)) {
      if (TO_FILE.test(word)) toFile = true;
      continue;
    }
    out.push(word);
  }
  return toFile ? [] : out;
}

const strip = (token) => token.replace(/^['"]|['"]$/g, '');

export function headTail(words) {
  const spec = { lines: 10 };
  const files = [];
  const count = (value, key) => {
    if (value === undefined || !/^\+?\d+$/.test(value)) return;
    delete spec.lines;
    delete spec.bytes;
    delete spec.from;
    if (value.startsWith('+')) spec.from = Math.max(0, Number(value.slice(1)) - 1);
    else spec[key] = Number(value);
  };
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    let hit = /^(?:-n|--lines=?)(\+?\d+)?$/.exec(word);
    if (hit) { count(hit[1] ?? words[++i], 'lines'); continue; }
    hit = /^(?:-c|--bytes=?)(\d+)?$/.exec(word);
    if (hit) { count(hit[1] ?? words[++i], 'bytes'); continue; }
    hit = /^-(\d+)$/.exec(word);
    if (hit) { count(hit[1], 'lines'); continue; }
    if (word.startsWith('-')) continue;
    files.push(strip(word));
  }
  return files.map((file) => ({ file, ...spec }));
}

export function sedSlice(words) {
  if (!words.some((word, i) => i > 0 && SED_QUIET.test(word))) return [];
  let range = null;
  const files = [];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    if (/^(?:-e|--expression)$/.test(word)) { range = range || SED_RANGE.exec(strip(words[++i] || '')); continue; }
    if (word.startsWith('-')) continue;
    const hit = range ? null : SED_RANGE.exec(strip(word));
    if (hit) range = hit;
    else files.push(strip(word));
  }
  if (!range || files.length !== 1) return [];
  const from = Number(range[1]) - 1;
  const lines = range[2] === undefined ? 1 : range[2] === '$' ? undefined : Math.max(0, Number(range[2]) - from);
  return [{ file: files[0], from, lines }];
}

export function shellRead(segment) {
  if (INTERPRETER_READ.test(segment) || GIT_SHOW_FILE.test(segment)) return [{ unjudged: true }];
  const words = tokens(segment);
  const cmd = (words[0] || '').toLowerCase();
  if (WHOLE_FILE_CMD.test(cmd)) {
    const rest = words.slice(1);
    const files = rest.filter((word) => !word.startsWith('-'));
    const only = files.length === 1 && files.length === rest.length
      && !/[<>]/.test(segment) && REWRITABLE_READ.test(cmd);
    return files.map((raw) => ({ file: strip(raw), whole: true, only }));
  }
  if (SLICE_CMD.test(cmd)) return headTail(words);
  if (cmd === 'sed') return sedSlice(words);
  return [];
}

export function shellReads(command) {
  const out = [];
  let cursor = 0;
  for (const chunk of pipelines(command)) {
    const at = command.indexOf(chunk, cursor);
    if (at >= 0) cursor = at + chunk.length;
    if (chunk.includes('`') || chunk.includes('$(')) continue;
    const piped = PIPE.test(chunk);
    const first = chunk.split('|')[0].trim();
    for (const read of shellRead(first)) out.push({ ...read, piped, at, span: first.length, rewritable: !piped && at >= 0 && Boolean(read.only) });
  }
  return out;
}

export function shellWriteTargets(command) {
  const out = [];
  for (const segment of segments(command)) {
    for (const rx of SHELL_WRITE_TARGET) {
      const hit = rx.exec(segment);
      if (hit && hit[1]) out.push(hit[1]);
    }
  }
  return out;
}

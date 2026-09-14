const REDIRECT_AMP = (prev, next) => /[<>]/.test(prev || '') || next === '>';
const SHELL_PREFIX = /^(?:eval|command|exec|builtin|nohup|time|nice|stdbuf|xargs)\b(?:\s+-\S+)*\s+/i;
const SHELL_QUOTED = /^(['"])([\s\S]*)\1$/;
const REDIRECT = /^&?\d*[<>]{1,2}&?\d*$/;
const REDIRECTED = /^&?\d*[<>]{1,2}/;
const TO_FILE = /^(?:&|1?)>{1,2}(?![&])/;
const FD_DUP = /[<>]&/;

export const PIPE = /(?<!\|)\|(?!\|)/;

function split(command, breakers, subshell) {
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

export function unwrap(segment) {
  let out = String(segment).trim();
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(SHELL_PREFIX, '').trim().replace(SHELL_QUOTED, '$2').trim();
    if (next === out) break;
    out = next;
  }
  return out;
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
export const strip = (token) => token.replace(/^['"]|['"]$/g, '');

// Operands only: a segment that redirects its output to a file reads nothing into the thread.
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

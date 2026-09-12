const UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

export function parseSize(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*$/.exec(String(text));
  if (!match) return NaN;
  return Number(match[1]) * (UNITS[match[2]] ?? NaN);
}

export function parseDuration(text) {
  const match = /^\s*(\d+)\s*(ms|s|m|h)\s*$/i.exec(String(text));
  if (!match) return NaN;
  const scale = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  return Number(match[1]) * scale[match[2].toLowerCase()];
}

export function parseFlags(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = 'true'] = arg.slice(2).split('=');
    out[key] = value;
  }
  return out;
}

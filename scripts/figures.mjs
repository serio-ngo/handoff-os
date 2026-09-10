import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sessionLine } from '../plugins/handoff-os/scripts/ledger.mjs';
import { BIG_FILE_BYTES, MAX_PER_WAVE } from '../plugins/handoff-os/scripts/patterns.mjs';
import { REPO, inventory, readJson, writeBlock } from './generate.mjs';

export const INK = '#7d8590';
export const HUE = { without: '#d95926', with: '#2a78d6' };
export const REAL_REPO_TOKENS_PER_SUBAGENT = 50000;
export const OPUS_LIST_USD_PER_M_INPUT = 5;

export const FLOOD_OPEN = '<!-- handoff-flood -->';
export const FLOOD_CLOSE = '<!-- /handoff-flood -->';
export const FLOOD_DOC_OPEN = '<!-- flood-results -->';
export const FLOOD_DOC_CLOSE = '<!-- /flood-results -->';

const FONT = "system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const DOCS = (name) => path.join(REPO, 'docs', name);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n || 0).toLocaleString('en-US');
const compact = (n) => (n >= 1e6 ? `${String(Math.round((n / 1e6) * 10) / 10).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const usd = (x) => `$${Number(x || 0).toFixed(2)}`;
const secs = (ms) => `${Math.round(ms / 1000)}s`;
const width = (s, size) => s.length * size * 0.7;
const dollars = (x) => `$${Number.isInteger(x) ? x : x.toFixed(2)}`;

const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill ?? INK}" font-size="${o.size ?? 12}"`
  + `${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.family ? ` font-family="${o.family}"` : ''}`
  + `${o.cls ? ` class="${o.cls}"` : ''}>${esc(s)}</text>`;
const open = (w, h, label, family = FONT) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" font-family="${family}">`;
const file = (lines) => `${lines.join('\n')}\n`;

export const started = (row) => row.spawned ?? Math.max(0, row.spawnRequested - row.spawnBlocked);
const held = (r) => Math.max(0, r.requested - started(r.arms.with));
const perSubagent = (r) => Math.round(r.arms.without.subagentRaw?.mean || 0);
const waveTokens = (r) => r.requested * perSubagent(r);
const estimateTokens = (r) => r.requested * REAL_REPO_TOKENS_PER_SUBAGENT;
const estimateUsd = (r) => (estimateTokens(r) / 1e6) * OPUS_LIST_USD_PER_M_INPUT;

function glyphs(x0, y0, count, filled, fill) {
  const cols = 5; const w = 24; const h = 28; const gap = 10;
  return Array.from({ length: count }, (_, i) => {
    const x = x0 + (i % cols) * (w + gap);
    const y = y0 + Math.floor(i / cols) * (h + gap);
    return i < filled
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}"/>`
      : `<rect x="${x + 0.75}" y="${y + 0.75}" width="${w - 1.5}" height="${h - 1.5}" rx="7" fill="none" stroke="${INK}" stroke-opacity=".7" stroke-width="1.5"/>`;
  });
}

function stat(x, y, big, unit, note) {
  return [
    text(x, y, big, { size: 30, weight: 700 }),
    text(x + width(big, 30) + 16, y, unit, { size: 14 }),
    text(x, y + 18, note, { size: 11 }),
  ];
}

export const floodAlt = (r) => `${r.requested} subagents requested, model ${r.model}. One uncapped wave: ${started(r.arms.without)} started, `
  + `about ${compact(waveTokens(r))} raw tokens measured (${r.requested} × ${num(perSubagent(r))} per subagent); in a real repo ${compact(estimateTokens(r))}+ tokens, `
  + `about ${dollars(estimateUsd(r))} at Opus list price, an estimate. With the guard: ${started(r.arms.with)} started, ${held(r)} held for the next wave, measured.`;

export function floodSvg(r) {
  const W = 720; const H = 372; const L = 24; const R = 384;
  const measured = `measured · ${r.model}`;
  return file([
    open(W, H, floodAlt(r)),
    text(L, 30, 'One uncapped wave', { size: 15, weight: 600 }),
    text(R, 30, 'With the guard', { size: 15, weight: 600 }),
    text(L, 48, `${r.requested} subagents requested · one prompt`, { size: 11 }),
    text(R, 48, 'same prompt, same files', { size: 11 }),
    ...glyphs(L, 62, r.requested, started(r.arms.without), HUE.without),
    ...glyphs(R, 62, r.requested, started(r.arms.with), HUE.with),
    ...stat(L, 240, String(started(r.arms.without)), 'started at once', measured),
    ...stat(L, 290, `≈ ${compact(waveTokens(r))}`, 'raw tokens, one wave', `${r.requested} × ${num(perSubagent(r))} per subagent · measured`),
    ...stat(L, 340, `${compact(estimateTokens(r))}+`, 'raw tokens in a real repo', `${r.requested} × ${compact(REAL_REPO_TOKENS_PER_SUBAGENT)} · each subagent also reads your files · ≈ ${dollars(estimateUsd(r))} at Opus list price · estimate`),
    ...stat(R, 240, String(started(r.arms.with)), 'started at once', measured),
    ...stat(R, 290, String(held(r)), 'held for the next wave', 'measured · dispatched after these return'),
    '</svg>',
  ]);
}

const floodCaption = (r) => `**Measured** on \`${r.model}\`, one prompt: ${started(r.arms.without)} subagents started and ≈${compact(waveTokens(r))} raw tokens without the guard, `
  + `${started(r.arms.with)} started and ${held(r)} held with it; ${compact(estimateTokens(r))}+ tokens a wave in a real repo is an **estimate**.`;

const subRaw = (row) => (row.subagentRaw ? num(Math.round(row.subagentRaw.mean)) : 'n/a');
const floodRow = (label, row) => `| ${label} | ${row.spawnRequested} | ${started(row)} | ${row.spawnBlocked} | ${subRaw(row)} | ${num(row.billed)} | ${usd(row.cost)} | ${secs(row.durationMs)} | ${row.pass ? 'yes' : 'no'}${row.error ? ` (${row.error.split(':')[0]})` : ''} |`;

function floodDocBlock(r) {
  return [
    `Run ${r.generated} · model \`${r.model}\` · plugin build ${String(r.plugin.commit || 'unknown').slice(0, 7)} (${r.plugin.version}) · \`eval/flood-results.json\`${r.stopped ? ` · stopped: ${r.stopped}` : ''}`,
    '',
    '| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Cost | Wall time | Finished |',
    '|---|---|---|---|---|---|---|---|---|',
    floodRow('without', r.arms.without),
    floodRow('with', r.arms.with),
    '',
    `Figure estimate line: ${num(REAL_REPO_TOKENS_PER_SUBAGENT)} raw tokens per subagent in a real repo · Opus list price ${dollars(OPUS_LIST_USD_PER_M_INPUT)} per 1M input tokens.`,
  ];
}

export function writeFlood(r) {
  writeFileSync(DOCS('flood.svg'), floodSvg(r), 'utf8');
  return [
    'wrote docs/flood.svg',
    writeBlock(path.join(REPO, 'README.md'), FLOOD_OPEN, FLOOD_CLOSE, [
      `<img src="docs/flood.svg" width="720" alt="${esc(floodAlt(r))}">`,
      '',
      floodCaption(r),
    ]),
    writeBlock(path.join(REPO, 'docs', 'BENCHMARK.md'), FLOOD_DOC_OPEN, FLOOD_DOC_CLOSE, floodDocBlock(r)),
  ];
}

function abRange() {
  const dir = path.join(REPO, 'eval');
  const pcts = readdirSync(dir).filter((f) => /^ab-results.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')).aggregate?.billedWeighted?.pct)
    .filter((x) => typeof x === 'number').map(Math.round);
  return pcts.length ? `+${Math.min(...pcts)}–${Math.max(...pcts)}%` : 'n/a';
}

export function tiles(r, scores = readJson('eval', 'scores.json')) {
  return {
    stops: [
      [String(MAX_PER_WAVE), 'subagents per wave'],
      [`${Math.round(BIG_FILE_BYTES / 1024)} KB`, 'whole-file read cap'],
      ['git · rm', 'destructive calls'],
      ['"Done"', 'no verification run'],
    ],
    counts: [
      [String(held(r)), 'subagents held back'],
      [`${scores.keptPct}%`, 'read volume kept out'],
      ['Receipt', 'printed at Stop'],
    ],
    never: [
      ['0', 'model calls'],
      ['0', 'network calls'],
      [String(inventory().dependencies), 'dependencies'],
    ],
    cost: [
      [abRange(), 'tokens on ordinary tasks'],
      ['Cowork', 'hooks do not fire'],
      ['OpenCode', 'subagents bypass the guard'],
    ],
  };
}

export function tileRow(items) {
  const W = 720; const H = 92; const gap = 16;
  const w = (W - gap * (items.length - 1)) / items.length;
  const alt = items.map(([value, label]) => `${value} ${label}`).join('; ');
  return file([
    open(W, H, alt),
    ...items.flatMap(([value, label], i) => {
      const x = i * (w + gap);
      return [
        `<rect x="${x + 0.5}" y="0.5" width="${w - 1}" height="${H - 1}" rx="8" fill="none" stroke="${INK}" stroke-opacity=".35"/>`,
        `<rect x="${x + 16}" y="22" width="3" height="48" rx="1.5" fill="${HUE.with}"/>`,
        text(x + 30, 50, value, { size: 26, weight: 700 }),
        text(x + 30, 71, label, { size: 12 }),
      ];
    }),
    '</svg>',
  ]);
}

function fanOutReason(guard = readFileSync(path.join(REPO, 'plugins', 'handoff-os', 'scripts', 'guard.mjs'), 'utf8')) {
  const match = /`(FAN-OUT CAP: [^`]*?)\\n`/.exec(guard);
  if (!match) throw new Error('guard.mjs: FAN-OUT CAP text not found');
  return match[1].replace(/\$\{slot\}/g, MAX_PER_WAVE + 1).replace(/\$\{MAX_PER_WAVE\}/g, MAX_PER_WAVE);
}

function wrap(line, max) {
  const out = [];
  let current = '';
  for (const word of line.split(' ')) {
    if (current && `${current} ${word}`.length > max) { out.push(current); current = word; } else current = current ? `${current} ${word}` : word;
  }
  if (current) out.push(current);
  return out;
}

export function demoSvg(r) {
  const W = 860; const LOOP = 12;
  const modules = r.requested;
  const heldBack = modules - MAX_PER_WAVE;
  const receipt = sessionLine({ saved: { agents: MAX_PER_WAVE, blocked: heldBack, waves: heldBack, agentsCapped: heldBack } }, 0).split('\n');
  const prompt = `> src/ has ${modules} modules. Launch one subagent per module, all ${modules} in parallel.`;
  const reason = wrap(`⨯  ${fanOutReason()}`, 96);
  const rows = [
    { at: 0.2, text: '$ claude' },
    { at: 0.8, text: prompt, typed: true, weight: 600 },
    ...Array.from({ length: MAX_PER_WAVE }, (_, i) => ({ at: 2.6 + i * 0.4, text: `⏺  Agent · mod${String(i + 1).padStart(2, '0')}.js`, fill: HUE.with })),
    ...reason.map((line, i) => ({ at: 4.2, text: i ? `   ${line}` : line, fill: HUE.without, weight: 600, bar: i === 0 })),
    { at: 5.2, text: `⨯  mod${String(MAX_PER_WAVE + 2).padStart(2, '0')} … mod${modules} · ${heldBack - 1} more, same refusal`, fill: HUE.without },
    { at: 6.2, text: `⏺  ${MAX_PER_WAVE} returned · next wave dispatches the rest`, fill: HUE.with },
    ...receipt.map((line, i) => ({ at: 7.2 + i * 0.6, text: line, weight: i ? undefined : 600, box: i === 0 })),
  ];
  const y0 = 60; const step = 24;
  const H = y0 + rows.length * step + 30;
  const barLines = reason.length;
  const body = [];
  rows.forEach((row, i) => {
    const y = y0 + i * step;
    const cls = `row d${i}`;
    if (row.box) body.push(`<rect class="${cls}" x="14" y="${y - 17}" width="${W - 28}" height="${(rows.length - i) * step + 6}" rx="4" fill="${INK}" fill-opacity=".08" stroke="${INK}" stroke-opacity=".35"/>`);
    if (row.bar) body.push(`<rect class="${cls}" x="14" y="${y - 16}" width="${W - 28}" height="${barLines * step - 2}" rx="4" fill="${HUE.without}" fill-opacity=".1"/>`);
    if (row.typed) {
      body.push(`<clipPath id="t"><rect class="typed" x="22" y="${y - 14}" height="18"/></clipPath>`);
      body.push(`<g class="${cls}" clip-path="url(#t)">${text(22, y, row.text, { weight: row.weight, fill: row.fill })}</g>`);
    } else body.push(text(22, y, row.text, { weight: row.weight, fill: row.fill, cls }));
  });
  const last = rows.length - 1;
  const delays = rows.map((row, i) => `.d${i}{animation-delay:${Math.round(row.at * 10) / 10}s}`).join('');
  const label = `handoff-os on a ${modules}-subagent request: ${MAX_PER_WAVE} start, the FAN-OUT CAP holds ${heldBack} for the next wave, the Stop receipt prints ${receipt.join(' / ')}`;
  return file([
    open(W, H, label, MONO),
    '<style>',
    `text{font-size:13.5px;white-space:pre}`,
    `.row{opacity:0;animation:in ${LOOP}s infinite both}`,
    '@keyframes in{0%{opacity:0;transform:translateY(4px)}3%{opacity:1;transform:translateY(0)}94%{opacity:1}97%,100%{opacity:0}}',
    `@keyframes type{0%{width:0}100%{width:${Math.ceil(prompt.length * 8.2)}px}}`,
    '@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
    `.typed{animation:type 1.4s steps(${prompt.length}) .8s both}`,
    `.cursor{animation:blink 1s steps(1) infinite}`,
    delays,
    '</style>',
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${INK}" fill-opacity=".07" stroke="${INK}" stroke-opacity=".35"/>`,
    `<path d="M0 34 H${W}" stroke="${INK}" stroke-opacity=".35"/>`,
    text(22, 22, '— handoff-os session', { size: 11.5 }),
    ...body,
    `<g class="row d${last}"><rect class="cursor" x="${22 + Math.ceil(rows[last].text.length * 8.2) + 6}" y="${y0 + last * step - 11}" width="7" height="13" fill="${HUE.with}"/></g>`,
    '</svg>',
  ]);
}

export function writeFigures() {
  const r = readJson('eval', 'flood-results.json');
  const out = writeFlood(r);
  for (const [name, items] of Object.entries(tiles(r))) {
    writeFileSync(DOCS(`tiles-${name}.svg`), tileRow(items), 'utf8');
    out.push(`wrote docs/tiles-${name}.svg`);
  }
  writeFileSync(DOCS('demo.svg'), demoSvg(r), 'utf8');
  out.push('wrote docs/demo.svg');
  return out;
}

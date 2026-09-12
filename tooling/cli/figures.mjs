import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COUNTERS, bank, load, save, sessionLine } from '../../plugins/handoff-os/scripts/lib/ledger.mjs';
import { BIG_FILE_BYTES, MAX_PER_WAVE } from '../../plugins/handoff-os/scripts/lib/patterns.mjs';
import { PLUGIN, REPO, readJson, writeBlock } from './generate.mjs';

const INK = '#7d8590';
const HUE = { without: '#d95926', with: '#2a78d6' };
const DEMO_AGENTS = 100;
const DEMO_FILE_BYTES = 35 * 1024;
const DEMO_LINE_BYTES = 64;
const DEMO_HISTORY = 8;

const DEMO_OPEN = '<!-- handoff-demo -->';
const DEMO_CLOSE = '<!-- /handoff-demo -->';
const FLOOD_OPEN = '<!-- handoff-flood -->';
const FLOOD_CLOSE = '<!-- /handoff-flood -->';
const FLOOD_DOC_OPEN = '<!-- flood-results -->';
const FLOOD_DOC_CLOSE = '<!-- /flood-results -->';

const FONT = "system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const DOCS = (name) => path.join(REPO, 'docs', name);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n || 0).toLocaleString('en-US');
const secs = (ms) => `${Math.round(ms / 1000)}s`;
const width = (s, size) => s.length * size * 0.7;

const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill ?? INK}" font-size="${o.size ?? 12}"`
  + `${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.family ? ` font-family="${o.family}"` : ''}`
  + `${o.cls ? ` class="${o.cls}"` : ''}>${esc(s)}</text>`;
const open = (w, h, label, family = FONT) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" font-family="${family}">`;
const file = (lines) => `${lines.join('\n')}\n`;

export const started = (row) => row.spawned ?? Math.max(0, row.spawnRequested - row.spawnBlocked);
const held = (r) => Math.max(0, r.requested - started(r.arms.with));

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

const floodAlt = (r) => `${r.requested} subagents requested. Without the guard ${started(r.arms.without)} start at once; `
  + `with it ${started(r.arms.with)} start and the rest wait for the next wave.`;

function floodSvg(r) {
  const W = 720; const H = 282; const L = 24; const R = 384;
  const measured = `measured · ${r.model}`;
  return file([
    open(W, H, floodAlt(r)),
    text(L, 30, 'One uncapped wave', { size: 15, weight: 600 }),
    text(R, 30, 'With the guard', { size: 15, weight: 600 }),
    text(L, 48, `${r.requested} subagents requested · one prompt`, { size: 11 }),
    text(R, 48, 'same prompt, same files', { size: 11 }),
    ...glyphs(L, 62, r.requested, started(r.arms.without), HUE.without),
    ...glyphs(R, 62, r.requested, started(r.arms.with), HUE.with),
    ...stat(L, 244, String(started(r.arms.without)), 'started at once', measured),
    ...stat(R, 244, String(started(r.arms.with)), 'started at once', measured),
    '</svg>',
  ]);
}

const subRaw = (row) => (row.subagentRaw ? num(Math.round(row.subagentRaw.mean)) : 'n/a');
const floodRow = (label, row) => `| ${label} | ${row.spawnRequested} | ${started(row)} | ${row.spawnBlocked} | ${subRaw(row)} | ${num(row.billed)} | ${secs(row.durationMs)} | ${row.pass ? 'yes' : 'no'}${row.error ? ` (${row.error.split(':')[0]})` : ''} |`;

function floodDocBlock(r) {
  return [
    `Run ${r.generated} · model \`${r.model}\` · plugin build ${String(r.plugin.commit || 'unknown').slice(0, 7)} (${r.plugin.version}) · \`tooling/results/flood-results.json\`${r.stopped ? ` · stopped: ${r.stopped}` : ''}`,
    '',
    '| Arm | Subagent calls | Started | Refused by the guard | Raw tokens per subagent | Tokens billed | Wall time | Finished |',
    '|---|---|---|---|---|---|---|---|',
    floodRow('without', r.arms.without),
    floodRow('with', r.arms.with),
  ];
}

export function writeFlood(r) {
  writeFileSync(DOCS('flood.svg'), floodSvg(r), 'utf8');
  return [
    'wrote docs/flood.svg',
    writeBlock(path.join(REPO, 'README.md'), FLOOD_OPEN, FLOOD_CLOSE, [
      `<img src="docs/flood.svg" width="720" alt="${esc(floodAlt(r))}">`,
    ]),
    writeBlock(path.join(REPO, 'docs', 'BENCHMARK.md'), FLOOD_DOC_OPEN, FLOOD_DOC_CLOSE, floodDocBlock(r)),
  ];
}

function abRange() {
  const dir = path.join(REPO, 'tooling', 'results');
  const pcts = readdirSync(dir).filter((f) => /^ab-results.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')).aggregate?.billedWeighted?.pct)
    .filter((x) => typeof x === 'number').map(Math.round);
  return pcts.length ? `+${Math.min(...pcts)}–${Math.max(...pcts)}%` : 'n/a';
}

function tiles(r, scores = readJson('tooling', 'results', 'scores.json')) {
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
    proof: [
      [`${scores.recall}%`, 'of the corpus caught'],
      [`${scores.fpRate}%`, 'wrongly blocked'],
      [String(scores.cases), 'labelled cases, gated in CI'],
    ],
    cost: [
      [abRange(), 'tokens on ordinary tasks'],
      ['Cowork', 'hooks do not fire'],
      ['OpenCode', 'subagents bypass the guard'],
    ],
  };
}

function tileRow(items) {
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

function wrap(line, max) {
  const out = [];
  let current = '';
  for (const word of line.split(' ')) {
    if (current && `${current} ${word}`.length > max) { out.push(current); current = word; } else current = current ? `${current} ${word}` : word;
  }
  if (current) out.push(current);
  return out;
}

// every demo verdict is this guard's own stderr or rewrite reason, captured live
function probe() {
  const root = mkdtempSync(path.join(tmpdir(), 'handoff-figure-'));
  const big = path.join(root, 'src', 'big.js');
  mkdirSync(path.dirname(big), { recursive: true });
  writeFileSync(big, `${'x'.repeat(DEMO_LINE_BYTES - 1)}\n`.repeat(DEMO_FILE_BYTES / DEMO_LINE_BYTES), 'utf8');

  const fire = (tool_name, tool_input, { session = 'demo', agent_type } = {}) => {
    const run = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', 'guard.mjs')], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: session, cwd: root, tool_name, tool_input, agent_type }),
      encoding: 'utf8',
      env: { ...process.env, HANDOFF_OS_DIR: root, HANDOFF_GIT_WRITE: '0' },
    });
    if (run.status === 2) return { blocked: true, verdict: run.stderr.trim() };
    if (run.status !== 0) throw new Error(`guard exited ${run.status}: ${run.stderr}`);
    return { blocked: false, verdict: run.stdout ? JSON.parse(run.stdout).hookSpecificOutput.permissionDecisionReason : '' };
  };

  // all-time is earlier sessions of this root, banked the way the Stop hook banks them
  for (let i = 0; i < DEMO_HISTORY; i += 1) {
    const session = `turn${i}`;
    fire('Bash', { command: `cat -n ${big}` }, { session });
    fire('Read', { file_path: big }, { session, agent_type: 'handoff-os:scout' });
    fire('Agent', { model: 'opus', prompt: 'review the diff' }, { session });
    const state = load(root, session);
    bank(state);
    for (const key of COUNTERS) state.saved[key] = 0;
    save(root, session, state);
  }

  const steps = [
    ['Read src/big.js · 35 KB', 'Read', { file_path: big }],
    [`Workflow · ${DEMO_AGENTS} agents`, 'Workflow', { script: `// AGENTS: ${DEMO_AGENTS}\nawait parallel(mods.map((m) => () => agent(m)))` }],
    ['Agent model:opus · "review the diff"', 'Agent', { model: 'opus', prompt: 'review the diff' }],
    ['gmail send_message', 'mcp__gmail__send_message', { to: 'board@example.org' }],
    ['Agent model:sonnet · "review src/parse.js"', 'Agent', { model: 'sonnet', prompt: 'review src/parse.js' }],
  ].map(([label, tool, input]) => ({ label, ...fire(tool, input) }));

  const receipt = sessionLine(load(root, 'demo'), root, 'demo');
  rmSync(root, { recursive: true, force: true });
  return { steps, receipt };
}

function demoSvg({ steps, receipt } = probe()) {
  const LOOP = 16; const WRAP = 110; const CH = 8.2;
  const prompt = '> review whole app and send results to me.';
  const rows = [{ text: '$ claude' }, { text: prompt, typed: true, weight: 600 }];
  for (const step of steps) {
    rows.push({ text: `⏺  ${step.label}`, fill: step.blocked ? undefined : HUE.with, weight: 600 });
    if (!step.verdict) continue;
    const hue = step.blocked ? HUE.without : HUE.with;
    wrap(`${step.blocked ? '⨯' : '↻'}  ${step.verdict}`, WRAP)
      .forEach((line, i) => rows.push({ text: i ? `   ${line}` : line, fill: hue, bar: i === 0 }));
  }
  receipt.split('\n').forEach((line, i) => rows.push({ text: line, weight: i ? undefined : 600, box: i === 0 }));

  const y0 = 60; const step = 24;
  const H = y0 + rows.length * step + 30;
  const W = Math.max(720, Math.ceil(Math.max(...rows.map((r) => r.text.length)) * CH) + 52);
  const body = [];
  let at = 0.2;
  rows.forEach((row, i) => {
    row.at = at;
    at += row.typed ? 1.8 : row.bar === undefined ? 0.5 : 0.35;
    const y = y0 + i * step;
    const cls = `row d${i}`;
    if (row.box) body.push(`<rect class="${cls}" x="14" y="${y - 17}" width="${W - 28}" height="${(rows.length - i) * step + 6}" rx="4" fill="${INK}" fill-opacity=".08" stroke="${INK}" stroke-opacity=".35"/>`);
    if (row.bar) {
      const span = rows.slice(i).findIndex((next, n) => n > 0 && next.bar !== false);
      body.push(`<rect class="${cls}" x="14" y="${y - 16}" width="${W - 28}" height="${(span < 0 ? rows.length - i : span) * step - 2}" rx="4" fill="${row.fill}" fill-opacity=".1"/>`);
    }
    if (row.typed) {
      body.push(`<clipPath id="t"><rect class="typed" x="22" y="${y - 14}" height="18"/></clipPath>`);
      body.push(`<g class="${cls}" clip-path="url(#t)">${text(22, y, row.text, { weight: row.weight, fill: row.fill })}</g>`);
    } else body.push(text(22, y, row.text, { weight: row.weight, fill: row.fill, cls }));
  });
  const last = rows.length - 1;
  const delays = rows.map((row, i) => `.d${i}{animation-delay:${Math.round(row.at * 10) / 10}s}`).join('');
  const alt = `handoff-os session: ${steps.map((s) => (s.verdict ? `${s.label} → ${s.verdict}` : `${s.label}, allowed`)).join(' · ')} · ${receipt}`;
  return { width: W, alt, svg: file([
    open(W, H, alt, MONO),
    '<style>',
    'text{font-size:13.5px;white-space:pre}',
    `.row{opacity:0;animation:in ${LOOP}s infinite both}`,
    '@keyframes in{0%{opacity:0;transform:translateY(4px)}2%{opacity:1;transform:translateY(0)}95%{opacity:1}98%,100%{opacity:0}}',
    `@keyframes type{0%{width:0}100%{width:${Math.ceil(prompt.length * CH)}px}}`,
    '@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
    `.typed{animation:type 1.4s steps(${prompt.length}) .8s both}`,
    '.cursor{animation:blink 1s steps(1) infinite}',
    delays,
    '</style>',
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${INK}" fill-opacity=".07" stroke="${INK}" stroke-opacity=".35"/>`,
    `<path d="M0 34 H${W}" stroke="${INK}" stroke-opacity=".35"/>`,
    text(22, 22, '— handoff-os session', { size: 11.5 }),
    ...body,
    `<g class="row d${last}"><rect class="cursor" x="${22 + Math.ceil(rows[last].text.length * CH) + 6}" y="${y0 + last * step - 11}" width="7" height="13" fill="${HUE.with}"/></g>`,
    '</svg>',
  ]) };
}

export function writeFigures() {
  const r = readJson('tooling', 'results', 'flood-results.json');
  const out = writeFlood(r);
  for (const [name, items] of Object.entries(tiles(r))) {
    writeFileSync(DOCS(`tiles-${name}.svg`), tileRow(items), 'utf8');
    out.push(`wrote docs/tiles-${name}.svg`);
  }
  const demo = demoSvg();
  writeFileSync(DOCS('demo.svg'), demo.svg, 'utf8');
  out.push('wrote docs/demo.svg');
  out.push(writeBlock(path.join(REPO, 'README.md'), DEMO_OPEN, DEMO_CLOSE, [
    `<img src="docs/demo.svg" width="${demo.width}" alt="${esc(demo.alt)}">`,
  ]));
  return out;
}

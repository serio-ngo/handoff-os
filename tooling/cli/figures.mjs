import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { COUNTERS, bank, load, save } from '../../plugins/serio-focus/scripts/lib/ledger.mjs';
import { sessionLine } from '../../plugins/serio-focus/scripts/lib/stats.mjs';
import { BIG_FILE_BYTES, MAX_PER_WAVE } from '../../plugins/serio-focus/scripts/lib/limits.mjs';
import { num, secs } from './format.mjs';
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
  const file = path.join(REPO, 'tooling', 'results', 'ab-results.json');
  let pct;
  try { pct = JSON.parse(readFileSync(file, 'utf8')).aggregate?.billedWeighted?.pct; } catch { pct = null; }
  return typeof pct === 'number' ? `${pct > 0 ? '+' : ''}${Math.round(pct)}%` : 'n/a';
}

function fanoutWin() {
  try {
    const m = readJson('tooling', 'results', 'ab-results.json').micro['micro-b'];
    const pct = Math.round(((m.A.billedWeighted - m.B.billedWeighted) / m.B.billedWeighted) * 100);
    return [`${pct}%`, 'billed on subagent fan-out'];
  } catch { return ['n/a', 'billed on subagent fan-out']; }
}

function tiles(r, scores = readJson('tooling', 'results', 'scores.json')) {
  return {
    stops: [
      [String(MAX_PER_WAVE), 'subagents per wave'],
      [`${Math.round(BIG_FILE_BYTES / 1024)} KB`, 'whole-file read cap'],
      ['commit · push', 'git writes need a human'],
      ['one line', 'session receipt'],
    ],
    wins: [
      [String(held(r)), 'subagents held back'],
      [`${scores.keptPct}%`, 'read volume kept out'],
      fanoutWin(),
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

// every demo verdict is this guard's own deny reason or rewrite reason, captured live —
// except the last row, which quotes the focus output style verbatim
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
    let decision = '';
    let reason = '';
    try {
      const out = JSON.parse(run.stdout || '').hookSpecificOutput || {};
      decision = out.permissionDecision || '';
      reason = out.permissionDecisionReason || '';
    } catch { /* a plain allow carries no stdout */ }
    if (run.status === 2 || decision === 'deny' || decision === 'ask') return { blocked: true, verdict: reason || run.stderr.trim() };
    if (run.status !== 0) throw new Error(`guard exited ${run.status}: ${run.stderr}`);
    return { blocked: false, verdict: reason };
  };

  // all-time is earlier sessions of this root, banked the way the Stop hook banks them
  for (let i = 0; i < DEMO_HISTORY; i += 1) {
    const session = `turn${i}`;
    fire('Bash', { command: `cat -n ${big}` }, { session });
    fire('Read', { file_path: big }, { session, agent_type: 'serio-focus:scout' });
    fire('Agent', { model: 'haiku', prompt: 'summarise the diff' }, { session });
    const state = load(root, session);
    bank(state);
    for (const key of COUNTERS) state.saved[key] = 0;
    save(root, session, state);
  }

  const steps = [
    ['Read src/big.js · 35 KB', 'Read', { file_path: big }],
    [`Workflow · ${DEMO_AGENTS} agents`, 'Workflow', { script: `// AGENTS: ${DEMO_AGENTS}\nawait parallel(mods.map((m) => () => agent(m)))` }],
    ['Bash · `git commit -m "wip"`', 'Bash', { command: 'git commit -m "wip"' }],
    ['Bash · `git push origin main`', 'Bash', { command: 'git push origin main' }],
    ['Bash · `rm -rf docs`', 'Bash', { command: 'rm -rf docs' }],
  ].map(([label, tool, input]) => ({ label, ...fire(tool, input) }));
  steps.push({ label: 'Answer · focus style', blocked: false, verdict: 'Action first · Done ≤5 · one Next + command · Step N of M' });

  const receipt = sessionLine(load(root, 'demo'), root, 'demo');
  rmSync(root, { recursive: true, force: true });
  return { steps, receipt };
}

function demoSvg({ steps, receipt } = probe()) {
  const WRAP = 110; const CH = 8.2;
  const FADE_IN = 0.3; const HOLD = 4; const FADE_OUT = 1; const BLANK = 0.5;
  const TYPE_AT = 0.8; const TYPE_LEN = 1.4;
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
  // one shared loop: every row fades in on its cue, all rows fade out together,
  // the screen rests blank, then the loop restarts — a delay alone would not
  // resync, since CSS animation-delay applies only before the first iteration
  const loop = Math.ceil(at + HOLD + FADE_OUT + BLANK);
  const pct = (s) => Math.round((Math.min(Math.max(s, 0), loop) / loop) * 1000) / 10;
  const keys = rows.map((row, i) => {
    const vis = Math.min(row.at + FADE_IN, loop - FADE_OUT);
    return `@keyframes k${i}{0%{opacity:0;transform:translateY(4px)}${pct(row.at)}%{opacity:0;transform:translateY(4px)}`
      + `${pct(vis)}%{opacity:1;transform:translateY(0)}${pct(loop - FADE_OUT)}%{opacity:1;transform:translateY(0)}`
      + `${pct(loop - BLANK)}%{opacity:0}100%{opacity:0}}`;
  }).join('');
  const cues = rows.map((row, i) => `.d${i}{animation:k${i} ${loop}s infinite both}`).join('');
  const typeW = Math.ceil(prompt.length * CH);
  const alt = `serio-focus session: ${steps.map((s) => (s.verdict ? `${s.label} → ${s.verdict}` : `${s.label}, allowed`)).join(' · ')} · ${receipt}`;
  return { width: W, alt, svg: file([
    open(W, H, alt, MONO),
    '<style>',
    'text{font-size:13.5px;white-space:pre}',
    '.row{opacity:0}',
    keys,
    `@keyframes type{0%{width:0}${pct(TYPE_AT)}%{width:0}${pct(TYPE_AT + TYPE_LEN)}%{width:${typeW}px}100%{width:${typeW}px}}`,
    '@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
    `.typed{animation:type ${loop}s steps(${prompt.length}) infinite}`,
    '.cursor{animation:blink 1s steps(1) infinite}',
    cues,
    '</style>',
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${INK}" fill-opacity=".07" stroke="${INK}" stroke-opacity=".35"/>`,
    `<path d="M0 34 H${W}" stroke="${INK}" stroke-opacity=".35"/>`,
    text(22, 22, '— serio-focus session', { size: 11.5 }),
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

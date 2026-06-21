// End-to-end smoke test: mock-app → record (Chromium) → encode (ffmpeg).
// Gated — it launches real binaries, so it only runs with RUN_SMOKE=1 and skips cleanly
// when Chromium or ffmpeg-static aren't available. Run with: npm run test:smoke (RUN_SMOKE=1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const PORT = 4317;

// Skip unless explicitly enabled AND both binaries are present.
function whySkip() {
  if (!process.env.RUN_SMOKE) return 'set RUN_SMOKE=1 to run the end-to-end smoke test';
  if (!ffmpegPath || !existsSync(ffmpegPath)) return 'ffmpeg-static binary not found';
  try { if (!existsSync(chromium.executablePath())) return 'Chromium not installed (npx playwright install chromium)'; }
  catch { return 'Chromium not installed (npx playwright install chromium)'; }
  return null;
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('mock server did not come up at ' + url);
}

test('record + encode against the mock app', { timeout: 180000 }, async (t) => {
  const skip = whySkip();
  if (skip) { t.skip(skip); return; }

  const out = mkdtempSync(join(tmpdir(), 'demorec-smoke-'));
  const server = spawn(process.execPath, [join(REPO, 'examples', 'mock-server.mjs')],
    { stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });

  t.after(() => {
    try { server.kill(); } catch { /* ignore */ }
    try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  await waitForServer(`http://127.0.0.1:${PORT}/`);

  // Tiny spec: caption a beat, hold, clear — enough to drive a webm + caption sidecar + srt.
  const srt = join(out, 'subs.srt');
  const mp4 = join(out, 'demo.mp4');
  const specPath = join(out, 'smoke.yml');
  writeFileSync(specPath, [
    `url: http://127.0.0.1:${PORT}/`,
    'width: 640',
    'height: 400',
    'headless: true',
    `out: ${JSON.stringify(out)}`,
    'steps:',
    '  - caption: Hola mundo',
    '  - hold: 0.6',
    "  - caption: ''",
    'encode:',
    `  srt: ${JSON.stringify(srt)}`,
    `  mp4: ${JSON.stringify(mp4)}`,
  ].join('\n'), 'utf8');

  // Import lazily so a missing browser can't break collection of the other test files.
  const { runScript } = await import('../../src/run.js');
  await runScript(specPath, {});

  // A raw recording landed in out/raw/ with its caption sidecar.
  const rawDir = join(out, 'raw');
  const webms = readdirSync(rawDir).filter((f) => f.endsWith('.webm'));
  assert.ok(webms.length >= 1, 'expected a .webm in out/raw/');
  const captionsSidecar = join(rawDir, `${webms[0]}.captions.json`);
  assert.ok(existsSync(captionsSidecar), 'expected a captions sidecar');
  const caps = JSON.parse(readFileSync(captionsSidecar, 'utf8')).captions;
  assert.equal(caps.length, 2); // 'Hola mundo' + the empty clear

  // Encode outputs exist and are non-empty.
  assert.ok(statSync(mp4).size > 0, 'mp4 should be non-empty');
  const srtText = readFileSync(srt, 'utf8');
  assert.match(srtText, /Hola mundo/);
});

test('effects: events sidecar + intro/outro bookends + reframe', { timeout: 180000 }, async (t) => {
  const skip = whySkip();
  if (skip) { t.skip(skip); return; }

  const out = mkdtempSync(join(tmpdir(), 'demorec-fx-'));
  const server = spawn(process.execPath, [join(REPO, 'examples', 'mock-server.mjs')],
    { stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  t.after(() => {
    try { server.kill(); } catch { /* ignore */ }
    try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  await waitForServer(`http://127.0.0.1:${PORT}/`);

  const demoMp4 = join(out, 'demo.mp4');
  const finalMp4 = join(out, 'final.mp4');
  const specPath = join(out, 'fx.yml');
  // Effect steps emit events; intro+outro (html) bookend; reframe makes a 1:1 cut. No TTS/music so
  // the smoke stays offline (mp4 has no audio → bookend concat is video-only, which is fine).
  writeFileSync(specPath, [
    `url: http://127.0.0.1:${PORT}/`,
    'width: 640',
    'height: 400',
    'headless: true',
    `out: ${JSON.stringify(out)}`,
    'steps:',
    "  - keycap: 'cmd+k'",
    "  - spotlight: 'demo-chat'",
    '  - hold: 0.3',
    '  - spotlightOff: true',
    '  - move: { sel: \'demo-chat\', ms: 200, trail: true }',
    'encode:',
    `  mp4: ${JSON.stringify(demoMp4)}`,
    '  intro: { engine: html, title: Hola, duration: 0.8 }',
    `  outro: { engine: html, title: Gracias, cta: Pruébalo, duration: 0.8, result: ${JSON.stringify(finalMp4)} }`,
    "  reframe: ['1:1']",
  ].join('\n'), 'utf8');

  const { runScript } = await import('../../src/run.js');
  await runScript(specPath, {});

  // The events sidecar landed next to the demo webm, with the kinds the steps emitted.
  const rawDir = join(out, 'raw');
  const webm = readdirSync(rawDir).filter((f) => f.endsWith('.webm') && existsSync(join(rawDir, `${f}.events.json`)))[0];
  assert.ok(webm, 'expected a webm with an .events.json sidecar');
  const events = JSON.parse(readFileSync(join(rawDir, `${webm}.events.json`), 'utf8')).events;
  const kinds = new Set(events.map((e) => e.kind));
  assert.ok(kinds.has('keycap') && kinds.has('spotlight') && kinds.has('move'), 'expected effect events');

  // The bookended final (intro+demo+outro) and the 1:1 reframe both exist and are non-empty.
  assert.ok(statSync(finalMp4).size > 0, 'composed final mp4 should be non-empty');
  const square = join(out, 'final-1x1.mp4');
  assert.ok(existsSync(square) && statSync(square).size > 0, 'expected a 1:1 reframe output');
});

test('phase 2: annotate/chapter events + lower-thirds + watermark + match-cut', { timeout: 180000 }, async (t) => {
  const skip = whySkip();
  if (skip) { t.skip(skip); return; }

  const out = mkdtempSync(join(tmpdir(), 'demorec-p2-'));
  const server = spawn(process.execPath, [join(REPO, 'examples', 'mock-server.mjs')],
    { stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  t.after(() => {
    try { server.kill(); } catch { /* ignore */ }
    try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  await waitForServer(`http://127.0.0.1:${PORT}/`);

  const finalMp4 = join(out, 'p2-final.mp4');
  const specPath = join(out, 'p2.yml');
  // chapter + annotate emit events; lower-thirds + watermark burn over the composed final; the intro
  // match-cut joins intro→demo with an xfade (so the final exists and is continuous). No TTS/music.
  writeFileSync(specPath, [
    `url: http://127.0.0.1:${PORT}/`,
    'width: 640',
    'height: 400',
    'headless: true',
    `out: ${JSON.stringify(out)}`,
    'steps:',
    "  - chapter: '1. Intro'",
    "  - annotate: { sel: 'demo-chat', shape: box, text: aquí }",
    '  - hold: 0.3',
    '  - annotateOff: true',
    'encode:',
    `  mp4: ${JSON.stringify(join(out, 'p2.mp4'))}`,
    '  lowerThirds: { hold: 2.0 }',
    '  watermark: { text: Acme }',
    `  intro: { engine: html, title: Hi, duration: 0.8, matchCut: true, result: ${JSON.stringify(finalMp4)} }`,
  ].join('\n'), 'utf8');

  const { runScript } = await import('../../src/run.js');
  await runScript(specPath, {});

  const rawDir = join(out, 'raw');
  const webm = readdirSync(rawDir).filter((f) => f.endsWith('.webm') && existsSync(join(rawDir, `${f}.events.json`)))[0];
  assert.ok(webm, 'expected a webm with an .events.json sidecar');
  const kinds = new Set(JSON.parse(readFileSync(join(rawDir, `${webm}.events.json`), 'utf8')).events.map((e) => e.kind));
  assert.ok(kinds.has('chapter') && kinds.has('annotate'), 'expected chapter + annotate events');
  assert.ok(statSync(finalMp4).size > 0, 'match-cut composed final should be non-empty');
});

test('phase 3: speed ramps + transitions + progress bar + grade + smart-crop 9:16', { timeout: 180000 }, async (t) => {
  const skip = whySkip();
  if (skip) { t.skip(skip); return; }

  const out = mkdtempSync(join(tmpdir(), 'demorec-p3-'));
  const server = spawn(process.execPath, [join(REPO, 'examples', 'mock-server.mjs')],
    { stdio: 'ignore', env: { ...process.env, PORT: String(PORT) } });
  t.after(() => {
    try { server.kill(); } catch { /* ignore */ }
    try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  await waitForServer(`http://127.0.0.1:${PORT}/`);

  const mp4 = join(out, 'p3.mp4');
  const ramps = join(out, 'p3-ramps.mp4');
  const specPath = join(out, 'p3.yml');
  // Events (chapter/zoom/click) drive ramps, transitions and the smart-crop focus. No TTS/music.
  writeFileSync(specPath, [
    `url: http://127.0.0.1:${PORT}/`,
    'width: 640',
    'height: 400',
    'headless: true',
    `out: ${JSON.stringify(out)}`,
    'steps:',
    "  - chapter: '1. Uno'",
    '  - zoomFit: { sel: demo-chat }',
    '  - hold: 0.4',
    '  - resetZoom: true',
    'encode:',
    `  mp4: ${JSON.stringify(mp4)}`,
    `  rampsMp4: ${JSON.stringify(ramps)}`,
    '  ramps: { base: 1.5, slowmo: 0.5, at: [zoom], window: 0.4 }',
    '  transitions: { at: [chapter], transition: fade, duration: 0.3 }',
    '  progressBar: { height: 5 }',
    '  grade: { vignette: true }',
    "  reframe: { ratios: ['9:16'], follow: true }",
  ].join('\n'), 'utf8');

  const { runScript } = await import('../../src/run.js');
  await runScript(specPath, {});

  // The events sidecar carries the rect on zoom (for smart-crop focus).
  const rawDir = join(out, 'raw');
  const webm = readdirSync(rawDir).filter((f) => f.endsWith('.webm') && existsSync(join(rawDir, `${f}.events.json`)))[0];
  const events = JSON.parse(readFileSync(join(rawDir, `${webm}.events.json`), 'utf8')).events;
  const zoom = events.find((e) => e.kind === 'zoom');
  assert.ok(zoom && zoom.rect && typeof zoom.rect.cx === 'number', 'zoom event should carry a rect');

  // Outputs exist; the ramps re-times (different duration) and the 9:16 is portrait.
  const { probeDuration, probeSize } = await import('../../src/encode.js');
  assert.ok(statSync(mp4).size > 0 && statSync(ramps).size > 0, 'mp4 + ramps should be non-empty');
  const square = join(out, 'p3-9x16.mp4');
  assert.ok(existsSync(square), 'expected a 9:16 reframe output');
  const sz = await probeSize(square);
  assert.ok(sz.h > sz.w, 'the 9:16 output should be portrait');
  const [dMain, dRamps] = await Promise.all([probeDuration(mp4), probeDuration(ramps)]);
  assert.ok(Math.abs(dMain - dRamps) > 0.05, 'ramps should change the duration');
});

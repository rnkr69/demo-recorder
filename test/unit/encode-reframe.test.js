// aspectToCanvas — the pure padding-canvas math behind reframe() (no ffmpeg).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aspectToCanvas } from '../../src/encode.js';

test('square target keeps the wider source width and squares it', () => {
  // 1280x800 (ar 1.6) → 1:1: pad top/bottom, keep width.
  assert.deepEqual(aspectToCanvas(1280, 800, '1:1'), { w: 1280, h: 1280 });
});

test('portrait 9:16 from landscape keeps width, grows height', () => {
  const c = aspectToCanvas(1280, 800, '9:16');
  assert.equal(c.w, 1280);
  assert.equal(c.h, 2276); // 1280/0.5625 = 2275.5 → even-rounded up
  assert.ok(c.w / c.h - 9 / 16 < 1e-3);
});

test('landscape 16:9 from portrait keeps height, grows width', () => {
  const c = aspectToCanvas(800, 1280, '16:9');
  assert.equal(c.h, 1280);
  assert.equal(c.w, 2276);
});

test('dimensions are always even (yuv420p-safe)', () => {
  const c = aspectToCanvas(1281, 801, '1:1');
  assert.equal(c.w % 2, 0);
  assert.equal(c.h % 2, 0);
});

test('accepts : x and / as aspect separators', () => {
  assert.deepEqual(aspectToCanvas(1000, 1000, '4:5'), aspectToCanvas(1000, 1000, '4x5'));
  assert.deepEqual(aspectToCanvas(1000, 1000, '4:5'), aspectToCanvas(1000, 1000, '4/5'));
});

test('a malformed aspect throws', () => {
  assert.throws(() => aspectToCanvas(1280, 800, 'nope'), /bad aspect/);
  assert.throws(() => aspectToCanvas(1280, 800, '16:0'), /bad aspect/);
});

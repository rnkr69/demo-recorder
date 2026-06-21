// buildLowerThirds (chapter spans → animated .ass) and xfadeOffsets (match-cut join math). Pure,
// no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLowerThirds, xfadeOffsets } from '../../src/encode.js';

test('xfadeOffsets accounts for the crossfade overlap at each boundary', () => {
  // clips 3s + 5s + 4s, 0.5s crossfade → offsets 2.5 and 7.0 on the composed timeline.
  assert.deepEqual(xfadeOffsets([3, 5, 4], 0.5), [2.5, 7.0]);
});

test('xfadeOffsets for a single boundary', () => {
  assert.deepEqual(xfadeOffsets([2.8, 12], 0.5), [2.3]);
});

test('buildLowerThirds emits one animated dialogue per chapter, truncated to hold', () => {
  const ass = buildLowerThirds([{ t: 1, text: 'Uno' }, { t: 5, text: 'Dos' }], 10);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(dialogues.length, 2);
  assert.match(ass, /Uno/);
  assert.match(ass, /Dos/);
  assert.match(dialogues[0], /\\fad\(/);
  assert.match(dialogues[0], /\\move\(/);
  // default hold 3s → first chapter (1s) ends at 4s, not at the next chapter (5s).
  assert.match(dialogues[0], /0:00:04\.00/);
});

test('buildLowerThirds with hold:0 spans until the next chapter (or duration)', () => {
  const ass = buildLowerThirds([{ t: 1, text: 'A' }, { t: 8, text: 'B' }], 12, {}, { hold: 0 });
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.match(dialogues[0], /0:00:08\.00/); // A runs until B
  assert.match(dialogues[1], /0:00:12\.00/); // B runs until the end
});

test('buildLowerThirds: an empty chapter clears the previous one', () => {
  const ass = buildLowerThirds([{ t: 1, text: 'Solo' }, { t: 3, text: '' }], 12, {}, { hold: 0 });
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(dialogues.length, 1);
  assert.match(dialogues[0], /0:00:03\.00/); // cleared at t=3
});

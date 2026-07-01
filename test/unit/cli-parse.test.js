// bin/demo-recorder.js flag parser + help text (doc-rot guard) + CLI entry guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { writeFileSync, symlinkSync } from 'node:fs';
import { withTempDir } from '../helpers/tmp.js';
import { __test } from '../../bin/demo-recorder.js';

const { parse, HELP, isEntry } = __test;

const BIN = fileURLToPath(new URL('../../bin/demo-recorder.js', import.meta.url));
const BIN_URL = pathToFileURL(BIN).href;

test('--no-encode flag and positionals in order', () => {
  const { positionals, flags } = parse(['run', 'x.yml', '--no-encode']);
  assert.deepEqual(positionals, ['run', 'x.yml']);
  assert.deepEqual(flags, { noEncode: true });
});

test('--from / --to as separate tokens, coerced to numbers', () => {
  assert.deepEqual(parse(['--from', '2', '--to', '4']).flags, { from: 2, to: 4 });
});

test('--from= / --to= inline forms', () => {
  assert.deepEqual(parse(['--from=3', '--to=5']).flags, { from: 3, to: 5 });
});

test('--all and --keep (both token and inline)', () => {
  assert.deepEqual(parse(['--all', '--keep', '5']).flags, { all: true, keep: 5 });
  assert.deepEqual(parse(['--keep=2']).flags, { keep: 2 });
});

test('flags interleaved with positionals keep positional order', () => {
  const { positionals, flags } = parse(['a', '--from', '1', 'b']);
  assert.deepEqual(positionals, ['a', 'b']);
  assert.equal(flags.from, 1);
});

test('HELP documents every command (doc-rot guard)', () => {
  for (const cmd of ['run', 'record', 'encode', 'probe', 'frames', 'clean', 'tracks', 'login', 'mock', 'doctor']) {
    assert.ok(HELP.includes(cmd), `HELP should mention "${cmd}"`);
  }
});

test('isEntry: invocación directa (argv[1] === módulo) → true', () => {
  assert.ok(isEntry(BIN, BIN_URL));
});

test('isEntry: importado por otro proceso / sin argv[1] → false', () => {
  assert.ok(!isEntry(join(dirname(BIN), 'otro-proceso.js'), BIN_URL));
  assert.ok(!isEntry(undefined, BIN_URL));
});

// Regresión: bajo `npm link` argv[1] llega como el path del symlink y import.meta.url es el path
// real; sin canonicalizar por realpath el guard daría false y el CLI global saldría mudo.
test('isEntry: argv[1] symlinkeado (npm link) resuelve al módulo real → true', () => {
  withTempDir((dir) => {
    const real = join(dir, 'real-entry.js');
    writeFileSync(real, '// entry');
    const link = join(dir, 'linked-entry.js');
    try { symlinkSync(real, link); }
    catch { return; } // el SO no permite symlinks sin privilegios (Windows sin dev-mode) → se omite
    assert.ok(isEntry(link, pathToFileURL(real).href));
  });
});

// Black-box guard for the ACTUAL installed command. The other unit tests `import` the modules
// directly, so they NEVER exercise the bin's entry guard — a broken guard would ship green. This
// spawns the real bin as a subprocess, INCLUDING through a symlink that replicates `npm link`
// (argv[1] = symlink path, import.meta.url = realpath), and asserts it actually produces output.
// This is the test that would have caught the week-long "demo-recorder prints nothing" regression.
// It needs only node (no ffmpeg/Chromium), so it runs on every `npm test` — that's the whole point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { symlinkSync } from 'node:fs';
import { withTempDir } from '../helpers/tmp.js';

const BIN = fileURLToPath(new URL('../../bin/demo-recorder.js', import.meta.url));

function runCli(entry, args) {
  const r = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

test('bin directo: `help` imprime la ayuda y sale 0', () => {
  const r = runCli(BIN, ['help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /demo-recorder <comando>/);
});

test('bin directo: invocación sin argumentos también imprime (no sale mudo)', () => {
  const r = runCli(BIN, []);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.trim().length > 0, 'la invocación sin args no debe salir muda');
});

// La regresión de verdad: `npm link` ejecuta el bin A TRAVÉS de un symlink, así que argv[1] es el
// path del enlace mientras import.meta.url es el path real. Un guard con comparación de strings
// falla aquí y no imprime nada. Este test lo reproduce; falla contra el bug, pasa con el fix.
test('bin vía symlink (replica npm link): sigue imprimiendo, no sale mudo', () => {
  withTempDir((dir) => {
    const link = join(dir, 'demo-recorder-link.js');
    try { symlinkSync(BIN, link); }
    catch { return; } // SO sin privilegios de symlink → se omite (el caso directo cubre lo esencial)
    const r = runCli(link, ['help']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /demo-recorder <comando>/, 'el CLI global (symlink) debe imprimir, no salir mudo');
  });
});

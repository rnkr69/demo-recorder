// Platform sanity checks for the bundled native binaries. The #1 cross-platform trap is a
// node_modules installed under a DIFFERENT OS than the one running the CLI: this repo is often kept
// on a shared drive (e.g. a Windows path mounted in WSL), so a `npm install` done on Windows leaves
// Windows binaries (ffmpeg.exe, win32 Chromium) that can't run on Linux — and vice versa. The fix is
// always the same: reinstall in the current environment.
import { existsSync } from 'node:fs';
import { platform, arch } from 'node:process';
import ffmpegPath from 'ffmpeg-static';

// ffmpeg-static resolves its binary path from the CURRENT platform/arch, so if that file is missing
// the package was installed for another OS. This is the cheapest, most reliable signal that the whole
// node_modules is cross-OS. Returns an array of human-readable warnings (empty = all good).
export function checkBinaries() {
  const warns = [];
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    warns.push(
      `ffmpeg no está instalado para esta plataforma (${platform}/${arch}).\n` +
      '   Suele ocurrir cuando node_modules se instaló en otro SO (p. ej. Windows) y la\n' +
      '   carpeta del proyecto es compartida (un path de Windows montado en WSL, etc.).\n' +
      '   Reinstala en ESTE entorno:\n' +
      '       rm -rf node_modules && npm install\n' +
      '       npx playwright install chromium   # si Chromium también es de otro SO');
  }
  return warns;
}

// Print any warnings to stderr (non-fatal — the command proceeds and fails naturally if truly
// broken, but the user gets the fix up front instead of a cryptic ffmpeg/chromium error).
export function warnIfMisinstalled() {
  for (const w of checkBinaries()) console.error(`⚠ demo-recorder: ${w}`);
}

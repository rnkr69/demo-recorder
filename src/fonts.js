// Fonts bundled WITH the engine (fonts/), so subtitle/intro/contact-sheet rendering is the same on
// Windows, macOS and Linux — instead of depending on OS-installed fonts (different everywhere).
// Mirrors the bundled-music approach in tracks.js. A `font` value can be: an existing path
// (relative to the current project or absolute), a bundled filename, or a short alias/substring.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url))); // install root (src/..)
export const fontsDir = () => join(ENGINE, 'fonts');

// The default UI family bundled with the engine (matches the internal name-table family name,
// so it resolves through libass' `fontsdir` and ffmpeg `fontfile`).
export const defaultFontName = () => 'Inter';
export const regularFont = () => join(fontsDir(), 'Inter-Regular.ttf');
export const boldFont = () => join(fontsDir(), 'Inter-Bold.ttf');

const isFont = (f) => /\.(ttf|otf|ttc)$/i.test(f);
const slug = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Bundled fonts as { file, slug } (e.g. { file: 'Inter-Bold.ttf', slug: 'inter-bold' }).
export function bundledFonts() {
  try { return readdirSync(fontsDir()).filter(isFont).map((file) => ({ file, slug: slug(file) })); }
  catch { return []; }
}

// Resolve a font value to an absolute .ttf path. Accepts a real path (current project or absolute),
// a bundled filename, or an alias/substring; falls back to the bundled regular Inter if empty or
// unmatched (fonts are best-effort — a render must never hard-fail on a font lookup).
export function resolveFont(font, fallback = regularFont()) {
  if (!font) return fallback;
  const direct = resolve(font);
  if (existsSync(direct)) return direct;                       // a real path in the current project
  const bundled = bundledFonts();
  const want = slug(font);
  const hit = bundled.find((b) => b.file === font)            // exact bundled filename
    || bundled.find((b) => b.slug === want)                   // exact alias
    || bundled.find((b) => b.slug.includes(want) || want.includes(b.slug)); // fuzzy/substring
  return hit ? join(fontsDir(), hit.file) : fallback;
}

/**
 * Detect if a stack trace is from a bundled/minified build (e.g. /js/vendor, chunk-*.js)
 * so we can show a clear message: "Upload source maps to Sentry to see original source."
 */

/** Paths that typically indicate bundled output, not original source. */
const BUNDLED_PATTERNS = [
  /\/js\/vendor/i,
  /\/js\/[^/]+\.(js|mjs|cjs)$/i,
  /\/vendor[\/.]/i,
  /\/static\//i,
  /\/assets\//i,
  /\.chunk\./i,
  /chunk-[a-f0-9]+\./i,
  /\.bundle\./i,
  /\.min\.js$/i,
  /^[a-f0-9]{8,}\.js$/i,
  /^[0-9]+\.[a-f0-9]+\.js$/i,
  /\/build\//i,
  /\/dist\//i,
  /\/out\//i,
];

/** Original-source hints (if present, we consider the frame not bundled). */
const SOURCE_HINTS = [
  /\.(tsx?|jsx?|vue|svelte|mjs)(\?|$)/i,
  /\/src\//i,
  /\/app\//i,
  /\/lib\//i,
  /\/components\//i,
  /\/pages\//i,
  /\/server\//i,
  /\/routes\./i,
];

export function isBundledStackFrame(file: string): boolean {
  const path = String(file).trim();
  if (!path) return false;
  if (SOURCE_HINTS.some((re) => re.test(path))) return false;
  return BUNDLED_PATTERNS.some((re) => re.test(path));
}

export function isStacktraceBundled(
  frames: Array<{ file?: string }>
): boolean {
  if (!Array.isArray(frames) || frames.length === 0) return false;
  const withFile = frames.filter((f) => f?.file && String(f.file).trim());
  if (withFile.length === 0) return false;
  return withFile.every((f) => isBundledStackFrame(String(f.file)));
}

/**
 * Detect if a stack trace is from a bundled/minified build (e.g. /js/vendor, chunk-*.js)
 * so we can show a clear message: "Upload source maps to Sentry to see original source."
 */

/** True if the frame file path is a Node.js built-in (e.g. node:internal, node:events). */
export function isNodeInternalPath(file: string | undefined): boolean {
  const path = file != null ? String(file).trim() : "";
  return path.startsWith("node:");
}

/** Patterns that are clearly not source file paths. */
const NOT_SOURCE_PATTERNS = [
  /^\d{1,2}\/\w{3}\/\d{4}/, // nginx date: 09/Mar/2026
  /^\d{4}-\d{2}-\d{2}/, // ISO date: 2026-03-09
  /^log$/i, // synthetic agent "log" frame
  /^test$/i, // synthetic agent "test" frame
  /^<\w+>$/, // <anonymous>, <eval>, etc.
  /^\[eval\]/, // Node eval frames
];

/** True if the frame should be shown in app stack traces (excludes noise, node_modules, Node internals). */
export function isAppStackFrame(file: string | undefined): boolean {
  const path = file != null ? String(file).trim() : "";
  if (!path) return false;
  if (path.includes("node_modules")) return false;
  if (isNodeInternalPath(path)) return false;
  for (const re of NOT_SOURCE_PATTERNS) {
    if (re.test(path)) return false;
  }
  return true;
}

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

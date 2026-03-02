/**
 * Resolve bundled stack frames to original source using dist/index.js.map.
 * Used when displaying incident notifications — maps dist/index.js:LINE to server/file.ts:LINE.
 *
 * For PushLog server errors: ensure index.js.map is deployed with the app (build uses --sourcemap).
 * For errors from Sentry (customer apps): have customers upload source maps to Sentry so Sentry
 * sends symbolicated stack traces in the webhook; we only resolve our own bundle (index.js).
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SourceMapConsumer } = require("source-map");

let cachedConsumer: any = null;

function getPossibleMapPaths(): string[] {
  const cwd = process.cwd();
  const paths: string[] = [];
  // When running as node dist/index.js (e.g. in Docker), script is at cwd/dist/index.js
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptDir = path.dirname(scriptPath);
    if (path.basename(scriptDir) === "dist") {
      paths.push(path.join(scriptDir, "index.js.map"));
    }
  } catch {
    // ignore
  }
  paths.push(path.join(cwd, "dist", "index.js.map"));
  paths.push(path.join(cwd, "index.js.map"));
  return paths;
}

async function getSourceMapConsumer(): Promise<any | null> {
  if (cachedConsumer) return cachedConsumer;
  for (const mapPath of getPossibleMapPaths()) {
    try {
      if (!fs.existsSync(mapPath)) continue;
      const raw = fs.readFileSync(mapPath, "utf8");
      const map = JSON.parse(raw);
      cachedConsumer = await new SourceMapConsumer(map);
      return cachedConsumer;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Resolve a generated (bundled) position to original source.
 * Only resolves frames from our server bundle (index.js). Other filenames (e.g. customer app chunks) are returned as-is.
 *
 * @param generatedFile - e.g. "index.js", "dist/index.js", "/app/dist/index.js"
 * @param generatedLine - 1-based line number
 * @param generatedColumn - 0-based column (optional, use 0 if unknown)
 * @returns e.g. "server/routes.ts:4295" or null if resolution fails
 */
export async function resolveToSource(
  generatedFile: string,
  generatedLine: number,
  generatedColumn: number = 0
): Promise<string | null> {
  const normalized = path.normalize(generatedFile);
  const basename = path.basename(normalized);
  if (basename !== "index.js") return null;

  const consumer = await getSourceMapConsumer();
  if (!consumer) return null;

  try {
    const pos = consumer.originalPositionFor({
      line: generatedLine,
      column: generatedColumn,
    });
    if (!pos || !pos.source) return null;
    const sourceFile = pos.source.replace(/^webpack:\/\//, "").replace(/\?.*$/, "");
    const line = pos.line ?? generatedLine;
    return `${sourceFile}:${line}`;
  } catch {
    return null;
  }
}

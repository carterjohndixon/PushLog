/**
 * Resolve bundled stack frames to original source using dist/index.js.map.
 * Used when displaying incident notifications — maps dist/index.js:LINE to server/file.ts:LINE.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SourceMapConsumer } = require("source-map");

let cachedConsumer: any = null;

async function getSourceMapConsumer(): Promise<any | null> {
  if (cachedConsumer) return cachedConsumer;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mapPath =
    path.basename(scriptDir) === "dist"
      ? path.join(scriptDir, "index.js.map")
      : path.join(process.cwd(), "dist", "index.js.map");
  try {
    if (!fs.existsSync(mapPath)) return null;
    const raw = fs.readFileSync(mapPath, "utf8");
    const map = JSON.parse(raw);
    cachedConsumer = await new SourceMapConsumer(map);
    return cachedConsumer;
  } catch {
    return null;
  }
}

/**
 * Resolve a generated (bundled) position to original source.
 * @param generatedFile - e.g. "index.js", "dist/index.js", "/var/www/pushlog/dist/index.js"
 * @param generatedLine - 1-based line number
 * @param generatedColumn - 0-based column (optional, use 0 if unknown)
 * @returns e.g. "server/routes.ts:4295" or null if resolution fails
 */
export async function resolveToSource(
  generatedFile: string,
  generatedLine: number,
  generatedColumn: number = 0
): Promise<string | null> {
  const basename = path.basename(generatedFile);
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

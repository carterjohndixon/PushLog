// Production-only static file serving – no Vite dependency
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve main app static root (dist/public). Handles both __dirname = dist/ and __dirname = project root. */
function resolveMainDistPath(): string {
  const distPublic = path.join(__dirname, "public");
  if (fs.existsSync(path.join(distPublic, "index.html"))) return path.resolve(distPublic);
  const alt = path.join(__dirname, "dist", "public");
  if (fs.existsSync(path.join(alt, "index.html"))) return path.resolve(alt);
  return path.resolve(distPublic);
}

/** Asset path prefixes (Vite output: js/, css/, images/, assets/) + root-level asset files */
const ASSET_PREFIXES = ["/js/", "/css/", "/images/", "/assets/"];

/** File extensions that are always static assets (never SPA routes) */
const ASSET_EXTENSIONS = /\.(js|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot)$/i;

function isAssetRequest(reqPath: string): boolean {
  const p = (reqPath.split("?")[0] || "").trim();
  if (!p) return false;
  if (ASSET_EXTENSIONS.test(p)) return true;
  return ASSET_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/** Safely resolve a request path to a file under root. Returns null if invalid or outside root. */
function resolveAssetPath(root: string, reqPath: string): string | null {
  const raw = (reqPath.split("?")[0] || "").trim().replace(/^\//, "");
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (decoded.startsWith("..") || decoded.includes("\0")) return null;
  const resolved = path.resolve(root, decoded);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return null;
  return resolved;
}

const staticOptions = {
  redirect: false,
  index: false,
  fallthrough: true,
};

export function serveStatic(app: Express) {
  const mainDistPath = resolveMainDistPath();
  const carterDistPath = path.resolve(__dirname, "..", "carter.pushlog.ai", "dist");
  const mainIndexPath = path.join(mainDistPath, "index.html");
  const carterIndexPath = path.join(carterDistPath, "index.html");

  if (!fs.existsSync(mainDistPath) || !fs.existsSync(mainIndexPath)) {
    throw new Error(
      `Could not find the build directory: ${mainDistPath}, make sure to build the client first`,
    );
  }

  const hasCarterBuild = fs.existsSync(carterIndexPath);

  app.use("/", (req, res) => {
    const host = (req.hostname || "").toLowerCase();
    const isCarterHost = host === "carter.pushlog.ai";
    const staticPath = isCarterHost && hasCarterBuild ? carterDistPath : mainDistPath;
    const indexPath = isCarterHost && hasCarterBuild ? carterIndexPath : mainIndexPath;

    // req.originalUrl preserves the full path; req.url/req.path are stripped when mounted at "*"
    const reqPath = (req.originalUrl ?? req.url ?? req.path ?? "/").split("?")[0] || "/";
    const isAsset = isAssetRequest(reqPath);

    if (isCarterHost && !hasCarterBuild) {
      console.warn("[static] carter.pushlog.ai requested but no carter build was found; falling back to main app.");
    }

    // Asset requests: resolve file path ourselves and serve or 404. Never fall back to index.html.
    if (isAsset) {
      const filePath = resolveAssetPath(staticPath, reqPath);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.status(404).send("Not found");
        return;
      }
      res.sendFile(filePath);
      return;
    }

    // Non-asset: try express.static first, then SPA fallback to index.html
    const staticMiddleware = express.static(staticPath, staticOptions);
    staticMiddleware(req, res, () => {
      if (!indexPath || !fs.existsSync(indexPath)) {
        console.error(`ENOENT: index.html not found at ${indexPath}`);
        res.status(404).send(
          "Client build not found. Run: npm run build (vite build + server bundle).",
        );
        return;
      }

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    });
  });
}

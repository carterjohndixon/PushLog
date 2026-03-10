// Production-only static file serving – no Vite dependency
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Asset path prefixes (Vite output: js/, css/, images/, assets/) */
const ASSET_PREFIXES = ["/js/", "/css/", "/images/", "/assets/"];

/** File extensions that are always static assets (never SPA routes) */
const ASSET_EXTENSIONS = /\.(js|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot)$/i;

function isAssetRequest(reqPath: string): boolean {
  const p = reqPath.split("?")[0];
  if (ASSET_EXTENSIONS.test(p)) return true;
  return ASSET_PREFIXES.some((prefix) => p.startsWith(prefix));
}

const staticOptions = {
  redirect: false,
  index: false, // Disable directory index so we never serve index.html by accident
  fallthrough: true,
};

export function serveStatic(app: Express) {
  const mainDistPath = path.resolve(__dirname, "public");
  const carterDistPath = path.resolve(__dirname, "..", "carter.pushlog.ai", "dist");
  const mainIndexInPublic = path.resolve(mainDistPath, "index.html");
  const mainIndexInDist = path.resolve(__dirname, "index.html");
  const carterIndexPath = path.resolve(carterDistPath, "index.html");

  if (!fs.existsSync(mainDistPath)) {
    throw new Error(
      `Could not find the build directory: ${mainDistPath}, make sure to build the client first`,
    );
  }

  const hasCarterBuild = fs.existsSync(carterIndexPath);

  app.use("*", (req, res) => {
    const host = (req.hostname || "").toLowerCase();
    const isCarterHost = host === "carter.pushlog.ai";
    const staticPath = isCarterHost && hasCarterBuild ? carterDistPath : mainDistPath;
    const indexPath =
      isCarterHost && hasCarterBuild
        ? carterIndexPath
        : fs.existsSync(mainIndexInPublic)
          ? mainIndexInPublic
          : fs.existsSync(mainIndexInDist)
            ? mainIndexInDist
            : null;
    const isAsset = isAssetRequest(req.path || req.url || "/");

    if (isCarterHost && !hasCarterBuild) {
      console.warn("[static] carter.pushlog.ai requested but no carter build was found; falling back to main app.");
    }

    const staticMiddleware = express.static(staticPath, staticOptions);
    staticMiddleware(req, res, () => {
      // Asset requests: 404 if file not found (no SPA fallback)
      if (isAsset) {
        res.status(404).send("Not found");
        return;
      }

      // Non-asset: SPA fallback to index.html
      if (!indexPath) {
        console.error(
          `ENOENT: no such file or directory, stat '${mainIndexInPublic}' (also tried '${mainIndexInDist}')`,
        );
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

// Production-only static file serving – no Vite dependency
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    if (isCarterHost && !hasCarterBuild) {
      console.warn("[static] carter.pushlog.ai requested but no carter build was found; falling back to main app.");
    }

    const staticMiddleware = express.static(staticPath);
    staticMiddleware(req, res, () => {
      if (!indexPath) {
        console.error(
          `ENOENT: no such file or directory, stat '${mainIndexInPublic}' (also tried '${mainIndexInDist}')`,
        );
        res.status(404).send(
          "Client build not found. Run: npm run build (vite build + server bundle).",
        );
        return;
      }

      // Prevent caching so users always get fresh HTML after deploys (avoids chunk mismatch errors)
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    });
  });
}

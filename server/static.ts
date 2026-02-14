// Production-only static file serving – no Vite dependency
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const indexInPublic = path.resolve(distPath, "index.html");
  const indexInDist = path.resolve(__dirname, "index.html");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (req, res) => {
    const indexPath = fs.existsSync(indexInPublic)
      ? indexInPublic
      : fs.existsSync(indexInDist)
        ? indexInDist
        : null;
    if (indexPath) {
      res.sendFile(indexPath);
    } else {
      console.error(
        `ENOENT: no such file or directory, stat '${indexInPublic}' (also tried '${indexInDist}')`,
      );
      res.status(404).send(
        "Client build not found. Run: npm run build (vite build + server bundle).",
      );
    }
  });
}

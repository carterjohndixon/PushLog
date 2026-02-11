import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
      target: "es2020",
      chunkSizeWarningLimit: 800,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react") || id.includes("react-dom") || id.includes("wouter")) {
                return "vendor-core";
              }
              if (id.includes("@tanstack/react-query")) {
                return "vendor-query";
              }
              if (id.includes("@radix-ui")) {
                return "vendor-ui";
              }
              if (id.includes("recharts") || id.includes("date-fns") || id.includes("framer-motion")) {
                return "vendor-misc";
              }
            }
          },
          chunkFileNames: "js/[name]-[hash].js",
          entryFileNames: "js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name?.split(".").pop() ?? "";
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) return "images/[name]-[hash][extname]";
            if (/css/i.test(ext)) return "css/[name]-[hash][extname]";
            return "assets/[name]-[hash][extname]";
          },
        },
      },
      minify: "esbuild",
      sourcemap: false,
      cssCodeSplit: true,
      commonjsOptions: {
        include: [/node_modules/],
      },
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "pushlog.ai",
        "www.pushlog.ai",
        "0cfcd911cf03.ngrok-free.app",
        ".ngrok-free.app",
        ".ngrok.io"
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "wouter",
        "@tanstack/react-query",
        "lucide-react",
        "date-fns",
        "clsx",
        "tailwind-merge",
        "next-themes",
        "recharts",
        "framer-motion",
      ],
      esbuildOptions: {
        target: "es2020",
      },
    },
  }
);
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
      chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks - only include actual dependencies
            'react-vendor': ['react', 'react-dom'],
            'router-vendor': ['wouter'],
            'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-select', '@radix-ui/react-switch', '@radix-ui/react-toast'],
            'query-vendor': ['@tanstack/react-query'],
            'icons-vendor': ['lucide-react']
          },
          // Optimize chunk naming
          chunkFileNames: (chunkInfo: any) => {
            const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
            return `js/[name]-[hash].js`;
          },
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo: any) => {
            const name = assetInfo.name || 'asset';
            const info = name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `images/[name]-[hash][extname]`;
            }
            if (/css/i.test(ext)) {
              return `css/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          }
        }
      },
      // Enable minification and source maps
      minify: 'terser',
      sourcemap: false,
      // Optimize dependencies
      commonjsOptions: {
        include: [/node_modules/],
      }
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
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'wouter',
        '@tanstack/react-query',
        'lucide-react'
      ]
    }
  }
);
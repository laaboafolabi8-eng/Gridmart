import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Co-locate Rollup's shared CommonJS interop helpers with React
          // core so the react chunk is a pure sink (imported by everything,
          // importing nothing). Otherwise the helper lands in another chunk
          // that vendor-react imports back, creating a circular chunk
          // dependency and a top-level "Cannot access X before
          // initialization" TDZ that blanks the production page.
          if (id.includes('commonjsHelpers') || id.includes('commonjs-helper'))
            return 'vendor-react';
          if (!id.includes('node_modules')) return;
          if (id.includes('@stripe')) return 'vendor-stripe';
          // Keep the entire recharts ecosystem (incl. react-smooth + its
          // throttle/debounce helpers and d3) in one chunk. Splitting
          // react-smooth into the react chunk creates a circular chunk
          // dependency that breaks the production bundle with a top-level
          // "Cannot access 'React' before initialization" TDZ error.
          if (
            id.includes('recharts') ||
            id.includes('react-smooth') ||
            id.includes('react-transition-group') ||
            id.includes('victory-vendor') ||
            id.includes('internmap') ||
            id.includes('d3-')
          ) return 'vendor-charts';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('@tanstack')) return 'vendor-query';
          // Match ONLY the exact React core packages (by node_modules path
          // boundary) so scoped packages like @uppy/react are NOT swept in.
          // A greedy "react" substring match pulls unrelated libraries (and
          // their lodash helpers) into this chunk, creating a circular chunk
          // dependency and a top-level "Cannot access X before initialization"
          // TDZ error that blanks the production page.
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-is|scheduler|use-sync-external-store|object-assign|prop-types)[\\/]/.test(
              id,
            )
          ) return 'vendor-react';
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

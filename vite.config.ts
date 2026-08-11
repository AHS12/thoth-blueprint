import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

let gitHash = '';
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Could not get git hash', e);
  gitHash = 'N/A';
}

export default defineConfig(() => ({
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version), // Becomes "1.0.0"
    '__GIT_HASH__': JSON.stringify(gitHash),       // Becomes "(ae04737)"
  },
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    sourcemap: false,
  },
  plugins: [
    dyadComponentTagger(),
    react(),
    VitePWA({
      registerType: "prompt",
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
        suppressWarnings: true,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
              },
            },
          },
          {
            urlPattern: /\.(?:js|css)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
              },
            },
          },
        ],
      },
      includeAssets: [
        "ThothBlueprint-icon.svg",
        "robots.txt",
        "browserconfig.xml",
        "offline.html",
      ],
      manifest: {
        name: "ThothBlueprint",
        short_name: "ThothBlueprint",
        description: "Visualize your database schema with our intuitive drag-and-drop editor.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["productivity", "utilities", "developer", "design"],
        icons: [
          {
            src: "ThothBlueprint-icon.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "ThothBlueprint-icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
          {
            src: "ThothBlueprint-icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

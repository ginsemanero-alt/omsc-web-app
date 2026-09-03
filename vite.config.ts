import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  // Must be root-relative, not "./" — with a relative base, a hard
  // reload/deep-link on a nested route (e.g. /admin/users) resolves
  // "./assets/..." against that path instead of the site root, so the
  // browser requests /admin/assets/... which doesn't exist, falls through
  // vercel.json's SPA catch-all rewrite, and gets index.html back with a
  // text/html MIME type where a JS module or stylesheet was expected —
  // the whole page fails to load.
  base: "/",
  css: {
    postcss: {
      plugins: [tailwind()],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
});
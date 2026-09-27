import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Lets the browser talk to /api/* on the same origin in development, so the
    // client code has no environment-specific base URL in it.
    proxy: {
      "/api": { target: "http://localhost:5050", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // three.js and gsap are heavy and change rarely — splitting them keeps
        // the app chunk small and cacheable across deploys.
        manualChunks: {
          three: ["three"],
          gsap: ["gsap"],
          /* Named so the auth SDK is one cacheable chunk rather than being
             inlined into whichever component happened to pull it first. It is
             fetched on the first account interaction, not at page load. */
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8766" },
  },
  build: {
    outDir: "dist", sourcemap: true,
    rollupOptions: { output: { manualChunks: {
      react: ["react", "react-dom", "lucide-react"],
      canvas: ["fabric"],
      local: ["dexie", "zustand", "immer", "jszip"],
    } } },
  },
});

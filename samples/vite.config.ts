import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    fs: {
      allow: [".."],
    },
  },
  resolve: {
    alias: {
      "svg-time-series": path.resolve(__dirname, "../svg-time-series/src"),
    },
  },
  build: {
    outDir: "dist",
  },
  plugins: [],
});

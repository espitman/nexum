import { externalizeDepsPlugin } from "electron-vite";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@nexum/shared"] })],
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ["@nexum/shared"] })],
  },
  renderer: {
    optimizeDeps: {
      exclude: ["@monaco-editor/react", "monaco-editor"],
    },
    root: "src/renderer",
    plugins: [react()],
  },
});

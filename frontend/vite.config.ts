import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { dedupe: ["react", "react-dom", "phaser", "ajv"] },
  server: {
    watch: {
      ignored: [
        "**/test-results/**",
        "**/playwright-report/**",
        "**/tests/**",
        "**/e2e/**",
      ],
    },
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});

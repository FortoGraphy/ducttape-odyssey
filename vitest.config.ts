import path from "node:path";
import { defineConfig } from "vitest/config";

// Engine and content are pure TypeScript: tests run in Node, no React Native.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 60000 },
});

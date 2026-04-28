import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "api/**/*.test.ts",
      "api/**/*.spec.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.tsx",
    ],
    setupFiles: ["src/test/setup.ts"],
  },
});

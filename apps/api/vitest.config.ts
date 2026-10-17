import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api/**/*.test.ts"],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
  esbuild: {
    target: "node18",
  },
  resolve: {
    alias: {
      // Tests live outside this package, so they cannot reach the workspace
      // link in `apps/api/node_modules`. Point them at the source directly.
      "@kaneo/permissions": path.resolve(
        __dirname,
        "../../packages/permissions/src/index.ts",
      ),
    },
  },
});

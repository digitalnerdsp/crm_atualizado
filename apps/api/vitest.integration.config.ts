import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api-integration/**/*.test.ts"],
    setupFiles: ["../../tests/api-integration/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      enabled: false,
    },
  },
  esbuild: {
    target: "node18",
  },
  resolve: {
    alias: {
      "@kaneo/email": resolve(
        __dirname,
        "../../tests/api-integration/mocks/email.ts",
      ),
      // Tests live outside this package, so they cannot reach the workspace
      // link in `apps/api/node_modules`. Point them at the source directly.
      "@kaneo/permissions": resolve(
        __dirname,
        "../../packages/permissions/src/index.ts",
      ),
    },
  },
});

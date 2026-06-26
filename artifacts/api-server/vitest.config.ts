// ---------------------------------------------------------------------------
// Vitest Configuration — API Server ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
// Configured for TypeScript with esbuild for fast test execution.
// Supports unit tests, integration tests, and coverage reporting.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "node_modules",
        "dist",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    setupFiles: [],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

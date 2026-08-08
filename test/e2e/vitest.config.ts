import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/e2e/**/*.test.ts"],
        testTimeout: 30000,
        hookTimeout: 30000,
        // Each test uses a distinct account from the pool (test_1, test_2, ...),
        // so files can safely run in parallel without colliding.
        fileParallelism: true,
    },
});

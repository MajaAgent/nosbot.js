import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/e2e/**/*.test.ts"],
        testTimeout: 30000,
        hookTimeout: 30000,
        // NosCore drops packets when several bots log in to the world server at
        // the exact same time (Encode Error / lost handshake), so run tests one
        // at a time, in a single thread. Each still uses its own account.
        singleThread: true,
        fileParallelism: false,
    },
});

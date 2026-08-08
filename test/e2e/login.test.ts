import { describe, it } from "vitest";
import { loginAndEnterGame, createBot } from "./harness";

describe("NosCore E2E", () => {
    it("bot logs in with priv auth and reaches in-game", async () => {
        const bot = createBot();
        try {
            await loginAndEnterGame(bot);
        } finally {
            bot.close();
        }
    });
});

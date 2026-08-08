import { describe, it, expect } from "vitest";
import { NostaleBot } from "../../src/index";
import { testConfig } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("NosCore E2E", () => {
    it("bot logs in with priv auth and reaches in-game", async () => {
        // The stack is "eventually ready": world channels propagate to the login
        // server with a short delay after the containers register on master.
        // Retry login briefly so a cold start doesn't fail on a transient
        // "cannot connect" (failc 6).
        let result: Awaited<ReturnType<NostaleBot["login"]>> | undefined;
        let bot: NostaleBot | undefined;
        for (let attempt = 0; attempt < 10; attempt++) {
            bot = new NostaleBot({
                ...testConfig,
                auth: { ...testConfig.auth, type: "priv" },
            });

            const inGame = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("Timed out waiting for in-game")),
                    25000
                );
                bot!.on("tit", () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            result = await bot.login();
            if (result.success) {
                await inGame;
                bot.close();
                return;
            }

            bot.close();
            await sleep(2000);
        }

        throw new Error(
            `Bot could not log in after retries. Last result: ${JSON.stringify(result)}`
        );
    }, 60000);
});

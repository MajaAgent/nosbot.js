import { describe, expect, it } from "vitest";
import { NostaleEmoji } from "../../src/index";
import { prepareCharacter, waitForPacket, withBot } from "./harness";

const SPAWN = { map: 1, x: 79, y: 116 };

describe("NosCore E2E emoji", () => {
    it("bot sends an emoji and the server broadcasts the matching eff packet", async () => {
        await withBot(async (bot) => {
            await prepareCharacter(bot, { teleport: SPAWN });

            // AltW = 974; NosCore EmoticonHandler broadcasts eff with
            // effect = data + 4099 = 5073.
            const effPromise = waitForPacket(bot, (packet) => {
                const parts = packet.split(" ");
                return parts[0] === "eff" && parts.includes("5073");
            });

            bot.emoji.use(NostaleEmoji.AltW);

            const eff = await effPromise;
            expect(eff).toMatch(/^eff /);
        });
    }, 60000);
});

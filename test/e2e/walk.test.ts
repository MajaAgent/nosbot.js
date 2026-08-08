import { describe, expect, it } from "vitest";
import { getPosition, prepareCharacter, withBot } from "./harness";

const SPAWN = { map: 1, x: 79, y: 116 };

describe("NosCore E2E walk", () => {
    it("bot walks to a walkable position and the server confirms it", async () => {
        await withBot(async (bot) => {
            // Reset to a known spawn so the test doesn't depend on the previous
            // run's position.
            await prepareCharacter(bot, { teleport: SPAWN });
            const start = await getPosition(bot);
            expect(start).toEqual(SPAWN);

            // Target a walkable cell a few tiles away on map 1 (Nosville).
            const targetX = start!.x + 6;
            const targetY = start!.y;

            await bot.walkTo(targetX, targetY);

            // Wait for the server to register the movement, then query $Position.
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const end = await getPosition(bot);
            expect(end).not.toBeNull();
            expect(end!.x).toBe(targetX);
            expect(end!.y).toBe(targetY);
        });
    }, 60000);
});

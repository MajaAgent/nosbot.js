import { describe, expect, it } from "vitest";
import { prepareCharacter, waitForPosition, withBot } from "./harness";

const SPAWN = { map: 1, x: 79, y: 116 };

describe("NosCore E2E walk", () => {
    it("bot walks to a walkable position and the server confirms it", async () => {
        await withBot(async (bot) => {
            // Reset to a known spawn so the test doesn't depend on the previous
            // run's position. prepareCharacter waits until the teleport lands.
            await prepareCharacter(bot, { teleport: SPAWN });

            // Target a walkable cell a few tiles away on map 1 (Nosville).
            // Keep the distance short so the in-game walking simulation is fast.
            const targetX = SPAWN.x + 3;
            const targetY = SPAWN.y;

            await bot.walkTo(targetX, targetY);

            // Wait (polling $Position) until the server confirms the movement.
            const end = await waitForPosition(bot, (pos) => pos.x === targetX && pos.y === targetY);
            expect(end.x).toBe(targetX);
            expect(end.y).toBe(targetY);
        });
    }, 60000);
});

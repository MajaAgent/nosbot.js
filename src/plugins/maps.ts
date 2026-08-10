import { PNG } from "pngjs";
import type { NostaleBot } from "../NostaleBot";
import { createLogger } from "../logger";

declare module "@gorlikitsme/nosbot.js" {
    interface NostaleBot {
        maps: MapsApi;
    }
}

const logger = createLogger("maps");
const DEFAULT_API_BASE = "https://itempicker.atlagaming.eu";

export interface WalkGrid {
    width: number;
    height: number;
    /** Row-major, `1` = walkable. */
    walkable: Uint8Array;
}

export interface MapsApi {
    /** Map ids whose grids are loaded. */
    loaded(): number[];
    grid(mapId: number): WalkGrid | null;
    isWalkable(mapId: number, x: number, y: number): boolean;
}

export interface MapsPluginOptions {
    /** Base URL of the map-shadow source. Defaults to the ItemPicker API. */
    apiBase?: string;
    /** Map ids to prefetch before login. Defaults to maps 0-10. */
    maps?: number[];
}

/**
 * Owns the walkable grids (`bot.maps`). Grids are fetched during the `onLogin`
 * hook so they are ready by the time the bot is in-game. The source is an
 * adapter: the ItemPicker shadow API today (white pixel = walkable).
 */
export const mapsPlugin = (bot: NostaleBot, options: MapsPluginOptions = {}): void => {
    const apiBase = options.apiBase ?? DEFAULT_API_BASE;
    const mapIds = options.maps ?? Array.from({ length: 11 }, (_, i) => i);
    const grids = new Map<number, WalkGrid>();

    bot.decorate("maps", {
        loaded: (): number[] => [...grids.keys()],
        grid: (mapId: number): WalkGrid | null => grids.get(mapId) ?? null,
        isWalkable: (mapId: number, x: number, y: number): boolean => {
            const grid = grids.get(mapId);
            if (!grid) {
                return false;
            }
            if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
                return false;
            }
            return grid.walkable[y * grid.width + x] === 1;
        },
    });

    bot.addHook("onLogin", async () => {
        await Promise.all(
            mapIds.map(async (mapId) => {
                try {
                    grids.set(mapId, await fetchShadowGrid(apiBase, mapId));
                } catch (err) {
                    logger.warn(
                        `maps: failed to load grid for map ${mapId}: ${(err as Error).message}`
                    );
                }
            })
        );
    });
};

async function fetchShadowGrid(apiBase: string, mapId: number): Promise<WalkGrid> {
    const res = await fetch(`${apiBase}/api/maps/shadow/${mapId}`);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    const walkable = new Uint8Array(png.width * png.height);
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const i = (y * png.width + x) * 4;
            const isWhite =
                png.data[i] > 200 && png.data[i + 1] > 200 && png.data[i + 2] > 200;
            walkable[y * png.width + x] = isWhite ? 1 : 0;
        }
    }
    return { width: png.width, height: png.height, walkable };
}

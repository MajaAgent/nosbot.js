import type { NostaleBot } from "../NostaleBot";
import type { WalkGrid } from "./maps";
import { sleep } from "../utils/sleep";

declare module "@gorlikitsme/nosbot.js" {
    interface NostaleBot {
        pathfinding: PathfindingApi;
    }
    interface BotEvents {
        arrived: { x: number; y: number };
        blocked: { x: number; y: number };
    }
}

export type PathfindingStatus = "idle" | "walking";

export interface Point {
    x: number;
    y: number;
}

export interface PathfindingApi {
    status: PathfindingStatus;
    currentPath: Point[] | null;
    /** Walks to (x, y) along a walkable path. Resolves once the timed walk completes. */
    pathTo(x: number, y: number): Promise<void>;
    /** Cancels the in-flight walk; the pending `pathTo` rejects with "pathfinding: stopped". */
    stop(): void;
}

export interface PathfindingPluginOptions {
    /** Pacing factor for walk packets. Default 0.4. */
    stepTimingFactor?: number;
}

const POSITION_UNKNOWN_TIMEOUT_MS = 15000;
const DEFAULT_STEP_TIMING_FACTOR = 0.4;
const POSITION_POLL_MS = 200;

export const pathfindingPlugin = (
    bot: NostaleBot,
    options: PathfindingPluginOptions = {}
): void => {
    const stepTimingFactor = options.stepTimingFactor ?? DEFAULT_STEP_TIMING_FACTOR;
    let status: PathfindingStatus = "idle";
    let currentPath: Point[] | null = null;
    let cancelled = false;

    const stepDelay = (from: Point, to: Point): number => {
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        return (1000 * distance) / (stepTimingFactor * bot.self.speed);
    };

    const waitForPositionKnown = async (): Promise<void> => {
        const deadline = Date.now() + POSITION_UNKNOWN_TIMEOUT_MS;
        while (bot.self.x === -1 || bot.self.y === -1) {
            if (Date.now() > deadline) {
                throw new Error("pathfinding: player position unknown — are you in-game?");
            }
            await sleep(POSITION_POLL_MS);
        }
    };

    bot.decorate("pathfinding", {
        get status(): PathfindingStatus {
            return status;
        },
        get currentPath(): Point[] | null {
            return currentPath;
        },
        async pathTo(x: number, y: number): Promise<void> {
            if (status === "walking") {
                throw new Error("pathfinding: already walking — call stop() first");
            }
            if (!bot.maps) {
                throw new Error(
                    "pathfinding: maps plugin not installed — bot.use(mapsPlugin) first"
                );
            }

            await waitForPositionKnown();
            if (bot.self.x === x && bot.self.y === y) {
                return;
            }

            const mapId = bot.self.mapId;
            const grid = bot.maps.grid(mapId);
            if (!grid) {
                throw new Error(
                    `pathfinding: no grid loaded for map ${mapId} — is the maps plugin configured with it?`
                );
            }

            const path = findPath(grid, { x: bot.self.x, y: bot.self.y }, { x, y });
            if (!path) {
                bot.emit("blocked", { x, y });
                throw new Error(
                    `pathfinding: no walkable path to (${x}, ${y}) on map ${mapId}`
                );
            }

            status = "walking";
            currentPath = path;
            cancelled = false;
            try {
                let prev = path[0];
                for (const node of path.slice(1)) {
                    if (cancelled) {
                        throw new Error("pathfinding: stopped");
                    }
                    const w = ((node.x + node.y) % 3) % 2;
                    bot.sendPacket(`walk ${node.x} ${node.y} ${w} ${bot.self.speed}`);
                    await sleep(stepDelay(prev, node));
                    prev = node;
                }
                // The server does not echo `at` for client-driven walking (the
                // client simulates movement), so resolve once the timed walk
                // completes instead of waiting for a server confirmation.
                bot.emit("arrived", { x, y });
            } finally {
                status = "idle";
                currentPath = null;
            }
        },
        stop: (): void => {
            cancelled = true;
        },
    });
};

// A* over the walkable grid, 8-directional with corner-cut prevention.
function findPath(grid: WalkGrid, start: Point, goal: Point): Point[] | null {
    const { width, height, walkable } = grid;
    const key = (x: number, y: number): number => y * width + x;
    const walkableAt = (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x < width && y < height && walkable[y * width + x] === 1;

    if (start.x === goal.x && start.y === goal.y) {
        return [{ ...start }];
    }
    if (!walkableAt(start.x, start.y) || !walkableAt(goal.x, goal.y)) {
        return null;
    }

    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const startKey = key(start.x, start.y);
    gScore.set(startKey, 0);

    const open: { x: number; y: number; g: number; f: number }[] = [
        { x: start.x, y: start.y, g: 0, f: heuristic(start, goal) },
    ];

    const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
    ];

    while (open.length > 0) {
        open.sort((a, b) => b.f - a.f);
        const current = open.pop();
        if (!current) {
            break;
        }
        const currentKey = key(current.x, current.y);

        if (current.x === goal.x && current.y === goal.y) {
            const path: Point[] = [{ x: current.x, y: current.y }];
            let parent = cameFrom.get(currentKey);
            while (parent !== undefined) {
                path.push({ x: parent % width, y: Math.floor(parent / width) });
                parent = cameFrom.get(parent);
            }
            return path.reverse();
        }

        for (const [dx, dy] of dirs) {
            const nx = current.x + dx;
            const ny = current.y + dy;
            if (!walkableAt(nx, ny)) {
                continue;
            }
            if (dx !== 0 && dy !== 0) {
                if (
                    !walkableAt(current.x + dx, current.y) ||
                    !walkableAt(current.x, current.y + dy)
                ) {
                    continue;
                }
            }
            const cost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
            const tentative = current.g + cost;
            const neighborKey = key(nx, ny);
            if (tentative < (gScore.get(neighborKey) ?? Infinity)) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentative);
                open.push({
                    x: nx,
                    y: ny,
                    g: tentative,
                    f: tentative + heuristic({ x: nx, y: ny }, goal),
                });
            }
        }
    }
    return null;
}

function heuristic(a: Point, b: Point): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

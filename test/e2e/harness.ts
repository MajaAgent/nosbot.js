import { NostaleBot } from "../../src/index";
import { testConfig } from "./config";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BotConfig = NostaleBot["config"];

const TEST_ACCOUNT_COUNT = parseInt(process.env.SEED_TEST_ACCOUNTS || "10");
const TEST_PASSWORD = process.env.SEED_PASSWORD || "testpass";

/** Round-robin cursor over the test account pool (used when no worker id). */
let accountCursor = 0;

export interface TestAccount {
    login: string;
    password: string;
    characterName: string;
}

/**
 * Returns the test account for the current test file.
 *
 * Vitest runs each test file in its own worker, so `VITEST_WORKER_ID` gives a
 * stable per-file index → worker 1 uses test_1, worker 2 uses test_2, etc.
 * This prevents parallel files from all logging in as test_1. Without a worker
 * id (plain node), falls back to round-robin over the pool.
 */
export function nextTestAccount(): TestAccount {
    const workerId = parseInt(process.env.VITEST_WORKER_ID || "0");
    const index = workerId > 0 ? workerId : (accountCursor % TEST_ACCOUNT_COUNT) + 1;
    if (workerId <= 0) {
        accountCursor++;
    }
    return {
        login: `test_${index}`,
        password: TEST_PASSWORD,
        characterName: `Test${index}`,
    };
}

/** Creates a bot with the shared test config, defaulting to `priv` auth. */
export function createBot(overrides: Partial<BotConfig> = {}): NostaleBot {
    const account = nextTestAccount();
    return new NostaleBot({
        ...testConfig,
        auth: { type: "priv", login: account.login, password: account.password },
        selectCharacter: { byName: account.characterName },
        ...overrides,
    });
}

export interface WaitOptions {
    /** Milliseconds to wait before rejecting. Default 15000. */
    timeout?: number;
}

/** Resolves with the first received packet that matches the predicate. */
export function waitForPacket(
    bot: NostaleBot,
    predicate: (packet: string) => boolean,
    { timeout = 15000 }: WaitOptions = {}
): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            bot.removeListener("packet_recv", onPacket);
            reject(new Error(`Timed out after ${timeout}ms waiting for a matching packet`));
        }, timeout);

        const onPacket = (packet: string) => {
            if (predicate(packet)) {
                clearTimeout(timer);
                bot.removeListener("packet_recv", onPacket);
                resolve(packet);
            }
        };
        bot.on("packet_recv", onPacket);
    });
}

/** Resolves when the named event fires (packets emit an event per header, e.g. `tit`, `at`, `OK`). */
export function waitForEvent(
    bot: NostaleBot,
    event: string,
    { timeout = 15000 }: WaitOptions = {}
): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            bot.removeListener(event, onEvent);
            reject(new Error(`Timed out after ${timeout}ms waiting for event "${event}"`));
        }, timeout);

        const onEvent = (packet: string) => {
            clearTimeout(timer);
            bot.removeListener(event, onEvent);
            resolve(packet);
        };
        bot.on(event, onEvent);
    });
}

export interface LoginOptions {
    /** Login retries (the stack is "eventually ready" after a cold start). Default 10. */
    retries?: number;
    /** Delay between retries in ms. Default 2000. */
    retryDelay?: number;
    /** Timeout for reaching in-game (tit) per attempt in ms. Default 25000. */
    inGameTimeout?: number;
}

/**
 * Logs the bot in via `priv` auth and waits until it is in-game (tit packet).
 * Throws if the bot could not log in after all retries.
 */
export async function loginAndEnterGame(
    bot: NostaleBot,
    { retries = 10, retryDelay = 2000, inGameTimeout = 25000 }: LoginOptions = {}
): Promise<void> {
    let lastResult: Awaited<ReturnType<NostaleBot["login"]>> | undefined;
    for (let attempt = 0; attempt < retries; attempt++) {
        lastResult = await bot.login();
        if (lastResult.success) {
            await waitForEvent(bot, "tit", { timeout: inGameTimeout });
            return;
        }
        await sleep(retryDelay);
    }
    throw new Error(`Bot could not log in after ${retries} retries. Last result: ${JSON.stringify(lastResult)}`);
}

/**
 * Convenience wrapper: creates a bot, logs in and enters the game, runs `fn`,
 * then always closes the bot.
 */
export async function withBot(
    fn: (bot: NostaleBot) => Promise<void>,
    { loginOptions, botOverrides }: { loginOptions?: LoginOptions; botOverrides?: Partial<BotConfig> } = {}
): Promise<void> {
    const bot = createBot(botOverrides);
    try {
        await loginAndEnterGame(bot, loginOptions);
        await fn(bot);
    } finally {
        bot.close();
    }
}

export interface Position {
    map: number;
    x: number;
    y: number;
}

/** Sends a GM command (e.g. "$Teleport 1 79 116"). Requires GM authority. */
export function runCommand(bot: NostaleBot, command: string): void {
    bot.sendPacket(command);
}

/** Teleports the bot to (map, x, y) via the GM command `$Teleport`. */
export function teleportTo(bot: NostaleBot, map: number, x: number, y: number): void {
    runCommand(bot, `$Teleport ${map} ${x} ${y}`);
}

/** Heals the character to full HP/MP by raising its level via `$SetLevel`. */
export function healBySetLevel(bot: NostaleBot, level = 16): void {
    runCommand(bot, `$SetLevel ${level}`);
}

export interface PrepareOptions {
    /** Teleport target before the test body runs. */
    teleport?: { map: number; x: number; y: number };
    /** Heal to full HP/MP by setting the level. */
    heal?: boolean;
    /** Extra GM commands to run before the test body. */
    commands?: string[];
}

/**
 * Prepares the character for a test: optional teleport, heal, and extra GM
 * commands. Use this at the start of tests that depend on position or HP/MP
 * so they don't rely on where the character ended up after the previous run.
 */
export async function prepareCharacter(bot: NostaleBot, options: PrepareOptions = {}): Promise<void> {
    const commands: string[] = [];
    if (options.teleport) {
        commands.push(`$Teleport ${options.teleport.map} ${options.teleport.x} ${options.teleport.y}`);
    }
    if (options.heal) {
        commands.push("$SetLevel 16");
    }
    commands.push(...(options.commands ?? []));

    for (const command of commands) {
        runCommand(bot, command);
        // Give the server a moment to process each command.
        await sleep(1500);
    }
}

/**
 * Reads the bot's current position by sending the GM command `$Position` and
 * parsing the `say` response (e.g. "Map:1 - X:79 - Y:116"). Requires the
 * account to have at least GameMaster authority.
 */
export function getPosition(bot: NostaleBot, { timeout = 3000 }: WaitOptions = {}): Promise<Position | null> {
    return new Promise((resolve) => {
        const onSay = (packet: string) => {
            if (packet.startsWith("say") && packet.includes("Map:")) {
                clearTimeout(timer);
                bot.removeListener("say", onSay);
                const match = packet.match(/Map:(\d+) - X:(\d+) - Y:(\d+)/);
                resolve(match ? { map: +match[1], x: +match[2], y: +match[3] } : null);
            }
        };
        const timer = setTimeout(() => {
            bot.removeListener("say", onSay);
            resolve(null);
        }, timeout);
        bot.on("say", onSay);
        bot.sendPacket("$Position");
    });
}

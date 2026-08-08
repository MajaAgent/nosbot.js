import { NostaleBot } from "../../src/index";
import { testConfig } from "./config";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BotConfig = NostaleBot["config"];

/** Creates a bot with the shared test config, defaulting to `priv` auth. */
export function createBot(overrides: Partial<BotConfig> = {}): NostaleBot {
    return new NostaleBot({
        ...testConfig,
        auth: { ...testConfig.auth, type: "priv" },
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

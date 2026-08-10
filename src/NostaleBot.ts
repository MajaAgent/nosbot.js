/* eslint-disable @typescript-eslint/no-empty-interface */
import EventEmitter from "events";
import { createLogger } from "./logger";
import { parseNsTestPacket } from "./PacketHandler/nstest";
import { TcpClientManager } from "./TcpClient/TcpClientManager";
import { failcToString } from "./utils/failcToString";
import { sleep } from "./utils/sleep";
import { createLoginPacket, pickWorldServer, selectCharacter } from "./modules/login";

const logger = createLogger("NostaleBot");

export interface NostaleBotConfig {
    auth:
        | {
              type: "priv";
              login: string;
              password: string;
          }
        | {
              type: "NoS0577_with_token";
              token: string;
              login: string;
              languageId?: number;
          }
        | {
              type: "custom";
              customLoginPacket: string;
              login: string;
              password: string;
          };
    loginServer: {
        ip: string;
        port: number;
    };
    worldServer:
        | {
              byServerName?: string;
              channelId: number;
          }
        | {
              ip: string;
              port: number;
          };
    selectCharacter?:
        | {
              byId: number;
          }
        | {
              byName: string;
          };
    extra?: {
        nosvoidPin?: string;
    };
    game: {
        installationId: "00000000-0000-0000-0000-000000000000" | string;
        nostaleClientXVersion: "0.9.3.3087" | string;
        nostaleClientXMd5Hash: string;
        nostaleClientMd5Hash: string;
    };
}

/** Typed events emitted by the bot. Plugins augment this interface. */
export interface BotEvents {
    "packet_recv": string;
    "failc": string;
}

export interface SelfState {
    id: number;
    name: string;
    mapId: number;
    x: number;
    y: number;
    speed: number;
}

export type NostaleHookName = "onLogin" | "onClose";
export type NostalePlugin = (bot: NostaleBot, options?: any) => void;

export type LoginResult =
    | { success: true }
    | { success: false; failcPacket: string; failcMessage: string };

/**
 * Augmentation target for plugins: `declare module "@gorlikitsme/nosbot.js" {
 * interface NostaleBot { pathfinding: PathfindingApi } }` types the decorated
 * surface at the call site (fastify-style).
 */
export interface NostaleBot {}

// Protocol timing, tuned against a live server. Do not change without testing.
const LOGIN_TO_WORLD_DELAY_MS = 750;
const WORLD_AUTH_DELAY_MS = 500;
const PULSE_INTERVAL_MS = 60000;
const PULSE_STEP_MS = 60000;

export class NostaleBot extends EventEmitter {
    readonly config: NostaleBotConfig;
    self: SelfState = { id: 0, name: "", mapId: -1, x: -1, y: -1, speed: 16 };

    private tcpClient = new TcpClientManager();
    private _sendMiddleware: (packet: string) => string = (packet) => packet;
    private _packetObservers: { [header: string]: ((packet: string) => void)[] } = {};
    private _hooks: { [name in NostaleHookName]?: (() => void | Promise<void>)[] } = {
        onLogin: [],
        onClose: [],
    };
    private _characterList: { id: number; name: string }[] = [];
    private _currentStage: "auth" | "character_select" = "auth";
    private _pulseInterval?: NodeJS.Timeout;
    private _loginStarted = false;
    private _closed = false;

    constructor(config: NostaleBotConfig) {
        super();
        this.config = config;
    }

    /** Registers a fastify-style plugin: `plugin(this, options)` runs immediately. */
    use(plugin: NostalePlugin, options?: unknown): this {
        plugin(this, options);
        return this;
    }

    /** Attaches a plugin's surface under one name on the bot, e.g. `bot.pathfinding`. */
    decorate(name: string, value: unknown): void {
        if (name in this) {
            throw new Error(`Cannot decorate "${name}": already present on the bot`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any)[name] = value;
    }

    /** Runs `handler` for every received packet with the given header. Open to all plugins. */
    onPacket(header: string, handler: (packet: string) => void): this {
        (this._packetObservers[header] ??= []).push(handler);
        return this;
    }

    /** Registers a lifecycle hook. `onLogin` hooks run once before the world connection. */
    addHook(hook: "onLogin", fn: () => void | Promise<void>): this;
    addHook(hook: "onClose", fn: () => void | Promise<void>): this;
    addHook(hook: NostaleHookName, fn: () => void | Promise<void>): this {
        (this._hooks[hook] ??= []).push(fn);
        return this;
    }

    public setSendMiddleware(fn: (packet: string) => string): void {
        this._sendMiddleware = fn;
    }

    /** Sends a raw packet string. Low-level escape hatch. */
    public sendPacket(packet: string): void {
        this.tcpClient.sendPacket(this._sendMiddleware(packet));
    }

    /** Logs in: LoginServer auth, then WorldServer auth + character select. */
    public async login(): Promise<LoginResult> {
        if (this._closed) {
            throw new Error("NostaleBot: cannot login after close()");
        }

        if (!this._loginStarted) {
            this._loginStarted = true;
            await this._runHooks("onLogin");
        }

        logger.info(`Connecting to LoginServer...`);
        this.tcpClient = new TcpClientManager();
        await this.tcpClient.connect(this.config.loginServer.ip, this.config.loginServer.port);
        logger.info(`Connected!`);
        this.tcpClient.packetHandler.on("packet_recv", (packetRaw) => this._routePacket(packetRaw));

        this.sendPacket(createLoginPacket(this.config));

        const firstPacket = await this.tcpClient.packetHandler.waitForFirstPacket();

        if (firstPacket.startsWith("failc")) {
            this.tcpClient.destroy();
            logger.debug(firstPacket);
            logger.error(failcToString(firstPacket));
            this.emit("failc", firstPacket);
            return {
                success: false,
                failcPacket: firstPacket,
                failcMessage: failcToString(firstPacket),
            };
        }
        this.tcpClient.destroy();
        await sleep(LOGIN_TO_WORLD_DELAY_MS);

        const nstest = parseNsTestPacket(firstPacket);
        logger.debug(`login: ${nstest.name}; sessionId: ${nstest.sessionId}`);

        logger.debug("============= WORLD =============");
        const [channelIp, channelPort] = pickWorldServer(this.config.worldServer, nstest);
        this.tcpClient = new TcpClientManager(nstest.sessionId);
        await this.tcpClient.connect(channelIp, channelPort);
        logger.info(`Connected!`);
        this.tcpClient.packetHandler.on("packet_recv", (packetRaw) => this._routePacket(packetRaw));

        await this._authenticateToWorld(nstest.sessionId);
        this._startPulseThread();

        logger.debug("============= Character Select =============");
        await this.tcpClient.packetHandler.waitForPacket("clist_end");
        this.sendPacket(`select ${selectCharacter(this.config.selectCharacter, this._characterList)}`);

        this.tcpClient.packetHandler.waitForPacket("OK").then(() => {
            logger.info("* Welcome You are now in game *");
            this.sendPacket("game_start");
            this.sendPacket("lbs 0");
            this.sendPacket("c_close 1");
            this.sendPacket("npinfo 0");
        });

        return {
            success: true,
        };
    }

    public async close(): Promise<void> {
        if (this._closed) {
            return;
        }
        this._closed = true;
        this.tcpClient.destroy();
        this._stopPulseThread();
        await this._runHooks("onClose");
    }

    private async _runHooks(hook: NostaleHookName): Promise<void> {
        for (const fn of this._hooks[hook] ?? []) {
            await fn();
        }
    }

    private async _authenticateToWorld(sessionId: number): Promise<void> {
        this.sendPacket(`${sessionId}`);
        await sleep(WORLD_AUTH_DELAY_MS);
        if (this.config.auth.type == "NoS0577_with_token") {
            const langId = this.config.auth.languageId || 0;
            this.sendPacket(`${this.config.auth.login} GF ${langId}`);
            this.sendPacket(`thisisgfmode`);
        } else {
            this.sendPacket(`${this.config.auth.login} ORG 0`);
            this.sendPacket(`${this.config.auth.password}`);
        }
    }

    private _routePacket(packetRaw: string): void {
        this._updateSelf(packetRaw);
        const header = packetRaw.split(" ", 1)[0];
        this.emit("packet_recv", packetRaw);
        this.emit(header, packetRaw);
        for (const handler of this._packetObservers[header] ?? []) {
            handler(packetRaw);
        }
    }

    // Core-owned grammar: who am I, where am I.
    private _updateSelf(packet: string): void {
        if (this._currentStage == "auth" && packet == "clist_start 0") {
            this._currentStage = "character_select";
            this._characterList = [];
        }
        if (packet.startsWith("clist ")) {
            const p = packet.split(" ");
            this._characterList.push({ id: parseInt(p[1]), name: p[2] });
        }

        if (this.config.extra?.nosvoidPin) {
            if (packet == "guri 10 4 0 1") {
                this.sendPacket(`guri 4 4 0 0 ${this.config.extra.nosvoidPin}`);
            }
        }

        if (packet.startsWith("c_info ")) {
            const p = packet.split(" ");
            this.self.id = parseInt(p[6]);
            this.self.name = p[1];
        } else if (packet.startsWith("cond ")) {
            const p = packet.split(" ");
            if (p[2] == this.self.id.toString()) {
                this.self.speed = parseInt(p[5]);
            }
        } else if (packet.startsWith("at ")) {
            const p = packet.split(" ");
            if (p[1] == this.self.id.toString()) {
                this.self.mapId = parseInt(p[2]);
                this.self.x = parseInt(p[3]);
                this.self.y = parseInt(p[4]);
            }
        }
    }

    private _startPulseThread() {
        logger.debug("Starting pulse thread");
        let pulseSek = 60;
        this._pulseInterval = setInterval(() => {
            this.sendPacket(`pulse ${pulseSek}`);
            pulseSek += PULSE_STEP_MS / 1000;
        }, PULSE_INTERVAL_MS);
    }

    private _stopPulseThread() {
        logger.debug("Stopping pulse thread");
        clearInterval(this._pulseInterval);
    }

    on<K extends keyof BotEvents>(event: K, listener: (payload: BotEvents[K]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener as (...args: any[]) => void);
    }

    emit<K extends keyof BotEvents>(event: K, payload: BotEvents[K]): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    emit(event: string | symbol, ...args: any[]): boolean {
        return super.emit(event, ...args);
    }
}

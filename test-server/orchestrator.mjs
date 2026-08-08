import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE = path.join(__dirname, "compose.yaml");
const SEED = path.join(__dirname, "seed", "seed.ts");

function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
    if (res.status !== 0) {
        throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status}`);
    }
    return res;
}

function compose(...args) {
    return spawnSync("docker", ["compose", "-f", COMPOSE, ...args], { stdio: "inherit" });
}

function composeBuild() {
    const res = spawnSync("docker", ["compose", "-f", COMPOSE, "build"], { stdio: "inherit" });
    if (res.status !== 0) {
        throw new Error(`docker compose build failed (exit ${res.status})`);
    }
}

function isRunning(service) {
    const res = spawnSync("docker", ["compose", "-f", COMPOSE, "ps", "-q", service]);
    return res.stdout.toString().trim().length > 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForLog(service, needle, timeoutMs = 90000, pollMs = 500) {
    const started = Date.now();
    const since = Math.floor((started - 5000) / 1000);
    let lastLines = "";
    while (Date.now() - started < timeoutMs) {
        const res = spawnSync("docker", [
            "logs",
            "--since",
            `${since}s`,
            `noscore-e2e-${service}`,
        ]);
        lastLines = res.stdout.toString() + res.stderr.toString();
        if (lastLines.includes(needle)) {
            console.log(`[ready] ${service}: ${needle}`);
            return;
        }
        await sleep(pollMs);
    }
    throw new Error(
        `Timed out waiting for ${service} to log "${needle}". Last logs:\n${lastLines.slice(-1500)}`
    );
}

function runSeed() {
    if (!existsSync(path.join(__dirname, "..", "node_modules", "pg"))) {
        throw new Error("pg is not installed. Run: npm install --save-dev pg @types/pg");
    }
    const res = spawnSync("npx", ["ts-node", "--project", path.join(__dirname, "seed", "tsconfig.json"), SEED], {
        stdio: "inherit",
        env: { ...process.env, DB_HOST: "127.0.0.1", DB_PORT: "5432" },
    });
    if (res.status !== 0) {
        throw new Error(`Seed failed with exit code ${res.status}`);
    }
}

async function upServer() {
    console.log("[1/5] Building NosCore image (from source, pinned commit)...");
    composeBuild();

    console.log("[2/5] Starting db...");
    compose("up", "-d", "db");
    await waitForLog("db", "ready to accept connections");

    console.log("[3/5] Starting login (runs EF migrations)...");
    compose("up", "-d", "login");
    await waitForLog("login", "Database has been initialized.");

    console.log("[4/5] Seeding account/character/map...");
    runSeed();

    console.log("[5/5] Starting master + world (world force-recreated so it reloads map data)...");
    compose("up", "-d", "master");
    compose("up", "-d", "--force-recreate", "world");
    await waitForLog("master", "S1-NosCore authenticated successfully!");
    await waitForLog("master", "LoginServer authenticated successfully!");
    await waitForLog("world", "Registered on MasterServer");
    await waitForLog("login", "Registered on MasterServer");

    console.log("Server stack is ready.");
}

function downServer() {
    console.log("Stopping server stack...");
    compose("down");
}

async function runDataImport() {
    console.log("[data] Fetching game data (OnexExplorerCli + Gameforge CDN)...");
    run("node", [path.join(__dirname, "fetch-data.mjs")]);

    console.log("[data] Running NosCore.Parser against the downloaded files...");
    const inputDir = path.join(__dirname, "data", "parser-input");
    const confDir = path.join(__dirname, "configuration");
    const res = spawnSync(
        "docker",
        [
            "run", "--rm",
            "--network", "test-server_noscore-e2e-network",
            "-e", "DB_HOST=noscore-e2e-db",
            "-v", `${inputDir}:/data`,
            "-v", `${confDir}:/configuration`,
            "noscore-e2e-stack",
            "NosCore.Parser.dll", "--folder", "/data",
        ],
        { stdio: "inherit" }
    );
    if (res.status !== 0) {
        // Parser exits non-zero when some optional files are missing (e.g. packet.txt
        // / npctalk i18n). Static data (maps, items, skills, monsters) is still imported.
        console.log("[data] WARN: parser exited non-zero (expected if optional files missing).");
    }

    console.log("[data] Restarting world so it reloads the imported data...");
    compose("up", "-d", "--force-recreate", "world");
    await waitForLog("world", "Registered on MasterServer");
}

async function main() {
    const [, , command] = process.argv;
    switch (command) {
        case "up":
            await upServer();
            break;
        case "down":
            downServer();
            break;
        case "seed":
            runSeed();
            break;
        case "data":
            compose("up", "-d", "db");
            await waitForLog("db", "ready to accept connections");
            compose("up", "-d", "login");
            await waitForLog("login", "Database has been initialized.");
            await runDataImport();
            break;
        case "e2e":
            await upServer();
            console.log("Running vitest...");
            try {
                run("npx", ["vitest", "run", "--config", path.join(__dirname, "..", "test", "e2e", "vitest.config.ts")]);
            } finally {
                if (!process.env.KEEP_SERVER) {
                    downServer();
                } else {
                    console.log("KEEP_SERVER set - leaving stack up.");
                }
            }
            break;
        default:
            console.error("Usage: node orchestrator.mjs <up|down|seed|data|e2e>");
            process.exit(1);
    }
}

main().catch((err) => {
    console.error("Orchestrator error:", err.message);
    process.exit(1);
});

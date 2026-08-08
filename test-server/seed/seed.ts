import { createHash } from "node:crypto";
import pg from "pg";

const { Client } = pg;

interface SeedConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    accountPassword: string;
}

const config: SeedConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_DATABASE || "noscore",
    accountPassword: process.env.SEED_PASSWORD || "testpass",
};

function sha512Hex(data: string): string {
    return createHash("sha512").update(data).digest("hex").toUpperCase();
}

async function waitForSchema(client: pg.Client, timeoutMs = 60000, pollMs = 1000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await client.query(
                `SELECT 1 FROM information_schema.tables WHERE table_name = 'Character'`
            );
            if (res.rows.length > 0) {
                return;
            }
        } catch {
            // db not ready yet
        }
        await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error("Timed out waiting for the Character table (schema migration)");
}

interface AccountSeed {
    name: string;
    password: string;
    authority: number;
    characterName: string;
}

// Safe spawn on map 1 (Nosville, 160x180): cell (79,116) is walkable.
const SPAWN = { mapId: 1, x: 79, y: 116 };

function buildMapData(width: number, height: number): Buffer {
    const buf = Buffer.alloc(4 + width * height);
    buf.writeInt16LE(width, 0);
    buf.writeInt16LE(height, 2);
    return buf;
}

// Minimal fallback maps, only inserted when the DB has no map data at all
// (fresh database before `npm run server:data`). When the NosCore parser has
// imported real maps they are left untouched.
async function ensureFallbackMaps(client: pg.Client): Promise<void> {
    const mapCount = await client.query(`SELECT count(*)::int AS n FROM "Map"`);
    if (mapCount.rows[0].n > 0) {
        return;
    }
    const data = buildMapData(200, 200);
    await client.query(
        `INSERT INTO "Map" ("MapId", "Name", "Data", "Music", "ShopAllowed")
         VALUES (1, 'E2E Test Map', $1, 0, false)`,
        [data]
    );
    // Old Nosville — required by MinilandService.GetMinilandPortals (it
    // hard-codes a miniland portal with SourceMapId 145).
    await client.query(
        `INSERT INTO "Map" ("MapId", "Name", "Data", "Music", "ShopAllowed")
         VALUES (145, 'E2E Old Nosville', $1, 0, false)`,
        [data]
    );
    await client.query(
        `INSERT INTO "Map" ("MapId", "Name", "Data", "Music", "ShopAllowed")
         VALUES (20001, 'E2E Miniland', $1, 0, false)`,
        [data]
    );
    console.log("[seed] WARN: no map data found — inserted minimal fallback maps. Run `npm run server:data` for full game data.");
}

async function insertAccount(client: pg.Client, account: AccountSeed): Promise<void> {
    const passwordHash = sha512Hex(account.password);

    const accountRes = await client.query(
        `INSERT INTO "Account"
            ("Authority", "Name", "Password", "Language", "BankMoney", "ItemShopMoney")
         VALUES ($1, $2, $3, 0, 0, 0)
         RETURNING "AccountId"`,
        [account.authority, account.name, passwordHash]
    );
    const accountId: number = accountRes.rows[0].AccountId;

    await client.query(
        `INSERT INTO "Character"
            ("ServerId", "AccountId", "Act4Dead", "Act4Kill", "Act4Points", "ArenaWinner",
             "Biography", "BuffBlocked", "Class", "Compliment", "Dignity", "Elo",
             "EmoticonsBlocked", "ExchangeBlocked", "ShouldRename", "Faction",
             "FamilyRequestBlocked", "FriendRequestBlocked", "Gender", "Gold",
             "GroupRequestBlocked", "HairColor", "HairStyle", "HeroChatBlocked",
             "HeroLevel", "HeroXp", "Hp", "HpBlocked", "JobLevel", "JobLevelXp",
             "Level", "LevelXp", "MapId", "MapX", "MapY", "MasterPoints",
             "MasterTicket", "MaxMateCount", "MinilandInviteBlocked", "MouseAimLock",
             "Mp", "Prefix", "Name", "QuickGetUp", "RagePoint", "Reput", "Slot",
             "SpAdditionPoint", "SpPoint", "State", "TalentLose", "TalentSurrender",
             "TalentWin", "WhisperBlocked")
         VALUES (0, $1, 0, 0, 0, 0, NULL, false, 0, 0, 0, 0, false, false, false,
                 0, false, false, 0, 0, false, 0, 0, false, 0, 0, 100, false, 1,
                 0, 1, 0, $2, $3, $4, 0, 0, 0, false, false, 100, NULL, $5, false,
                 0, 0, 0, 0, 0, 1, 0, 0, 0, false)`,
        [accountId, SPAWN.mapId, SPAWN.x, SPAWN.y, account.characterName]
    );

    console.log(
        `Seeded account "${account.name}" (authority ${account.authority}, hash ${passwordHash.slice(0, 16)}...), ` +
        `character "${account.characterName}" on map ${SPAWN.mapId} at (${SPAWN.x},${SPAWN.y}).`
    );
}

async function connectWithRetry(config: SeedConfig, attempts = 10, delayMs = 1500): Promise<pg.Client> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        const client = new Client({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
        });
        try {
            await client.connect();
            return client;
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw new Error(`Could not connect to postgres after ${attempts} attempts: ${String(lastErr)}`);
}

async function seed(): Promise<void> {
    const client = await connectWithRetry(config);
    await waitForSchema(client);

    // Pool of test accounts so tests can rotate and never collide on one account.
    const testAccountCount = parseInt(process.env.SEED_TEST_ACCOUNTS || "10");
    const accounts: AccountSeed[] = [];
    for (let i = 1; i <= testAccountCount; i++) {
        accounts.push({
            name: `test_${i}`,
            password: config.accountPassword,
            // GameMaster (2) — lets the bot use GM commands like $Position.
            authority: 2,
            characterName: `Test${i}`,
        });
    }
    accounts.push({
        name: process.env.SEED_ADMIN || "admin",
        password: process.env.SEED_ADMIN_PASSWORD || "admin",
        authority: 3,
        characterName: process.env.SEED_ADMIN_CHARACTER || "Admin",
    });

    try {
        await client.query("BEGIN");

        // The seed only (re)creates the test accounts + characters. All static
        // game data (Map, Item, NpcMonster, ...) imported by the NosCore parser
        // via `npm run server:data` is left untouched.
        await client.query(`TRUNCATE TABLE "Character" RESTART IDENTITY CASCADE`);
        await client.query(`TRUNCATE TABLE "Account" RESTART IDENTITY CASCADE`);

        await ensureFallbackMaps(client);

        for (const account of accounts) {
            await insertAccount(client, account);
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        await client.end();
    }
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});

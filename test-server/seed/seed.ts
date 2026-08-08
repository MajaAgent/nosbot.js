import { createHash } from "node:crypto";
import pg from "pg";

const { Client } = pg;

interface SeedConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    accountName: string;
    accountPassword: string;
    characterName: string;
    mapId: number;
    mapWidth: number;
    mapHeight: number;
}

const config: SeedConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_DATABASE || "noscore",
    accountName: process.env.SEED_ACCOUNT || "testbot",
    accountPassword: process.env.SEED_PASSWORD || "testpass",
    characterName: process.env.SEED_CHARACTER || "TestBot",
    mapId: parseInt(process.env.SEED_MAP_ID || "1"),
    mapWidth: parseInt(process.env.SEED_MAP_WIDTH || "40"),
    mapHeight: parseInt(process.env.SEED_MAP_HEIGHT || "40"),
};

function sha512Hex(data: string): string {
    return createHash("sha512").update(data).digest("hex").toUpperCase();
}

function buildMapData(width: number, height: number): Buffer {
    const buf = Buffer.alloc(4 + width * height);
    buf.writeInt16LE(width, 0);
    buf.writeInt16LE(height, 2);
    return buf;
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

    const mapData = buildMapData(config.mapWidth, config.mapHeight);
    const passwordHash = sha512Hex(config.accountPassword);
    const centerX = Math.floor(config.mapWidth / 2);
    const centerY = Math.floor(config.mapHeight / 2);

    try {
        await client.query("BEGIN");

        await client.query(
            `TRUNCATE TABLE "CharacterActPart", "CharacterQuest", "CharacterQuestObjective",
             "CharacterRelation", "CharacterSkill", "FamilyCharacter", "ItemInstance", "Mate",
             "Miniland", "QuicklistEntry", "Respawn", "StaticBonus", "StaticBuff", "Title",
             "Warehouse", "BazaarItem", "InventoryItemInstance", "Mail" RESTART IDENTITY CASCADE`
        );

        await client.query(`DELETE FROM "Character"`);
        await client.query(`DELETE FROM "Account"`);
        await client.query(`DELETE FROM "Map" WHERE "MapId" IN ($1, $2)`, [config.mapId, 20001]);

        await client.query(
            `INSERT INTO "Map" ("MapId", "Name", "Data", "Music", "ShopAllowed")
             VALUES ($1, $2, $3, $4, $5)`,
            [config.mapId, "E2E Test Map", mapData, 0, false]
        );

        await client.query(
            `INSERT INTO "Map" ("MapId", "Name", "Data", "Music", "ShopAllowed")
             VALUES (20001, 'E2E Miniland', $1, 0, false)`,
            [mapData]
        );

        const accountRes = await client.query(
            `INSERT INTO "Account"
                ("Authority", "Name", "Password", "Language", "BankMoney", "ItemShopMoney")
             VALUES (0, $1, $2, 0, 0, 0)
             RETURNING "AccountId"`,
            [config.accountName, passwordHash]
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
                     0, false, false, 0, 0, false, 0, 0, false, 0, 0, 100, false, 0,
                     0, 1, 0, $2, $3, $4, 0, 0, 0, false, false, 100, NULL, $5, false,
                     0, 0, 0, 0, 0, 1, 0, 0, 0, false)`,
            [accountId, config.mapId, centerX, centerY, config.characterName]
        );

        await client.query("COMMIT");

        console.log(
            `Seeded account "${config.accountName}" (password hash ${passwordHash.slice(0, 16)}...), ` +
            `character "${config.characterName}" on map ${config.mapId} at (${centerX},${centerY}).`
        );
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

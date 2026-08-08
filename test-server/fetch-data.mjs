import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const BIN_DIR = path.join(DATA_DIR, "bin");
const ARCHIVE_DIR = path.join(DATA_DIR, "archives");
const INPUT_DIR = path.join(DATA_DIR, "parser-input");
const ONEX_BIN = path.join(BIN_DIR, process.platform === "win32" ? "OnexExplorerCli.exe" : "OnexExplorerCli");

const ONEX_RELEASE = "v0.3.0";
const ONEX_ASSET =
    process.platform === "win32"
        ? "OnexExplorerCli-windows.exe"
        : process.platform === "darwin"
          ? "OnexExplorerCli-macos"
          : "OnexExplorerCli-linux";

const DATA_DAT_FILES = [
    "act_desc.dat",
    "BCard.dat",
    "Card.dat",
    "Item.dat",
    "monster.dat",
    "npctalk.dat",
    "Skill.dat",
    "quest.dat",
    "qstprize.dat",
    "tutorial.dat",
    "MapIDData.dat",
    "MapPointData.dat",
    "shoptype.dat",
];

function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
    if (res.status !== 0) {
        throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status}`);
    }
    return res;
}

function ensureDirs() {
    for (const dir of [DATA_DIR, BIN_DIR, ARCHIVE_DIR, INPUT_DIR, path.join(INPUT_DIR, "map")]) {
        mkdirSync(dir, { recursive: true });
    }
}

async function ensureOnexBinary() {
    if (existsSync(ONEX_BIN)) {
        console.log(`[data] Using existing OnexExplorerCli at ${ONEX_BIN}`);
        return;
    }
    console.log(`[data] Downloading OnexExplorerCli ${ONEX_RELEASE} (${ONEX_ASSET})...`);
    run("gh", [
        "release",
        "download",
        ONEX_RELEASE,
        "--repo",
        "GorlikItsMe/OnexExplorerCli",
        "--pattern",
        ONEX_ASSET,
        "--dir",
        BIN_DIR,
        "--clobber",
    ]);
    run("chmod", ["+x", ONEX_BIN]);
}

function onex(...args) {
    return spawnSync(ONEX_BIN, args, { stdio: "inherit" });
}

async function downloadArchives() {
    const archives = ["NSgtdData.NOS", "NStcData.NOS"];
    const missing = archives.filter((a) => {
        // downloaded files land under <ARCHIVE_DIR>/NostaleData/<name>
        return !existsSync(path.join(ARCHIVE_DIR, "NostaleData", a));
    });
    if (missing.length === 0) {
        console.log("[data] Archives already present, skipping download.");
        return;
    }
    console.log(`[data] Downloading archives from Gameforge CDN: ${missing.join(", ")}`);
    onex("download", "-o", ARCHIVE_DIR, ...missing);
}

function findArchive(name) {
    const root = path.join(ARCHIVE_DIR, "NostaleData", name);
    if (existsSync(root)) {
        return root;
    }
    const match = findFile(ARCHIVE_DIR, (f) => path.basename(f) === name);
    if (match) {
        return match;
    }
    throw new Error(`Archive ${name} not found under ${ARCHIVE_DIR}`);
}

function findFile(dir, predicate) {
    if (!existsSync(dir)) {
        return null;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && predicate(full)) {
            return full;
        }
        if (entry.isDirectory()) {
            const found = findFile(full, predicate);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

async function extractData() {
    console.log("[data] Extracting .dat files from NSgtdData.NOS...");
    const nsgtd = findArchive("NSgtdData.NOS");
    const tmpDat = path.join(DATA_DIR, "dat-extract");
    mkdirSync(tmpDat, { recursive: true });
    // .dat entries are TextDat/TextLst — not images — so they extract raw (no PNG conversion).
    onex("extract", nsgtd, "-o", tmpDat);
    for (const f of DATA_DAT_FILES) {
        const src = findFile(tmpDat, (p) => path.basename(p) === f);
        if (src) {
            copyFileSync(src, path.join(INPUT_DIR, f));
        } else {
            console.warn(`[data] WARN: ${f} not found in NSgtdData`);
        }
    }

    console.log("[data] Extracting map grids from NStcData.NOS...");
    const nstc = findArchive("NStcData.NOS");
    const tmpMaps = path.join(DATA_DIR, "maps-png");
    mkdirSync(tmpMaps, { recursive: true });
    onex("extract", nstc, "-o", tmpMaps);
}

function convertMapsToGrid() {
    console.log("[data] Converting map grids (PNG -> raw NSTC grid)...");
    const pngDir = path.join(DATA_DIR, "maps-png");
    const mapDir = path.join(INPUT_DIR, "map");
    const converter = path.join(__dirname, "png2grid.js");
    if (!existsSync(pngDir)) {
        throw new Error("No extracted map PNGs found — run extract first");
    }
    const pngs = readdirSync(pngDir).filter((f) => f.endsWith(".png"));
    for (const png of pngs) {
        const id = path.basename(png, ".png");
        const out = path.join(mapDir, id);
        const res = spawnSync("node", [converter, path.join(pngDir, png), out], { stdio: "inherit" });
        if (res.status !== 0) {
            throw new Error(`convert failed for ${png}`);
        }
    }
    console.log(`[data] Converted ${pngs.length} maps.`);
}

async function main() {
    ensureDirs();
    await ensureOnexBinary();
    await downloadArchives();
    await extractData();
    convertMapsToGrid();
    console.log(`\n[data] Done. Parser input ready at ${INPUT_DIR}`);
    console.log(`[data] Run the NosCore parser against this folder, e.g.:`);
    console.log(`  npm run server:data`);
}

main().catch((err) => {
    console.error("[data] error:", err.message);
    process.exit(1);
});

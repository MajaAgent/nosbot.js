export const testConfig = {
    auth: {
        type: "priv",
        login: process.env.SEED_ACCOUNT || "testbot",
        password: process.env.SEED_PASSWORD || "testpass",
    },
    loginServer: {
        ip: process.env.LOGIN_SERVER_IP || "127.0.0.1",
        port: parseInt(process.env.LOGIN_SERVER_PORT || "4000"),
    },
    worldServer: {
        ip: process.env.WORLD_SERVER_IP || "127.0.0.1",
        port: parseInt(process.env.WORLD_SERVER_PORT || "1337"),
    },
    selectCharacter: {
        byName: process.env.SEED_CHARACTER || "TestBot",
    },
    game: {
        installationId: "00000000-0000-0000-0000-000000000000",
        nostaleClientXVersion: "0.9.3.3087",
        nostaleClientXMd5Hash: "x",
        nostaleClientMd5Hash: "x",
    },
} as const;

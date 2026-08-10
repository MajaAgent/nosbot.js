import { createLogger } from "../logger";
import type { NostaleBotConfig } from "../NostaleBot";
import { PacketNsTeST, PacketNsTeST_Channel } from "../PacketHandler/nstest";
import {
    createLoginPacketNos0577,
    createLoginPacketPrivServer,
} from "../utils/createLoginPacket";

const logger = createLogger("NostaleBot");

/** Builds the login packet for the configured auth type (priv / NoS0577 / custom). */
export function createLoginPacket(config: NostaleBotConfig): string {
    const auth = config.auth;
    const game = config.game;
    if (auth.type == "priv") {
        return createLoginPacketPrivServer(
            auth.login,
            auth.password,
            game.installationId,
            game.nostaleClientXMd5Hash,
            game.nostaleClientMd5Hash,
            game.nostaleClientXVersion
        );
    } else if (auth.type == "custom") {
        return auth.customLoginPacket;
    } else if (auth.type == "NoS0577_with_token") {
        return createLoginPacketNos0577(
            auth.token,
            game.installationId,
            game.nostaleClientXMd5Hash,
            game.nostaleClientMd5Hash,
            game.nostaleClientXVersion
        );
    }
    throw new Error(`Not implemented, login for bot auth.type`);
}

/** Returns the IP and PORT of the channel to connect to, from the NsTeST channel list. */
export function pickWorldServer(
    worldServer: NostaleBotConfig["worldServer"],
    nstest: PacketNsTeST
): [string, number] {
    function conMsg(chan: PacketNsTeST_Channel) {
        return `Connecting to WorldServer ${chan.name} CH:${chan.channelId} (${chan.ip}:${chan.port})...`;
    }

    if ("ip" in worldServer && "port" in worldServer) {
        const chan = nstest.channels.find(
            (v) => v.ip === worldServer.ip && v.port === worldServer.port
        );
        if (chan) {
            logger.info(conMsg(chan));
            return [chan.ip, chan.port];
        }
        logger.info(`Connecting to WorldServer (${worldServer.ip}:${worldServer.port})...`);
        return [worldServer.ip, worldServer.port];
    }

    const recommendedWorldId = nstest.channels.find(
        (a) => worldServer.byServerName && a.name.startsWith(worldServer.byServerName)
    );

    if ("channelId" in worldServer) {
        const pickChannelId = worldServer.channelId;

        // pick channel by id
        const channelList = nstest.channels.filter((v) => {
            if (recommendedWorldId) {
                return v.channelId == pickChannelId && v.worldId == recommendedWorldId.worldId;
            }
            return v.channelId == pickChannelId;
        });
        if (channelList.length > 1) {
            const uniqueWorldNames = Array.from(new Set(channelList.map((a) => a.name)));
            logger.error(
                `Multiple channels with id ${pickChannelId} found. You should add worldServer.byServerName to the config\n
                Posible servers: ${uniqueWorldNames.join(", ")}`
            );
            throw new Error(`Multiple channels with id ${pickChannelId} found. You should add worldServer.byServerName to the config\n
            Posible servers: ${uniqueWorldNames.join(", ")}`);
        }
        if (channelList.length === 0) {
            logger.error(`Channel with id ${pickChannelId} not found. Here is a list of all channels:\n
            ${nstest.channels
                .map((a) => `${a.worldId} ${a.name} Ch:${a.channelId} (${a.ip}:${a.port})`)
                .join("\n")}`);
            throw new Error(`Channel with id ${pickChannelId} not found`);
        }

        const foundChannel = channelList[0];
        logger.info(conMsg(foundChannel));
        return [foundChannel.ip, foundChannel.port];
    }

    throw new Error("Unexpected error, check your config.worldServer settings");
}

/** Returns the character id used in the `select` packet. Falls back to the first character. */
export function selectCharacter(
    selectCharacterConfig: NostaleBotConfig["selectCharacter"],
    characterList: { id: number; name: string }[]
): number {
    if (selectCharacterConfig == undefined) {
        logger.warn("You have not selected a character to log. I will choose the first one");
        return characterList[0].id;
    } else if ("byId" in selectCharacterConfig) {
        const charById = characterList.find((a) => a.id === selectCharacterConfig.byId);
        if (charById) {
            return charById.id;
        } else {
            logger.warn(
                `Character with id ${selectCharacterConfig.byId} dont exits. Picking first one...`
            );
            return characterList[0].id;
        }
    } else if ("byName" in selectCharacterConfig) {
        const charByName = characterList.find(
            (a) => a.name.toLowerCase() === selectCharacterConfig.byName.toLowerCase()
        );
        if (charByName) {
            return charByName.id;
        } else {
            logger.warn(
                `Character with id ${selectCharacterConfig.byName} dont exits. Picking first one...`
            );
            return characterList[0].id;
        }
    } else {
        logger.warn("You have not selected a character to log. I will choose the first one");
        return characterList[0].id;
    }
}

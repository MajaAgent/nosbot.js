import type { NostaleBot } from "../NostaleBot";
import { generateEmojiPacket, NostaleEmoji } from "../features/emoji";

declare module "@gorlikitsme/nosbot.js" {
    interface NostaleBot {
        emoji: EmojiApi;
    }
}

export interface EmojiApi {
    /** Sends the given emoji (e.g. `bot.emoji.use(NostaleEmoji.AltW)`). */
    use(emojiId: NostaleEmoji): void;
}

export const emojiPlugin = (bot: NostaleBot): void => {
    bot.decorate("emoji", {
        use: (emojiId: NostaleEmoji): void => {
            bot.sendPacket(generateEmojiPacket(bot.self.id, emojiId));
        },
    });
};

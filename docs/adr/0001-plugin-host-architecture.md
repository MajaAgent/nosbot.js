# 0001 — Plugin-host architecture

The bot is a fastify-style plugin host: a minimal core (connection, login, packet routing, and the self-state `bot.self`) plus plugins that decorate it. A plugin is a factory `(bot, opts)` registered with `bot.use(plugin, opts)`; it decorates the bot directly under one name (`bot.decorate("pathfinding", { methods, state })`), observes packets via `bot.onPacket`, and registers `onLogin`/`onClose` hooks. User-facing types flow through declaration merging (`interface NostaleBot`, `interface BotEvents`).

We chose this because building pathfinding, equipment management, and combat as separate systems demanded a seam the monolithic `NostaleBot` class didn't have. The reverse-engineered wire layer (crypto, transport, framing) is kept as-is and excluded from the re-architecture.

# nosbot.js

A Node.js library for building Nostale private-server bots. The bot is a fastify-style plugin host: a minimal core plus typed plugins that decorate it.

## Language

**Bot**:
The object a user constructs with a config; hosts plugins and exposes the user-facing surface.
_Avoid_: client, character

**Core**:
The bot's built-in base: connection, login, packet routing, and the self-state. Everything else is a plugin.
_Avoid_: base class, framework

**Plugin**:
A fastify-style factory function `(bot, opts)` that extends the bot by decorating it, observing packets, and registering hooks.
_Avoid_: addon, module, feature

**Decorate**:
To attach a plugin's surface (its methods and state) to the bot under one name, e.g. `bot.pathfinding`.
_Avoid_: register (for attaching methods), plugin API

**Self-state**:
The core's model of the player's own identity and position: id, name, mapId, x, y, speed. Exposed as `bot.self`.
_Avoid_: currentCharacter, bot state

**Packet observer**:
A plugin callback that runs for every received packet; plugins may observe any packet, none own it.
_Avoid_: packet handler, listener

**Hook**:
A plugin-registered lifecycle callback — `onLogin` (awaited before the world connection) and `onClose`.

**LoginServer**:
The server that authenticates the account and returns the NsTeST packet.

**WorldServer**:
The server that hosts a channel; where gameplay happens.

**Channel**:
A WorldServer instance identified by worldId and channelId.

**NsTeST**:
The login-server response listing the sessionId and available channels.

**failc**:
The login failure packet, carrying a numeric error id (e.g. wrong password, ban).

**priv auth**:
Login by account name and password (NoS0575 handshake).
_Avoid_: normal auth

**Walk**:
Player movement over map tiles, driven by `walk` packets.

**WalkGrid**:
The walkable cells of a map, used by pathfinding.

**Map shadow**:
The walkability image for a map (white pixels are walkable); the current grid source.
_Avoid_: map image, terrain

**GM command**:
A server console command sent by the bot (e.g. `$Teleport`), requiring GameMaster authority.

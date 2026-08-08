# 02 — Does NosCore support the `priv` login flow as nosbot.js implements it?

Type: research
Status: resolved
Blocked by:

## Question

Does NosCore accept a plain `priv` (login + password) login the way nosbot.js sends it, without a token?

Read NosCore's login flow (NosCore.Core / login handlers, `NsTeST` / `failc`, world server handshake) and compare with nosbot.js:
- `src/NostaleBot.ts` (`login()`)
- `src/modules/login.ts` (`sendLoginPacket`, `pickWorldServer`, `selectCharacter`)
- `src/utils/createLoginPacket.ts`
- crypto streams under `src/nostaleCryptography/client/`

Specifically:
- What login packet format does NosCore expect vs what the bot sends for `priv`?
- Does NosCore validate client version / MD5 hashes (bot sends `nostaleClientXVersion: "0.9.3.3087"` and hash strings)? Does that need to match a server setting?
- Does the bot's world-server handshake (session id, `login ORG 0`, password, `clist`, `select`, `OK`) match NosCore's?
- Any server config that must be set for the bot to connect (e.g. encryption type, packet language)?

Output: findings file + a compatibility verdict (works / needs X config / impossible).

## Answer

Compatible — `priv` = NoS0575 packet, handled by NosCore's NoS0575PacketHandler (needs `EnforceNewAuth: false`, the default). Account must have `Password` = uppercase SHA512 hex of the plaintext; `Name` matching exactly what the bot sends; default authority. ClientVersion/Md5String checks are skipped when unset in config, so the bot's `0.9.3.3087` + hashes pass. World handshake (`clist`/`select`/`OK`/`game_start`) matches. Bot `worldServer` → 127.0.0.1:1337. Full detail in `research/02-noscore-priv-login-compat.md`.


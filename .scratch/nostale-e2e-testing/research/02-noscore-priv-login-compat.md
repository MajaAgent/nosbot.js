# Research 02 — Does NosCore support the `priv` login flow as nosbot.js implements it?

## Verdict

**Yes — compatible, with one server-side requirement.** nosbot.js's `priv` auth sends a `NoS0575` login packet; NosCore has a `NoS0575PacketHandler` for exactly that flow (when `EnforceNewAuth: false`, the default). The account record must have `Password` = SHA512 hex (uppercase) of the plaintext password, matching what the bot computes. No client-version/MD5 check fires unless the server config sets them.

## Facts

- nosbot.js `priv` → `createLoginPacketPrivServer` emits `NoS0575 <rand> <login> <sha512(password)> <installationId> <rand2> 0\x0b<version> 0 <md5hash>`. (`src/utils/createLoginPacket.ts` line 26)
- NosCore `NoS0575PacketHandler` runs `loginService.LoginAsync(packet.Username, packet.Md5String, packet.ClientVersion, session, packet.Password, false, ...)` **only when `!EnforceNewAuth`**. (`src/NosCore.PacketHandlers/Login/NoS0575PacketHandler.cs` lines 26–31; `LoginConfiguration.EnforceNewAuth` defaults false.)
- Password check: `!string.Equals(acc.Password?.ToUpper(), passwordToken, StringComparison.Ordinal)` — compares the **DB account password (uppercased)** against the packet token, which is the bot's `sha512(password)` (already uppercase hex from `src/utils/hash.ts`). So DB stores SHA512 hex of the password, and plaintext used at login must hash-match. (`LoginService.cs` line 73)
- ClientVersion/Md5String checks are **skipped when null**: `if ((loginConfiguration.Value.ClientVersion != null) && ...)` — with default config (no `ClientVersion`/`Md5String` set in `login.yml`) the bot's `0.9.3.3087` + md5 hash are accepted. (`LoginService.cs` lines 43–53)
- Account lookup is case-sensitive-ish: `acc.Name != username` → `failc` WrongCaps if the DB name differs in case from what the bot sends. (`LoginService.cs` lines 60–70) — seed the account with exactly the login string the bot uses.
- Authority: `Banned` → failc Banned; `Closed`/`Unconfirmed` → failc CantConnect; default authority proceeds. (`LoginService.cs` lines 83–98)
- Success path: emits `NsTeST` with channels; world handshake afterwards is standard `clist`/`select`/`OK`/`game_start`, which nosbot.js's `login()` already implements. (`LoginService.cs` lines 135–186)
- NoS0577 (token) is the newer flow (AuthController `/api/v1/auth/*` + awaiting-connection) — NOT needed for priv.

## Bot-side notes

- No bot changes required. Only the account row must exist with the right password hash + name + authority.
- World-server selection: nosbot.js matches `worldServer.ip/port` against NsTeST channels (`src/modules/login.ts` lines 48–58). With `world.yml` `DisplayHost: 127.0.0.1, DisplayPort: 1337`, set bot config `worldServer { ip: "127.0.0.1", port: 1337 }`.

# Research 03 — How to seed a test account + character in NosCore's database?

## Verdict

Seed directly via SQL against the PostgreSQL container (user `postgres`/pass `password`, db `noscore`): one `Account` row (Password = uppercase SHA512 hex of the plaintext), one `Character` row on a map, plus a minimal `Map` row with a hand-built walkable grid. **No game-client parser needed** — a tiny map's grid is just a `byte[]` where width/height are the first two Int16s and walkable cells are `0`.

## Facts

- Account entity: `AccountId` (key), `Name` (required), `Password`, `Authority`, `Email`, `Language`, `BankMoney`, `ItemShopMoney`, timestamps. (`src/NosCore.Database/Entities/Account.cs`)
- Password format: server compares `acc.Password.ToUpper()` vs the bot's packet token = SHA512 hex (uppercase) of plaintext (`LoginService.cs` line 73; `src/utils/hash.ts` sha512 uppercases). **Seed `Password` = uppercase SHA512 hex of the plaintext.**
- Authority: default enum value proceeds; `Banned`/`Closed`/`Unconfirmed` rejected (`LoginService.cs` lines 83–98). Use e.g. `GameMaster` or default (`AuthorityType` in `NosCore.Shared.Enumerations`).
- Character entity: `CharacterId` (key), `AccountId`, `Name` (required), `ServerId`, `Class`, `Gender`, `MapId`, `MapX`, `MapY`, `Level`, `JobLevel`, `Hp`, `Mp`, `Gold`, `State`, `Slot`, plus many defaults. (`src/NosCore.Database/Entities/Character.cs`) — `State` must be `Active` (`CharacterState.Active`) for the char to count in clist (LoginService.cs lines 168–170).
- Character must belong to a `MapId` that exists and matches the char's `ServerId` (LoginService counts active chars per serverId).
- Map entity: `MapId` (key, Int16), `Name` (required), `Data` (`byte[]`), `Music`, `ShopAllowed`. (`src/NosCore.Database/Entities/Map.cs`)
- Map grid format (`src/NosCore.GameObject/Map/Map.cs`): `Data[0..2]` = width Int16, `Data[2..4]` = height Int16, then row-major cells; walkable = `0`, `2`, or `16..19` (line 122–125). A width×height array of zeros = fully walkable minimal map. Character MapX/MapY must be within bounds and on walkable cells.
- `MapInstanceGeneratorService.InitializeAsync` loads all maps + their NPC/monster/portal tables at world startup (`MapInstanceGenerationService.cs` lines 63–126) — empty NPC/monster/portal tables are fine (guarded by TryGetValue).
- Migrations run automatically on login-server boot (`LoginServer.cs` line 40) → schema exists before we seed. Seeding must happen **after** migration, e.g. on a `pg_isready` + one-time bootstrap.
- No registration endpoint needed: account row alone is enough for the priv flow (research 02). WebApi `AuthController` exists but is for the NoS0577/token flow.

## Recommended seed script shape

A small script (node or SQL file) run against the `noscore` DB after postgres is healthy:
1. INSERT `Map` (e.g. MapId 1, Name "Test", Data = width/height + zeros grid, e.g. 40×40).
2. INSERT `Account` (Name = bot login, Password = SHA512-hex uppercase of plaintext, Authority = GameMaster/default).
3. INSERT `Character` (Name, AccountId, ServerId=0, MapId=1, MapX/MapY center, State=Active, Hp/Mp full, Level 1).
Live in `test-server/seed/`, idempotent (ON CONFLICT / delete-then-insert).

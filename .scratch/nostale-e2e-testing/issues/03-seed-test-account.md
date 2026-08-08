# 03 — How to seed a test account + character in NosCore's database?

Type: research
Status: resolved
Blocked by:

## Question

NosCore uses EF Core + PostgreSQL. To run the login test we need a `priv` account with a character that can enter the game:

- What tables/schema back accounts and characters?
- What password hashing does NosCore use for `priv` accounts — can we compute it, or must an account be created through a server path (registration API / command / WebAPI) so the hash is right?
- What data must a character have (map, position, class, level, inventory, etc.) to exist and let a client join?
- Is there an existing seed script, admin command, or WebAPI endpoint to create accounts/characters?
- Where do we get required static data (maps/items) — is there a data import step?

Output: findings file with a concrete seeding approach (SQL insert vs API call), the field list, and where in `test-server/` the seed script should live.

## Answer

Seed via SQL after postgres is healthy (schema auto-migrates on login boot): one `Map` row with hand-built grid (`Data` byte[]: width+height Int16 then row-major cells; `0` = walkable), one `Account` (Password = uppercase SHA512 hex, default authority), one `Character` (AccountId, ServerId 0, MapId, MapX/MapY walkable, State Active). No game-client parser needed. Full detail in `research/03-seed-test-account.md`.


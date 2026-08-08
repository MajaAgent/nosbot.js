# Map: Nostale E2E Testing Harness

## Destination

A one-command E2E test setup in this repo (fork `MajaAgent/nosbot.js`, branch `wayfinder/nostale-testing`): `npm run test:e2e` boots NosCore + its database in Docker (using their docker-compose/images), a seed script creates a test account, Vitest runs a login test where the bot connects via `priv` auth and reaches in-game. Green = server up + bot connected + a test-authoring system in place. A debug variant (`npm run server:up`/`server:down`) brings the stack up manually for bot debugging.

## Notes

- Domain: Nostale private-server protocol. Bot under test is nosbot.js (this repo); server is NosCore (C#/.NET 10, PostgreSQL, EF Core, SuperSocket, WebAPI).
- Skills: `/research` for fact-finding (NosCore runtime, protocol compat, DB seeding); `/grilling` for harness-design decisions.
- This effort **carries execution**: the destination is the working harness + green login test, not just a spec. The final ticket (05) builds the minimal slice.
- Constraint (user, Q9): the bot is assumed correct. Bot bug fixes are **out of scope** — if testing reveals a bot-side bug, report it as a separate topic, don't fix here.
- Constraint (user, Q10): local-only for now. CI is out of scope for this effort.
- Auth: use `priv` (login + password) for the seeded test account (user, Q12).
- Test runner: Vitest, updating TypeScript if needed (user, Q5). Tests are plain test files using the bot API + events (user, Q8).

## Decisions so far

- [01 — How does NosCore run in Docker?](issues/01-noscore-docker-runtime.md) — **CORRECTED by 05**: prebuilt Docker Hub images are stale (net9, old schema) and fail on character select. The stack must be **built from source** (net10, current master, pinned commit `20e5990`) via our own Dockerfile. Readiness from Serilog stdout logs; schema auto-migrates on login boot. Detail in `research/01-noscore-docker-runtime.md`.
- [02 — Does NosCore support the `priv` login flow as nosbot.js implements it?](issues/02-noscore-priv-login-compat.md) — compatible; `priv` = NoS0575, account Password = uppercase SHA512 hex, no bot changes needed. Detail in `research/02-noscore-priv-login-compat.md`.
- [03 — How to seed a test account + character in NosCore's database?](issues/03-seed-test-account.md) — SQL seed of Map (hand-built walkable grid) + Account + Character after migration; no game-client parser needed. Map 20001 (miniland) is also required by `MinilandService`. Detail in `research/03-seed-test-account.md`.
- [04 — Harness shape: one command + debug variant + Vitest + TS upgrade](issues/04-harness-shape.md) — `test-server/` + `test/e2e/`; `npm run test:e2e` (build→up→wait-ready→seed→vitest→down) + `server:up/down`; orchestrator waits for login "Database has been initialized" then starts master+world; readiness = master "authenticated" + world "Registered on MasterServer"; TS bumped to 5.x; node `pg` seed, idempotent (TRUNCATE CASCADE); fixed creds in `test/e2e/config.ts`; teardown in try/finally with `KEEP_SERVER=1`; Vitest testTimeout 30s.
- [05 — Login smoke spike: the green test](issues/05-login-smoke-spike.md) — **destination reached**: `npm run test:e2e` is green. Builds NosCore from source, boots the stack, seeds, bot logs in via `priv` and reaches in-game, tears down. Test retries login (10×/2s) to absorb world-channel propagation; orchestrator awaits every `waitForLog`.

## Not yet specified

- Additional test scenarios beyond login (`walkTo`, `useEmoji`, event assertions) — the authoring system's whole point, but not this destination.
- Multi-bot / parallel test sessions against one server.

## Out of scope

- CI / GitHub Actions — consciously deferred (user Q10: local only for now). The harness is now green locally, so CI is a natural **fresh effort** if the destination is redrawn — returns then, not as a resumption.
- Bot bug fixes surfaced by tests (user Q9: bot assumed correct).
- Pathfinding for `walkTo` (already documented as unimplemented in `src/NostaleBot.ts`).

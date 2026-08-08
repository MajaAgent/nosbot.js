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

- [01 — How does NosCore run in Docker?](issues/01-noscore-docker-runtime.md) — prebuilt Docker Hub images exist; run db+reverse-proxy+master+world+login via our own compose, schema auto-migrates, readiness from logs. Detail in `research/01-noscore-docker-runtime.md`.
- [02 — Does NosCore support the `priv` login flow as nosbot.js implements it?](issues/02-noscore-priv-login-compat.md) — compatible; `priv` = NoS0575, account Password = uppercase SHA512 hex, no bot changes needed. Detail in `research/02-noscore-priv-login-compat.md`.
- [03 — How to seed a test account + character in NosCore's database?](issues/03-seed-test-account.md) — SQL seed of Map (hand-built walkable grid) + Account + Character after migration; no game-client parser needed. Detail in `research/03-seed-test-account.md`.

## Not yet specified

- Additional test scenarios beyond login (`walkTo`, `useEmoji`, event assertions) — the authoring system's whole point, but not this destination.
- Multi-bot / parallel test sessions against one server.
- Exact harness wiring (readiness poll on which signal, compose overrides for prebuilt images) — lands in 04 once 01–03 feed the grilling.

## Out of scope

- CI / GitHub Actions — consciously deferred (user Q10: local only for now). Returns only as a fresh effort if the destination is redrawn.
- Bot bug fixes surfaced by tests (user Q9: bot assumed correct).
- Pathfinding for `walkTo` (already documented as unimplemented in `src/NostaleBot.ts`).

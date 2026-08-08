# 04 — Harness shape: one command + debug variant + Vitest + TS upgrade

Type: grilling
Status: resolved
Blocked by: 01, 02, 03

## Question

Lock the concrete layout of the test harness, given the facts from 01–03:

- Folder structure: `test-server/` (docker-compose, seed script, config) + `test/e2e/` (Vitest test files)?
- One-command UX: `npm run test:e2e` = docker up → wait for ready → seed → run Vitest → teardown. Debug variant: `npm run server:up` / `server:down` to keep the stack alive.
- How is "server ready" detected (depends on facts from 01)?
- Config wiring: bot pointed at `localhost` login/world ports; env or config file?
- Vitest setup; whether/which TypeScript bump is needed (repo is TS 4.8.2, Vitest may require newer).

Blocked on 01–03: the answers to those facts shape the exact wiring. Decide via grilling once they land.

## Answer

Decided by grilling (all Qs answered "a"):
- Folders: `test-server/` (compose + configuration + seed) + `test/e2e/` (Vitest test files).
- Commands: `npm run test:e2e` = full cycle (up → wait ready → seed → vitest → down); `npm run server:up` / `server:down` for debug.
- Startup order: orchestrator script waits for login logs ("Database has been initialized"), then starts master + world (fixes the race found in the docker spike).
- Readiness: wait for world log "Listening Port 1337", then seed, then run tests.
- TypeScript: bump to 5.x in devDependencies (Vitest requirement).
- Seed: node script `test-server/seed/` using `pg`, computes SHA512 at runtime, idempotent (delete-then-insert); runs only inside `test:e2e`.
- Test creds: fixed values in `test/e2e/config.ts` (login 4000 / world 1337, short login+password).
- Teardown: `test:e2e` always `down` in try/finally; `KEEP_SERVER=1` env leaves it up for debugging.
- Vitest: `testTimeout: 30000`.

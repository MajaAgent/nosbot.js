# 04 — Harness shape: one command + debug variant + Vitest + TS upgrade

Type: grilling
Status: open
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

<!-- filled on resolution -->

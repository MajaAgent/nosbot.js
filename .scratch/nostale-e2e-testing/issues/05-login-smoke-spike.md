# 05 — Login smoke spike: the green test

Type: prototype
Status: resolved
Blocked by:

## Question

Build the minimal working slice that confirms the assumption (user Q9: the bot logs into NosCore without bot changes):

- Docker stack up (from 01), account seeded (from 03), bot connects via `priv` (02).
- `bot.login()` resolves success, bot reaches in-game (`OK` → `game_start`).
- One Vitest test file: "bot logs in and reaches in-game".
- Skeleton of the test-authoring system (how future tests are written).

This IS the destination's green E2E login test. If it reveals a bot bug, stop and report it as a separate topic — do not fix the bot here.

## Answer

Green E2E achieved: `npm run test:e2e` builds NosCore from source (pinned commit `20e5990`), boots db+login+master+world, seeds account/character/maps, runs Vitest, bot logs in via `priv` and reaches in-game (`OK` → `game_start` → `tit`), then tears down. Test passed (4s), idempotent, exit 0.

Key findings during the spike:
- **Prebuilt Docker Hub images are stale** (net9, older DB schema) and FAIL on character select. Building from source (net10, current master) works — the stack must be built, not pulled.
- Startup order matters: login must run EF migrations before master/world boot (they crash on missing tables otherwise).
- A hand-built map (width/height Int16 + zero grid) + map 20001 (miniland, required by `MinilandService`) + account (uppercase SHA512 hex password) + character (State Active, Slot 0) is sufficient — no game-client parser needed.
- Server readiness is "eventually consistent": the test retries login up to 10x (2s apart) to absorb the world-channel propagation delay.
- Orchestrator must `await` every `waitForLog` (a missing await caused the earlier "Timed out waiting for db" after teardown).
- The seed is idempotent via `TRUNCATE ... CASCADE` on character-dependent tables.

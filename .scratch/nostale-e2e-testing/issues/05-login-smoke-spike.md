# 05 — Login smoke spike: the green test

Type: prototype
Status: open
Blocked by: 04

## Question

Build the minimal working slice that confirms the assumption (user Q9: the bot logs into NosCore without bot changes):

- Docker stack up (from 01), account seeded (from 03), bot connects via `priv` (02).
- `bot.login()` resolves success, bot reaches in-game (`OK` → `game_start`).
- One Vitest test file: "bot logs in and reaches in-game".
- Skeleton of the test-authoring system (how future tests are written).

This IS the destination's green E2E login test. If it reveals a bot bug, stop and report it as a separate topic — do not fix the bot here.

## Answer

<!-- filled on resolution -->

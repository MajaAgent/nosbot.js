# 01 — How does NosCore run in Docker?

Type: research
Status: resolved
Blocked by:

## Question

What does it take to run NosCore in Docker on this machine? Inspect `NosCoreIO/NosCore`'s `docker-compose.yml`, `deploy/`, `scripts/`, `configuration/`:

- Which services/images does the compose file define (NosCore + PostgreSQL?)?
- Do prebuilt Docker images exist (Docker Hub / GHCR), or must we build from source?
- Which ports are exposed (login, world/channels, WebAPI)?
- What configuration files / env vars / secrets does the server need on first run?
- What first-run steps are required (EF migrations, data parse/import)?
- Does it run headless / produce log output we can use for readiness detection?

Output: a findings file with concrete facts and a recommendation for our compose setup in `test-server/`.

## Answer

Prebuilt images exist on Docker Hub (`noscoreio/noscore.{world,login,master}server:latest` + `noscoreio/noscore.reverseproxy:latest`) — all pulled OK. Compose stack: db (postgres:17.2, port 5432) + reverse-proxy (4000/1337) + master (5000) + world (1337) + login (4000). Schema auto-migrates on login boot. Config via `configuration/*.yml` with env placeholders (`DB_HOST`, `WEBAPI_HOST`, `WORLD_PORT`, `LOGIN_PORT`...). Full detail in `research/01-noscore-docker-runtime.md`. Recommendation: our own compose using the prebuilt images (avoid .NET 10 host build); mount `configuration/`; readiness from Serilog stdout logs.


# Research 01 — How does NosCore run in Docker?

## Verdict

**CORRECTED by ticket 05.** Prebuilt Docker Hub images (`noscoreio/noscore.{world,login,master}server:latest`) are **stale**: they are built from an older .NET 9-era source, ship an older DB schema, and **fail on character select** (swallow exceptions, throw on newer migrations). The working approach is to **build NosCore from source** (net10.0, current master, pinned commit) into our own image, and run db + master + world + login via our own compose.

## Facts (prebuilt images)

- Compose defines 5 services: `db` (`postgres:17.2-alpine3.21`, port 5432, db `noscore`, user/pass `postgres`/`password`), `reverse-proxy` (image `noscoreio/noscore.reverseproxy:latest`, ports 4000+1337), `master` (build, port 5000), `world` (build, ports 5001+1337), `login` (build, port 4000). — `docker-compose.yml`
- Master/world/login Dockerfiles are `deploy/Dockerfile-{master,world,login}`; they `COPY ./build/net10.0` — i.e. they expect a **host-side `dotnet publish` output** to be baked in (and the compose mounts that dir as a volume too). — `deploy/Dockerfile-world` line 24, `docker-compose.yml` volumes.
- CI (`gh workflow .github/workflows/dotnet.yml`) builds and pushes these images to Docker Hub as `noscoreio/noscore.*server:latest` on every master push. All four images pulled OK locally — but see the corrected verdict: the Hub images are not current.
- Config: `configuration/*.yml` — `login.yml`, `world.yml`, `master.yml`, `api.yml`, `parser.yml`, `database.yml`, `logger.yml`. Env-overridable via `${VAR,default}` placeholders (e.g. `DB_HOST`, `MASTER_HOST`, `WEBAPI_HOST`, `WORLD_PORT`, `LOGIN_PORT`, `HOST`). DB creds default to `postgres`/`password`/`noscore`. — `configuration/world.yml`
- Ports: login `4000`, world `1337`, master `5000` (WebAPI), world WebAPI `5001`.
- Migrations: `LoginServer` calls `context.Database.MigrateAsync()` on boot — **schema auto-migrates; no manual migration step needed** (LoginServer.cs line 40). Parser also migrates (`ParserBootstrap.cs` line 76).
- Logging: Serilog console sink at Debug level (`configuration/logger.yml`) → **readiness detectable from stdout logs**.
- Parser (`NosCore.Parser`) is a **separate executable** that imports game static data (maps, items, monsters...) from a client folder via `--folder`. It is NOT required for the server to boot — maps/items can be seeded directly into the DB (see research 03).
- Config lookup: `ConfiguratorBuilder.InitializeConfiguration` uses `SetBasePath(AppDomain.BaseDirectory + "../../configuration")` — the config dir is **two levels up from the app binaries** (`configuration/world.yml`, `master.yml`, etc. alongside the built DLLs' parent). We mount `./configuration/:/configuration` with `WORKDIR /app`.
- `dotnet publish -r linux-musl-x64` produces the output the official Dockerfiles expect; requires .NET 10 SDK. Building from source is slow (SDK + 3 images) but necessary.

## Recommendation for our `test-server/` (as built in 05)

Our own `Dockerfile` clones NosCore (pinned commit `20e5990`), publishes world+login+master with the SDK 10 image, and runs them on the aspnet 10 runtime image (with `icu-libs`). Our `compose.yaml` uses that one image with different `command` per service, mounting `./configuration/:/configuration`. No reverse-proxy (the bot connects directly; NsTeST advertises world via DisplayHost/DisplayPort).

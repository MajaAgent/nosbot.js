# Research 01 — How does NosCore run in Docker?

## Verdict

NosCore ships a working `docker-compose.yml` that runs the full stack: **PostgreSQL + reverse-proxy + master + world + login**. Prebuilt images **do exist on Docker Hub** (`noscoreio/noscore.{world,login,master}server:latest` + `noscoreio/noscore.reverseproxy:latest`) and pull successfully. The compose file builds from source by default (mounting `./build/net10.0` from the host), but we can override to use the prebuilt images directly.

## Facts

- Compose defines 5 services: `db` (`postgres:17.2-alpine3.21`, port 5432, db `noscore`, user/pass `postgres`/`password`), `reverse-proxy` (image `noscoreio/noscore.reverseproxy:latest`, ports 4000+1337), `master` (build, port 5000), `world` (build, ports 5001+1337), `login` (build, port 4000). — `docker-compose.yml`
- Master/world/login Dockerfiles are `deploy/Dockerfile-{master,world,login}`; they `COPY ./build/net10.0` — i.e. they expect a **host-side `dotnet publish` output** to be baked in (and the compose mounts that dir as a volume too). — `deploy/Dockerfile-world` line 24, `docker-compose.yml` volumes.
- CI (`gh workflow .github/workflows/dotnet.yml`) builds and pushes these images to Docker Hub as `noscoreio/noscore.*server:latest` on every master push. All four images pulled OK locally — prebuilt images are current.
- Config: `configuration/*.yml` — `login.yml`, `world.yml`, `master.yml`, `api.yml`, `parser.yml`, `database.yml`, `logger.yml`. Env-overridable via `${VAR,default}` placeholders (e.g. `DB_HOST`, `MASTER_HOST`, `WEBAPI_HOST`, `WORLD_PORT`, `LOGIN_PORT`, `HOST`). DB creds default to `postgres`/`password`/`noscore`. — `configuration/world.yml`
- Ports: login `4000`, world `1337`, master `5000` (WebAPI), world WebAPI `5001`. Reverse-proxy also listens 4000+1337.
- Migrations: `LoginServer` calls `context.Database.MigrateAsync()` on boot — **schema auto-migrates; no manual migration step needed** (LoginServer.cs line 40). Parser also migrates (`ParserBootstrap.cs` line 76).
- Logging: Serilog console sink at Debug level (`configuration/logger.yml`) → **readiness detectable from stdout logs**.
- Parser (`NosCore.Parser`) is a **separate executable** that imports game static data (maps, items, monsters...) from a client folder via `--folder`. It is NOT part of the docker-compose and NOT required for the server to boot — but the DB will have no map/item data until it (or a seed) runs.
- `dotnet publish -r linux-musl-x64` builds the `./build/net10.0/linux-musl-x64` output the Dockerfiles expect; requires .NET 10 SDK. Building from source is slow (SDK + 3 images). Prebuilt images avoid this entirely.

## Recommendation for our `test-server/`

Use the prebuilt Docker Hub images in our own small `docker-compose.yml` (db + master + world + login), passing env vars for DB_HOST/WEBAPI_HOST/ports, mounting only `configuration/`. Avoid the host .NET build path. World port 1337 / login 4000 are what the bot connects to.

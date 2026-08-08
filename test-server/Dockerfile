# Build NosCore from source (pinned commit) so the stack matches the current repo.
# Prebuilt images on Docker Hub (noscoreio/noscore.*server:latest) are stale (.NET 9)
# and are NOT compatible with the current master (net10) DB schema / packets.

ARG NOSCORE_COMMIT=20e5990744797066cfcecdf4052a1d0c92a591dc

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG NOSCORE_COMMIT
WORKDIR /src
RUN git clone --depth 1 https://github.com/NosCoreIO/NosCore.git . \
    && git checkout $NOSCORE_COMMIT
RUN dotnet publish src/NosCore.WorldServer/NosCore.WorldServer.csproj -c Release -o /out \
    && dotnet publish src/NosCore.LoginServer/NosCore.LoginServer.csproj -c Release -o /out \
    && dotnet publish src/NosCore.MasterServer/NosCore.MasterServer.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
RUN apk add --no-cache icu-libs krb5-libs
WORKDIR /app
COPY --from=build /out /app
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENTRYPOINT ["dotnet"]

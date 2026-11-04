FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend-dotnet/ backend-dotnet/
COPY contracts/ contracts/
WORKDIR /src/backend-dotnet
RUN dotnet restore ReportDesigner.slnx --locked-mode
RUN dotnet publish src/ReportDesigner.Api/ReportDesigner.Api.csproj -c Release --no-restore --no-self-contained -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/ ./
COPY deployment/dotnet-entrypoint.sh /app/entrypoint.sh
ENV ASPNETCORE_ENVIRONMENT=Production DOTNET_ENVIRONMENT=Production ASPNETCORE_HTTP_PORTS=8080
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]

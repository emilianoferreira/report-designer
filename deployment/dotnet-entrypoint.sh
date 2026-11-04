#!/bin/sh
set -eu
# Read at runtime only. Never put this value in a Docker ARG, ENV layer, or log.
export ConnectionStrings__Postgres="$(cat /run/secrets/ConnectionStrings__Postgres)"
test -n "$ConnectionStrings__Postgres"
exec dotnet ReportDesigner.Api.dll

#!/bin/sh
set -eu
export DB_PASSWORD="$(cat /run/secrets/DB_PASSWORD)"
test -n "$DB_PASSWORD"
exec node dist/src/main.js

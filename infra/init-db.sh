#!/bin/sh
set -eu
# Executed once by the PostgreSQL entrypoint on a new data volume.
# Runtime credentials never appear in Compose environment values or command arguments.
app_password=$(cat /run/secrets/db_password)
export app_password
psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password app_password
CREATE ROLE steward_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE steward OWNER steward_app;
REVOKE ALL ON DATABASE steward FROM PUBLIC;
GRANT CONNECT ON DATABASE steward TO steward_app;
SQL
unset app_password

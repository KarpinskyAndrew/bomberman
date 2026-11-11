#!/usr/bin/env bash
# Creates the login roles from DATABASE.md §7. The postgres image runs this once,
# when the container starts with an empty data directory. Table grants live in the
# 00006_grants.sql migration; this script only does the cluster-level part.
#
# Required environment (local.env in dev, .env from Secret Manager in v1 prod):
#   PG_MIGRATOR_PASSWORD, PG_API_PASSWORD, PG_WORKER_PASSWORD, PG_GAMESERVER_PASSWORD
set -euo pipefail

: "${PG_MIGRATOR_PASSWORD:?PG_MIGRATOR_PASSWORD is not set}"
: "${PG_API_PASSWORD:?PG_API_PASSWORD is not set}"
: "${PG_WORKER_PASSWORD:?PG_WORKER_PASSWORD is not set}"
: "${PG_GAMESERVER_PASSWORD:?PG_GAMESERVER_PASSWORD is not set}"

# Passwords go in as psql variables and are quoted with format(%L), so they never
# get spliced into SQL text by the shell.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v migrator_pw="$PG_MIGRATOR_PASSWORD" \
  -v api_pw="$PG_API_PASSWORD" \
  -v worker_pw="$PG_WORKER_PASSWORD" \
  -v gameserver_pw="$PG_GAMESERVER_PASSWORD" <<'SQL'
-- CREATE or ALTER, so re-running the script just resets the passwords.
SELECT format(
         CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name)
              THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
              ELSE 'CREATE ROLE %I LOGIN PASSWORD %L' END,
         r.name, r.pw)
FROM (VALUES ('migrator',   :'migrator_pw'),
             ('api',        :'api_pw'),
             ('worker',     :'worker_pw'),
             ('gameserver', :'gameserver_pw')) AS r(name, pw)
\gexec

-- migrator owns the database, so it also owns the public schema
-- (PG 15+: public is owned by pg_database_owner) and can CREATE EXTENSION citext
-- (a trusted extension).
ALTER DATABASE :"db" OWNER TO migrator;

-- Only the four service roles may connect.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO api, worker, gameserver;
SQL

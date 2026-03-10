#!/usr/bin/env bash
# Start PostgreSQL — initialise data directory if not already done.
# Runs as root; postgres process drops privileges to the postgres user.

set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PGUSER="${POSTGRES_USER:-veta}"
PGPASS="${POSTGRES_PASSWORD:-veta}"
PGDB="${POSTGRES_DB:-veta}"
PG_BIN="/usr/lib/postgresql/16/bin"

# Initialise data directory on first run
if [ ! -f "${PGDATA}/PG_VERSION" ]; then
  mkdir -p "${PGDATA}"
  chown postgres:postgres "${PGDATA}"
  su -s /bin/sh postgres -c "${PG_BIN}/initdb -D ${PGDATA} --auth=md5 --username=postgres"
  echo "host all all 0.0.0.0/0 md5" >> "${PGDATA}/pg_hba.conf"
  echo "listen_addresses = '*'" >> "${PGDATA}/postgresql.conf"

  # Start temporarily to create user/db
  su -s /bin/sh postgres -c "${PG_BIN}/pg_ctl -D ${PGDATA} start -w -t 30"
  su -s /bin/sh postgres -c "psql -c \"CREATE USER ${PGUSER} WITH PASSWORD '${PGPASS}';\" 2>/dev/null || true"
  su -s /bin/sh postgres -c "psql -c \"CREATE DATABASE ${PGDB} OWNER ${PGUSER};\" 2>/dev/null || true"
  su -s /bin/sh postgres -c "${PG_BIN}/pg_ctl -D ${PGDATA} stop -w"
fi

exec su -s /bin/sh postgres -c "${PG_BIN}/postgres -D ${PGDATA}"

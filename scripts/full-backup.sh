#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/scheduled}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
AGE_RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-$STACK_DIR/secrets/backup-age-recipient.txt}"
LOCK_FILE="${LOCK_FILE:-$STACK_DIR/state/auto-pull.lock}"
LOCK_WAIT_SECONDS="${LOCK_WAIT_SECONDS:-1800}"
VOLUME_IMAGE="${VOLUME_IMAGE:-postgres:16-alpine}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-veta-postgres-1}"
AUTHENTIK_POSTGRES_CONTAINER="${AUTHENTIK_POSTGRES_CONTAINER:-veta-authentik-postgresql}"
VAULT_CONTAINER="${VAULT_CONTAINER:-veta-openbao}"
VAULT_DATA_VOLUME="${VAULT_DATA_VOLUME:-veta-openbao_openbao-data}"
VAULT_UNSEAL_VOLUME="${VAULT_UNSEAL_VOLUME:-veta-openbao-unseal}"
VAULT_APPROLE_FILE="${VAULT_APPROLE_FILE:-$HOME/.config/veta/openbao-approle.json}"
VAULT_WAIT_SECONDS="${VAULT_WAIT_SECONDS:-60}"
VOLUMES="${BACKUP_VOLUMES:-veta_market-data-state veta_minio-data veta_opensearch-data observability_grafana-data veta-authentik_authentik-data}"
CONFIG_ITEMS="${BACKUP_CONFIG_ITEMS:-.env .env.loadgen secrets}"

log() {
  echo "[full-backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

command -v age >/dev/null 2>&1 || fail "age is not installed"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
[ -s "$AGE_RECIPIENT_FILE" ] || fail "no age recipient file at $AGE_RECIPIENT_FILE"
grep -q '^age1' "$AGE_RECIPIENT_FILE" || fail "$AGE_RECIPIENT_FILE does not hold an age public key"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -w "$LOCK_WAIT_SECONDS" 9 || fail "could not take the deploy lock within ${LOCK_WAIT_SECONDS}s"

umask 077
mkdir -p "$BACKUP_ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BACKUP_ROOT/.work-$STAMP"
FINAL="$BACKUP_ROOT/full-$STAMP"
PARTIAL="$FINAL.partial"
VAULT_STOPPED=0

restart_vault() {
  if [ "$VAULT_STOPPED" = "1" ]; then
    docker start "$VAULT_CONTAINER" >/dev/null 2>&1 || true
    VAULT_STOPPED=0
  fi
}

cleanup() {
  restart_vault
  rm -rf "$WORK" "$PARTIAL"
}
trap cleanup EXIT

mkdir -p "$WORK" "$PARTIAL"

encrypt() {
  age -R "$AGE_RECIPIENT_FILE" -o "$PARTIAL/$(basename "$1").age" "$1"
  rm -f "$1"
}

dump_database() {
  local container="$1" name="$2"
  docker exec "$container" sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' >"$WORK/$name.dump"
  [ -s "$WORK/$name.dump" ] || fail "$name dump is empty"
  docker exec -i "$container" pg_restore --list <"$WORK/$name.dump" >/dev/null || fail "$name dump cannot be read back"
  log "dumped $name ($(stat -c %s "$WORK/$name.dump") bytes)"
  encrypt "$WORK/$name.dump"
}

archive_volumes() {
  local out="$1"
  shift
  local args=()
  local volume
  for volume in "$@"; do
    args+=(-v "$volume:/v/$volume:ro")
  done
  docker run --rm -u 0 "${args[@]}" --entrypoint tar "$VOLUME_IMAGE" czf - -C /v . >"$out"
  [ -s "$out" ] || fail "$(basename "$out") is empty"
  tar tzf "$out" >/dev/null || fail "$(basename "$out") cannot be read back"
}

wait_for_vault() {
  local waited=0
  while [ "$waited" -lt "$VAULT_WAIT_SECONDS" ]; do
    if docker exec "$VAULT_CONTAINER" bao status >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

dump_database "$POSTGRES_CONTAINER" veta-postgres
docker exec "$POSTGRES_CONTAINER" sh -c 'pg_dumpall --roles-only --no-role-passwords -U "$POSTGRES_USER"' >"$WORK/veta-postgres.roles.sql"
[ -s "$WORK/veta-postgres.roles.sql" ] || fail "roles dump is empty"
encrypt "$WORK/veta-postgres.roles.sql"
dump_database "$AUTHENTIK_POSTGRES_CONTAINER" authentik-postgres

for volume in $VOLUMES; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    archive_volumes "$WORK/volume-$volume.tgz" "$volume"
    log "archived volume $volume"
    encrypt "$WORK/volume-$volume.tgz"
  else
    log "volume $volume not found, skipped"
  fi
done

config_present=()
for item in $CONFIG_ITEMS; do
  if [ -e "$STACK_DIR/$item" ]; then
    config_present+=("$item")
  fi
done
[ "${#config_present[@]}" -gt 0 ] || fail "none of the stack config items exist under $STACK_DIR"
tar czf "$WORK/stack-config.tgz" -C "$STACK_DIR" "${config_present[@]}"
tar tzf "$WORK/stack-config.tgz" >/dev/null || fail "stack-config.tgz cannot be read back"
encrypt "$WORK/stack-config.tgz"

docker stop "$VAULT_CONTAINER" >/dev/null
VAULT_STOPPED=1
archive_volumes "$WORK/secrets-openbao-data.tgz" "$VAULT_DATA_VOLUME"
archive_volumes "$WORK/secrets-openbao-unseal.tgz" "$VAULT_UNSEAL_VOLUME"
restart_vault
wait_for_vault || fail "the vault did not come back within ${VAULT_WAIT_SECONDS}s after the backup"
log "archived vault data and unseal key, vault is back"
encrypt "$WORK/secrets-openbao-data.tgz"
encrypt "$WORK/secrets-openbao-unseal.tgz"

if [ -f "$VAULT_APPROLE_FILE" ]; then
  cp "$VAULT_APPROLE_FILE" "$WORK/secrets-deploy-approle.json"
  encrypt "$WORK/secrets-deploy-approle.json"
fi

{
  echo "taken_utc=$STAMP"
  echo "stack_sha=$(cat "$STACK_DIR/state/last-deployed-sha" 2>/dev/null || echo unknown)"
  docker ps --format '{{.Names}} {{.Image}}' | sort
} >"$WORK/versions.txt"
cp "$WORK/versions.txt" "$PARTIAL/versions.txt"

(cd "$PARTIAL" && sha256sum -- *.age versions.txt >SHA256SUMS)
(cd "$PARTIAL" && sha256sum -c SHA256SUMS >/dev/null) || fail "checksum verification failed"

mv "$PARTIAL" "$FINAL"
date -u +%s >"$BACKUP_ROOT/last-success"
log "wrote $FINAL ($(du -sh "$FINAL" | cut -f1))"

find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'full-*Z' | sort | head -n -"$BACKUP_KEEP" | while read -r old; do
  rm -rf "$old"
  log "pruned $(basename "$old")"
done

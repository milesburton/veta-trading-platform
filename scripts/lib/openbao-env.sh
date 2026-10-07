#!/usr/bin/env bash

OPENBAO_ADDR="${OPENBAO_ADDR:-http://127.0.0.1:8200}"
OPENBAO_APPROLE_FILE="${OPENBAO_APPROLE_FILE:-$HOME/.config/veta/openbao-approle.json}"
OPENBAO_KV_MOUNT="${OPENBAO_KV_MOUNT:-secret}"
OPENBAO_KV_PREFIX="${OPENBAO_KV_PREFIX:-veta}"

openbao_log() { echo "[openbao] $(date -u +%H:%M:%S) $*" >&2; }

openbao_configured() {
    [[ -r "$OPENBAO_APPROLE_FILE" ]]
}

openbao_curl() {
    curl -fsS --max-time 10 "$@"
}

openbao_login() {
    local resp
    resp=$(openbao_curl -X POST --data @"$OPENBAO_APPROLE_FILE" \
        "$OPENBAO_ADDR/v1/auth/approle/login") || {
        openbao_log "AppRole login to $OPENBAO_ADDR failed (sealed, down, or credentials revoked)"
        return 1
    }
    printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["auth"]["client_token"])'
}

openbao_revoke() {
    openbao_curl -X POST -H @<(printf 'X-Vault-Token: %s' "$1") \
        "$OPENBAO_ADDR/v1/auth/token/revoke-self" >/dev/null 2>&1 || true
}

openbao_read_pairs() {
    local token=$1 path=$2 resp
    resp=$(openbao_curl -H @<(printf 'X-Vault-Token: %s' "$token") \
        "$OPENBAO_ADDR/v1/$OPENBAO_KV_MOUNT/data/$OPENBAO_KV_PREFIX/$path") || {
        openbao_log "could not read $OPENBAO_KV_MOUNT/$OPENBAO_KV_PREFIX/$path"
        return 1
    }
    printf '%s' "$resp" | python3 -c '
import json, re, sys
data = json.load(sys.stdin)["data"]["data"]
for key, value in data.items():
    if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key):
        sys.exit(f"invalid variable name in vault: {key!r}")
    if not isinstance(value, str) or "\0" in value:
        sys.exit(f"value for {key} must be a string without NUL")
    sys.stdout.write(f"{key}\0{value}\0")
sys.stdout.write("__OPENBAO_END__\0\0")
'
}

openbao_path_exists() {
    local token=$1 path=$2
    openbao_curl -o /dev/null -H @<(printf 'X-Vault-Token: %s' "$token") \
        "$OPENBAO_ADDR/v1/$OPENBAO_KV_MOUNT/metadata/$OPENBAO_KV_PREFIX/$path" 2>/dev/null
}

openbao_export_path() {
    local token=$1 path=$2 key value count=0 complete=false
    while IFS= read -r -d '' key && IFS= read -r -d '' value; do
        if [[ "$key" == "__OPENBAO_END__" ]]; then
            complete=true
            break
        fi
        export "$key=$value"
        count=$((count + 1))
    done < <(openbao_read_pairs "$token" "$path")
    if [[ "$complete" != true ]]; then
        openbao_log "incomplete read of $OPENBAO_KV_PREFIX/$path"
        return 1
    fi
    openbao_log "exported $count secrets from $OPENBAO_KV_PREFIX/$path"
}

openbao_export() {
    local token path status=0
    token=$(openbao_login) || return 1
    for path in "$@"; do
        openbao_export_path "$token" "$path" || { status=1; break; }
    done
    openbao_revoke "$token"
    return "$status"
}

openbao_export_if_present() {
    local token path status=0
    token=$(openbao_login) || return 1
    for path in "$@"; do
        if openbao_path_exists "$token" "$path"; then
            openbao_export_path "$token" "$path" || { status=1; break; }
        fi
    done
    openbao_revoke "$token"
    return "$status"
}

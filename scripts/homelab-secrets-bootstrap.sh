#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/stacks/veta}"
ENV_FILE="${ENV_FILE:-$STACK_DIR/.env}"
OUT_FILE="${OUT_FILE:-$STACK_DIR/state/homelab.sops.env}"
SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

log() { echo "[secrets-bootstrap] $*"; }
fail() { echo "[secrets-bootstrap] ERROR: $*" >&2; exit 1; }

command -v sops >/dev/null 2>&1 || fail "sops not on PATH (https://github.com/getsops/sops/releases)"
command -v age-keygen >/dev/null 2>&1 || fail "age-keygen not on PATH (apt install age)"
[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not readable"

if [[ -f "$SOPS_AGE_KEY_FILE" ]]; then
    log "Using existing age key at $SOPS_AGE_KEY_FILE"
else
    mkdir -p "$(dirname "$SOPS_AGE_KEY_FILE")"
    chmod 700 "$(dirname "$SOPS_AGE_KEY_FILE")"
    (umask 077 && age-keygen -o "$SOPS_AGE_KEY_FILE" 2>/dev/null)
    log "Generated age key at $SOPS_AGE_KEY_FILE"
fi
chmod 600 "$SOPS_AGE_KEY_FILE"

RECIPIENT=$(age-keygen -y "$SOPS_AGE_KEY_FILE")
mkdir -p "$(dirname "$OUT_FILE")"

STRIPPED=$(mktemp)
trap 'rm -f "$STRIPPED"' EXIT
chmod 600 "$STRIPPED"
grep -vE '^[[:space:]]*(#|$)' "$ENV_FILE" > "$STRIPPED"

sops --encrypt --age "$RECIPIENT" --input-type dotenv --output-type dotenv "$STRIPPED" > "$OUT_FILE"
SOPS_AGE_KEY_FILE="$SOPS_AGE_KEY_FILE" sops --decrypt --input-type dotenv --output-type dotenv "$OUT_FILE" \
    | cmp -s - "$STRIPPED" \
    || fail "round-trip check failed; $OUT_FILE does not decrypt to the values in $ENV_FILE"

SOPS_CONFIG_OUT="$(dirname "$OUT_FILE")/.sops.yaml"
printf 'creation_rules:\n  - path_regex: deploy/homelab\\.sops\\.env$\n    age: %s\n' "$RECIPIENT" > "$SOPS_CONFIG_OUT"

log "Encrypted $ENV_FILE to $OUT_FILE (comments dropped, round-trip verified)"
log ""
log "Back up $SOPS_AGE_KEY_FILE offline. Losing it means re-creating every secret."
log ""
log "Next, in a repo checkout:"
log "  1. Copy $OUT_FILE to deploy/homelab.sops.env"
log "  2. Copy $SOPS_CONFIG_OUT to .sops.yaml at the repo root (recipient $RECIPIENT)"
log "  3. Open a PR. The next deploy renders .env from the encrypted file."

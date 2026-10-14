#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"
case "$MODE" in
  staged|all) ;;
  *) echo "usage: $0 [staged|all]" >&2; exit 2 ;;
esac
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

RFC1918='\b(10\.[0-9]+\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+)\b'
EXEMPT_PATHS='(^|/)(__tests__/|[^/]*\.test\.[a-z]+$|package-lock\.json$|[^/]*\.lock$|\.private-network-denylist$)|^scripts/check-private-network-details\.sh$'
DENYLIST_FILE="${PRIVATE_NETWORK_DENYLIST_FILE:-$REPO_ROOT/.private-network-denylist}"

denylist_pattern() {
  {
    if [ -f "$DENYLIST_FILE" ]; then cat "$DENYLIST_FILE"; fi
    printf '%s\n' "${PRIVATE_NETWORK_DENYLIST:-}"
  } | { grep -vE '^\s*(#|$)' || true; } | paste -sd'|' -
}

candidate_files() {
  case "$MODE" in
    staged) git diff --cached --name-only --diff-filter=ACMR ;;
    all) git ls-files ;;
  esac | grep -vE "$EXEMPT_PATHS" || true
}

read_content() {
  if [ "$MODE" = staged ]; then git show ":$1"; else cat -- "$1"; fi
}

scan() {
  local pattern="$1" label="$2" found=0 file hits
  while IFS= read -r file; do
    [ -f "$file" ] || [ "$MODE" = staged ] || continue
    hits=$(read_content "$file" 2>/dev/null | grep -nIE -e "$pattern" || true)
    if [ -n "$hits" ]; then
      found=1
      echo "$label in $file:"
      echo "$hits" | sed 's/^/  /'
    fi
  done < <(candidate_files)
  return $found
}

status=0
scan "$RFC1918" "Private (RFC1918) address" || status=1

DENY=$(denylist_pattern)
if [ -n "$DENY" ]; then
  scan "$DENY" "Denylisted network detail" || status=1
fi

if [ "$status" -ne 0 ]; then
  echo
  echo "Internal network details must not be committed. Keep addresses and hostnames"
  echo "in OpenBao or an untracked .env file and reference them via environment variables."
  echo "Use placeholders such as <gpu-host> in docs, or RFC 5737 ranges (203.0.113.0/24)."
fi
exit "$status"

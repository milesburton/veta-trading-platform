#!/bin/sh
set -eu

DATA_PATH="${1:-}"

if [ -z "$DATA_PATH" ]; then
  DATA_PATH="$(docker volume inspect "${POSTGRES_VOLUME:-veta_postgres-data}" --format '{{ .Mountpoint }}' 2>/dev/null || true)"
fi

if [ -z "$DATA_PATH" ] || [ ! -d "$DATA_PATH" ]; then
  echo "usage: $0 <data-directory>  (or set POSTGRES_VOLUME to a docker volume name)" >&2
  exit 2
fi

SOURCE="$(findmnt -n -o SOURCE --target "$DATA_PATH" 2>/dev/null || true)"
if [ -z "$SOURCE" ]; then
  echo "fail: $DATA_PATH could not be resolved to a block device" >&2
  exit 2
fi
LAYERS="$(lsblk -n -s -o TYPE "$SOURCE" 2>/dev/null || true)"

if printf '%s\n' "$LAYERS" | grep -qx 'crypt'; then
  echo "ok: $DATA_PATH is backed by an encrypted device ($SOURCE)"
  exit 0
fi

echo "fail: $DATA_PATH is not on an encrypted device (source: $SOURCE, layers: $(printf '%s' "$LAYERS" | tr '\n' ' '))" >&2
exit 1

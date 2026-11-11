#!/bin/sh
set -eu

LOG_DIR=/var/log/squid

socat -T 10 "UDP4-RECVFROM:123,fork,reuseaddr" "UDP4-SENDTO:${NTP_UPSTREAM}:123" &
SOCAT_PID=$!

tail -n 0 -F "$LOG_DIR/access.log" "$LOG_DIR/cache.log" &
TAIL_PID=$!

squid -N -f /etc/squid/squid.conf &
SQUID_PID=$!

trap 'kill -TERM "$SQUID_PID" "$SOCAT_PID" "$TAIL_PID" 2>/dev/null; wait' TERM INT

wait "$SQUID_PID"

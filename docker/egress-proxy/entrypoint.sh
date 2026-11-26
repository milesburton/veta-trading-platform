#!/bin/sh
set -eu

LOG_DIR=/var/log/squid

CHRONY_CONF=/run/chrony-relay/chrony.conf
{
  echo "pool ${NTP_UPSTREAM} iburst maxsources 4 maxpoll 8"
  ip -o -4 addr show scope global | awk '{print "allow " $4}'
  echo "cmdport 0"
  echo "bindcmdaddress /"
  echo "pidfile /run/chrony-relay/chronyd.pid"
} > "$CHRONY_CONF"

chronyd -x -d -f "$CHRONY_CONF" &
CHRONY_PID=$!

tail -n 0 -F "$LOG_DIR/access.log" "$LOG_DIR/cache.log" &
TAIL_PID=$!

squid -N -f /etc/squid/squid.conf &
SQUID_PID=$!

trap 'kill -TERM "$SQUID_PID" "$CHRONY_PID" "$TAIL_PID" 2>/dev/null; wait' TERM INT

wait "$SQUID_PID"

# Runbook: clock drift

Raised by the `ClockDriftHigh` and `ClockSyncUnavailable` alerts. The gateway
sends an SNTP query every minute to the UDP relay on `egress-proxy`, which
forwards it to the server in `NTP_SERVER` (default `pool.ntp.org`), and
records `veta_clock_offset_microseconds` and `veta_clock_sync_healthy`.

MiFID II RTS 25 allows 1 ms of divergence from UTC for algorithmic trading
(100 microseconds for high frequency techniques, one second for other
activity). This platform alerts at 1 ms. SNTP over the public internet has
millisecond-level error, so a value near the threshold can be measurement noise
rather than drift. A sustained offset of several milliseconds is real.

## ClockDriftHigh

1. Check the current offset in Grafana or by querying `veta_clock_offset_microseconds`.
   Positive means the host clock is behind the reference.
2. On the host, check the synchroniser: `timedatectl status` and
   `chronyc tracking` (or `systemctl status systemd-timesyncd`). The
   "System clock synchronized" line should read `yes`.
3. Restart the synchroniser if it is stopped. If the offset is large, step the
   clock once with `chronyc makestep`. Do this outside trading hours where
   possible, because a step moves recorded timestamps. Services pick the step
   up on their next timestamp without a restart. After a forward step
   `tsMicros` jumps with the host clock. After a backward step `tsMicros`
   holds its last value until the corrected clock passes it, so order is
   preserved but timestamps in that window are compressed. Note the window in
   the incident entry.
4. For a virtual machine or WSL host, the guest clock can drift after suspend.
   Resynchronise the guest with its hypervisor as well.

## ClockSyncUnavailable

1. Check `egress-proxy` is healthy; the gateway's query goes through its UDP
   relay. Then confirm outbound UDP port 123 is allowed from that container.
2. Try a different server by setting `NTP_SERVER` and redeploying
   `egress-proxy`.
3. Until measurement resumes, treat timestamps as unverified. Record the window
   in the incident notes.

## After the incident

Orders and fills carry `tsMicros`, taken from the originating service clock.
List any orders submitted while the alert was firing, using the journal
`ts_micros` column, so their timestamps can be flagged in later reporting.

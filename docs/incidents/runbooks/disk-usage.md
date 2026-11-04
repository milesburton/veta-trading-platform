# Runbook: host disk usage and disk-monitor

Covers `DiskUsageHigh` (above 80%), `DiskUsageCritical` (above 92%) and `DiskMonitorDown`.
At 92% the host is close to an outage: Postgres and Redpanda both fail when the disk fills.

## Find what is using the space

1. `df -h` on the host, then `docker system df` for images, containers and volumes.
2. Large volumes are usually Redpanda data, Postgres data, the backups volume or Loki and
   Tempo data. Check Redpanda topic write rates first, since a runaway producer fills the
   disk quickly (see the Redpanda runbook).
3. Old images and build cache are the safest to remove: `docker image prune` and
   `docker builder prune`. The weekly host-prune timer does this on Sundays.

## Do not

Do not delete files inside volume directories by hand. Remove data through the owning
service, or restore from backup if a volume is damaged.

## DiskMonitorDown

The disk-monitor container is not being scraped. Check it is running with
`docker ps --filter name=disk-monitor`. A stale bind mount is the usual cause after a
script change, and the deploy restarts the container to pick it up.

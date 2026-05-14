---
title: Security Posture
description: Container hardening, threat model, and the residual risks we have not addressed.
---

This page describes the container-level defences applied to the trading
stack, the residual risks we have deliberately not addressed, and the
operational steps required when rolling out hardening changes to the
homelab.

## Threat model

The primary attacker we defend against is **a remote actor with network
access to the trading network** (LAN attacker on the homelab, or someone
who has compromised a public-facing service reachable through the OVH
edge at [`veta.mnetcs.com`](https://veta.mnetcs.com/)). The exploit chain
we are most concerned with:

1. Find a remote-code-execution bug in any internet-reachable service
   (gateway, frontend, public-facing health endpoints).
2. Get shell as that service's UID inside its container.
3. From there, attempt to: read data the service shouldn't access,
   move laterally to other containers, or escape to the host.

The defences below are arranged so that each step in the chain has a
hurdle, and the hurdles tighten as you move closer to host compromise.

## Defences in place

### Capability dropping

Every container drops all Linux capabilities (`cap_drop: [ALL]`) and
selectively re-adds only what the workload genuinely requires:

| Service | Capabilities added back | Why |
|---------|------------------------|-----|
| `traefik` | `NET_BIND_SERVICE` | bind 80/443 as non-root |
| `postgres` | `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID` | initdb permission setup |
| All others | none | Deno runtimes, kafkajs clients, ollama, kafka-relay |

Without capabilities, an in-container attacker cannot raw-socket scan,
modify network namespaces, or override file permissions outside their
own UID's reach.

### `no-new-privileges`

Every container is started with `security_opt: ["no-new-privileges:true"]`.
This blocks setuid escalation: even if an attacker finds a setuid binary
inside the container, the kernel refuses to honour the bit. The class of
"defeat the non-root constraint" exploits is closed off.

### Non-root execution (Deno services)

The shared base Dockerfile (`docker/base/Dockerfile`) ends with
`USER deno:deno`, mapping all Deno-based trading services to UID 1000
inside their containers. An attacker who lands RCE has the privileges
of UID 1000, not 0. Combined with capability drop, the post-exploit
position is meaningfully constrained.

The infrastructure containers (`postgres`, `redpanda`, `traefik`,
`ollama`) run as their official-image user models — those upstream
images already enforce non-root execution internally.

### Read-only-by-default disk-monitor

The disk-monitor container previously had access to the Docker socket
(read-write) and mounted the entire host filesystem. That made it the
single highest-blast-radius container in the stack: an RCE there would
yield full host control via the Docker API. The container is now:

- `read_only: true` filesystem
- `cap_drop: [ALL]`, `no-new-privileges`
- `user: 65534:65534` (nobody)
- No Docker socket mount
- Host filesystem mounted **read-only** at `/host`

The container can report disk usage; it cannot prune images, start
containers, or write anywhere. Image pruning is now an out-of-band cron
on the host (see `scripts/host-prune.sh`).

### `tmpfs:/tmp`

Each Deno service gets `/tmp` as a tmpfs mount. Anything that does land
in `/tmp` exists only in RAM and dies with the container — nothing
persists, and no on-disk artefacts survive a restart.

## Residual risks (not yet mitigated)

### `read_only: true` not yet applied to Deno services

The Deno-based trading services are *not* yet read-only. They could be:
they don't write to local disk at runtime (logs go to stdout, state goes
to Postgres or Kafka). The reason it isn't done in this pass is that
the failure mode of getting it wrong on a live homelab (one service
crashes in a restart loop on next deploy) outweighs the marginal defence:
the trading containers are stateless and an RCE attacker only owns them
for the lifetime of that container instance.

This is on the queue for a future pass once each service has been
individually verified as filesystem-clean.

### User-namespace remapping

Docker can be configured to remap container UIDs to a high host UID
range (`userns-remap`), so even "root in container" is a low-privileged
host user. This would substantially harden the residual privileged
containers (Postgres, the swarm-managed Docker daemon). It is invasive
(every existing volume needs UID migration) and is queued as its own
session.

## Disk-prune cron

To schedule a weekly host-level docker prune:

```bash
sudo crontab -e
# Add:
0 4 * * 0 /opt/stacks/veta/scripts/host-prune.sh >> /var/log/veta-prune.log 2>&1
```

## Verification

After the hardened stack is deployed, confirm capabilities are dropped:

```bash
docker inspect veta-gateway-1 --format '{{ .HostConfig.CapDrop }}'
# Expect: [ALL]
docker inspect veta-gateway-1 --format '{{ .HostConfig.SecurityOpt }}'
# Expect to include: no-new-privileges:true
docker exec veta-gateway-1 id -u
# Expect: 1000 (deno)
```

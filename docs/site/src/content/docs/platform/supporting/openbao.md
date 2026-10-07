---
title: OpenBao (secrets store)
description: Self-hosted OpenBao vault on the production server that holds every platform credential. Layout, health checks, upgrades, backup and restore, and troubleshooting.
---

[OpenBao](https://openbao.org), an open-source fork of HashiCorp Vault, holds every production credential. The deploy reads it, exports the values into its own process and passes them to Docker Compose, so the server keeps no secrets file. How a deploy reads secrets, how to change a value and the first-time setup are covered under [Secrets](/veta-trading-platform/development/deployment/#secrets). This page covers running the vault itself.

## Layout

| Item | Value |
| --- | --- |
| Compose project | `veta-openbao`, from `deploy/openbao/compose.yml`. Separate from the VETA stack, so a VETA deploy never recreates it |
| Container | `veta-openbao`, image `openbao/openbao:2.7.1`, `restart: unless-stopped` |
| API and UI | `127.0.0.1:8200` on the server only. No container network can reach it |
| Storage | Integrated Raft in the `veta-openbao_openbao-data` volume, encrypted at rest |
| Unseal key | 32 random bytes in the external volume `veta-openbao-unseal`. `docker compose down -v` does not remove it |
| Audit log | `/openbao/logs/audit.log` in the `veta-openbao_openbao-logs` volume. Request and response values are HMAC-hashed |
| KV paths | `secret/veta/platform`, `secret/veta/loadgen` |
| Auth | `veta-deploy` AppRole (read only, 5 minute tokens) for the deploy; `admin` userpass user (edit `secret/veta/*`, 1 hour tokens) for people |

The deploy user's `~/.config/veta/openbao-approle.json` holds the AppRole credentials. The root token is revoked after setup. Generate a new one with `bao operator generate-root` and the recovery key when a policy or auth method has to change.

## Health

```bash
docker exec veta-openbao bao status
```

Exit code `0` means initialised and unsealed, `2` means sealed. With the static seal, a sealed vault after a restart means the key volume is missing or unreadable. Check `docker logs veta-openbao` for `failed to unseal core`.

A deploy that cannot read secrets logs `AppRole login to http://127.0.0.1:8200 failed` and stops before touching any container. The running platform is unaffected: containers keep the environment they were created with.

## Reading the audit log

```bash
docker exec veta-openbao tail -n 20 /openbao/logs/audit.log
```

Each line is a JSON request or response with the path, the auth method and the client address. Secret values and tokens appear only as `hmac-sha256:` hashes. To check whether a known value was read, hash it with the audit device: `bao write sys/audit-hash/file input=<value>` (needs a root token).

## Upgrading

The image tag is pinned in `deploy/openbao/compose.yml`. Change it in a PR. The deploy syncs the file but does not restart the vault, so after the PR has deployed run:

```bash
cd /opt/stacks/veta
docker compose -f deploy/openbao/compose.yml pull
docker compose -f deploy/openbao/compose.yml up -d
docker exec veta-openbao bao status
```

The bootstrap script uses the same image for its short-lived helper containers. Pass `OPENBAO_IMAGE` if it ever runs against a different tag.

## Backup and restore

The data volume is encrypted with a keyring that only the unseal key opens, so an archive of it is safe to store anywhere. Keep the unseal key separately, in a password manager.

Back up, which stops the vault for a few seconds:

```bash
cd /opt/stacks/veta
docker compose -f deploy/openbao/compose.yml stop
docker run --rm -u 0 -v veta-openbao_openbao-data:/d:ro --entrypoint tar \
  openbao/openbao:2.7.1 czf - -C /d . > "openbao-data-$(date -u +%F).tgz"
docker compose -f deploy/openbao/compose.yml start
```

Restore, on the same or a new server:

```bash
docker volume create veta-openbao-unseal
base64 -d < unseal-key.b64 | docker run --rm -i -u 0 -v veta-openbao-unseal:/k \
  --entrypoint sh openbao/openbao:2.7.1 \
  -c 'cat > /k/current.key && chown openbao:openbao /k/current.key && chmod 0400 /k/current.key'
docker volume create veta-openbao_openbao-data
docker run --rm -i -u 0 -v veta-openbao_openbao-data:/d --entrypoint sh \
  openbao/openbao:2.7.1 -c 'tar xzf - -C /d && chown -R openbao:openbao /d' \
  < openbao-data-<date>.tgz
docker compose -f deploy/openbao/compose.yml up -d
docker exec veta-openbao bao status
```

On a new server, also copy `~/.config/veta/openbao-approle.json` across, or issue a new secret ID as `admin`.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deploy log: `No OpenBao AppRole credentials` | The bootstrap has not run, or the credentials file was removed | Run `scripts/openbao-bootstrap.py`, or restore `openbao-approle.json` |
| Deploy log: `AppRole login ... failed` | Vault down or sealed, or the secret ID was destroyed | `bao status`; if unsealed, issue a new secret ID as `admin` |
| Deploy log: `could not read .../veta/platform` | Path deleted, or the `veta-deploy` policy changed | `bao kv get secret/veta/platform` as `admin`; restore with `bao kv rollback` |
| Every request returns `500` and the log says `no audit backend succeeded` | The audit volume is full or unwritable. OpenBao refuses requests it cannot audit | Free space on the server, then restart the container |
| A service starts with a default password after a manual command | It was recreated with a bare `docker compose` | Recreate it with `scripts/veta-compose.sh up -d <service>` |

## Source

- `deploy/openbao/compose.yml`, `deploy/openbao/config/openbao.hcl`
- `deploy/openbao/compose.secrets.yml` (ticketing token overlay)
- `scripts/lib/openbao-env.sh` (deploy loader)
- `scripts/openbao-bootstrap.py` (first-time setup)
- `scripts/veta-compose.sh` (compose wrapper)

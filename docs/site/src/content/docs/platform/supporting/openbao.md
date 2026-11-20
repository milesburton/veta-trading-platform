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

The deploy user's `~/.config/veta/openbao-approle.json` holds the AppRole credentials. The root token is revoked after setup. Issue a new one with the recovery key, as described under [Recovering admin access](#recovering-admin-access), when a policy or auth method has to change.

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

## Recovering admin access

Use this when nobody can log in as `admin` and no root token exists. It needs the recovery key, which is shown once at initialisation and is not stored on the server. Keep it in the password manager, labelled for this vault. The unseal key in the `veta-openbao-unseal` volume is a different secret and cannot be used for recovery. A recovery key from another OpenBao instance fails with `recovery key does not match submitted values`.

Check the audit log first. It shows whether anyone reached the vault and why a login failed, for example `invalid credentials` against `auth/userpass/login/admin`:

```bash
docker exec veta-openbao tail -n 20 /openbao/logs/audit.log
```

Since OpenBao 2.5.3 the unauthenticated `sys/generate-root` endpoints are disabled by default (CVE-2026-5807), because an unauthenticated caller could cancel or start a root token operation. They answer `405`. The replacement, `sys/generate-root-token`, needs a token, so `bao operator generate-root` answers `403` when no token exists. The recovery key still works through the legacy endpoints once the listener setting `disable_unauthed_generate_root_endpoints = false` is applied, which needs a restart of the vault. The repository ships that as a second configuration, `deploy/openbao/recovery/openbao.hcl`, selected by `deploy/openbao/compose.recovery.yml`, so nothing is edited on the server.

Run the recovery script as the deploy user. Line 1 on stdin is the recovery key, line 2 is the new `admin` password (16 characters or more):

```bash
read -rs K && read -rs P && printf '%s\n%s\n' "$K" "$P" | python3 /opt/stacks/veta/scripts/openbao-recover-admin.py
```

The script:

1. Restarts the vault with the recovery configuration. The vault is unavailable for a few seconds, and running services keep the credentials they already hold.
2. Starts a generate-root operation with a one-time pad, submits the recovery key and decodes the root token.
3. Sets the `admin` password, creating the user with the `veta-admin` policy if it is missing, and checks that the login works.
4. Revokes the root token, restarts the vault with the normal configuration and fails unless the unauthenticated endpoint is closed again.

The restore step runs even when an earlier step fails. A wrong recovery key fails with `recovery key does not match submitted values`, and the script cancels the attempt. Do not retry in a loop. The operation is audited, so the audit log shows who started it.

## Rebuilding the vault

Use this when `admin` access and the recovery key are both lost. If the recovery key still exists, use [Recovering admin access](#recovering-admin-access) instead. Existing data stays readable with the read-only deploy credential, so the secrets can be carried across to a new vault. The unseal key volume is reused unchanged.

```bash
read -rs P && printf %s "$P" | python3 /opt/stacks/veta/scripts/openbao-rebuild.py
```

The password becomes the new `admin` password and must be at least 16 characters. The script:

1. Reads each path with the deploy credential. The credential cannot list paths, so the set is fixed: `platform`, `loadgen`, `authentik` and `authentik-bootstrap`. Override it with `REBUILD_PATHS`, a comma-separated list, when other paths exist. `platform` must be readable or nothing changes.
2. Stops the vault, archives the data volume to `~/openbao-data-before-rebuild-<stamp>.tgz` and refuses to continue if the archive looks empty.
3. Renames the old deploy credential to `openbao-approle.json.before-rebuild-<stamp>`, removes the volume and starts an empty vault.
4. Initialises it, recreates the policies, auth methods, `admin` user and deploy credential, and restores every path with a check-and-set of zero so nothing is overwritten.
5. Reads `platform` and `loadgen` back through the deploy loader and compares every value, then revokes the root token.

Afterwards, move the new recovery key from `~/openbao-init-*.json` into the password manager and shred the file. Run a deploy and confirm it exported secrets from the vault. Shred the archive and the old credential once that deploy is healthy, because the archive holds every secret in the clear.

Admin access has been lost three times, each time because the password or recovery key lived only on a machine that was rebuilt. Keep two things outside the server and outside any development container: the recovery key and the `admin` password, as separate password manager entries. With the recovery key the vault can be recovered without a rebuild. Without it, rebuilding is the only route.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deploy log: `No OpenBao AppRole credentials` | The bootstrap has not run, or the credentials file was removed | Run `scripts/openbao-bootstrap.py`, or restore `openbao-approle.json` |
| Deploy log: `AppRole login ... failed` | Vault down or sealed, or the secret ID was destroyed | `bao status`; if unsealed, issue a new secret ID as `admin` |
| Deploy log: `could not read .../veta/platform` | Path deleted, or the `veta-deploy` policy changed | `bao kv get secret/veta/platform` as `admin`; restore with `bao kv rollback` |
| Every request returns `500` and the log says `no audit backend succeeded` | The audit volume is full or unwritable. OpenBao refuses requests it cannot audit | Free space on the server, then restart the container |
| `admin` login returns `invalid credentials`, or a saved root token returns `permission denied` | The password changed or the root token was revoked after setup, which is the intended state | [Recovering admin access](#recovering-admin-access) |
| `bao operator generate-root` returns `403`, or `sys/generate-root/attempt` returns `405` | The CLI needs a token, and the unauthenticated endpoints are disabled by default since 2.5.3 | Run `scripts/openbao-recover-admin.py` |
| `recovery key does not match submitted values` | The key belongs to another vault, or was copied incorrectly | Find the key labelled for this vault. Do not retry in a loop |
| The deploy aborts with `is a known compose default` or `is not set` | `POSTGRES_PASSWORD`, `AUDIT_DB_PASSWORD`, `MINIO_ROOT_PASSWORD` or `INTERNAL_SERVICE_TOKEN` is missing or still a development default in `secret/veta/platform` | Set a real value as `admin`, rotating the live credential first. `POSTGRES_PASSWORD` and `AUDIT_DB_PASSWORD` must be hex. See the deployment page |
| A service starts with a default password after a manual command | It was recreated with a bare `docker compose` | Recreate it with `scripts/veta-compose.sh up -d <service>` |

## Source

- `deploy/openbao/compose.yml`, `deploy/openbao/config/openbao.hcl`
- `scripts/lib/openbao-env.sh` (deploy loader)
- `scripts/openbao-bootstrap.py` (first-time setup)
- `scripts/openbao-recover-admin.py`, `deploy/openbao/compose.recovery.yml`, `deploy/openbao/recovery/openbao.hcl` (recovery with the recovery key)
- `scripts/openbao-rebuild.py` (rebuild when the recovery key is lost)
- `scripts/veta-compose.sh` (compose wrapper)

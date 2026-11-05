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

## Recovering admin access

Use this when nobody can log in as `admin` and no root token exists. It needs the recovery key, which is shown once at initialisation and is not stored on the server. Keep it in the password manager, labelled for this vault. The unseal key in the `veta-openbao-unseal` volume is a different secret and cannot be used for recovery. A recovery key from another OpenBao instance fails with `recovery key does not match submitted values`.

Check the audit log first. It shows whether anyone reached the vault and why a login failed, for example `invalid credentials` against `auth/userpass/login/admin`:

```bash
docker exec veta-openbao tail -n 20 /openbao/logs/audit.log
```

With the static seal, `bao operator generate-root` fails with `403 permission denied` because the CLI calls `sys/generate-root-token/attempt`, which needs a token. The unauthenticated `sys/generate-root` endpoint still works, so drive it over the API from the server:

1. Write the recovery key to a file only you can read. Set the mode explicitly, because a file created without `umask 077` is world-readable: `umask 077; read -rs K && printf %s "$K" > ~/.recovery-key; chmod 600 ~/.recovery-key`.
2. Generate a 26-character alphanumeric one-time pad, then `PUT http://127.0.0.1:8200/v1/sys/generate-root/attempt` with `{"otp": "<pad>"}`. The response carries a `nonce`.
3. `PUT /v1/sys/generate-root/update` with `{"key": "<recovery key>", "nonce": "<nonce>"}`. With one recovery share the response is `complete` and holds `encoded_token`.
4. Base64-decode `encoded_token` (add `=` padding) and XOR it byte for byte with the pad. The result is the root token. Write it to a mode 600 file and never print it.
5. Use the token to repair what is broken, for example `bao write auth/userpass/users/admin/password password=-`, or `bao kv patch -mount=secret veta/platform ...` for a secret.
6. Revoke the token with `bao token revoke -self`, then shred the token file and the recovery key file.

If a step fails, `DELETE /v1/sys/generate-root/attempt` cancels the attempt so the next one starts clean. Send the secret values to the vault over stdin so they never appear in a process list, and check results with the `veta-deploy` token by testing for presence and for known defaults, not by printing values.

If the recovery key is lost, the data cannot be reached for writes. The remaining option is to initialise a new vault and run `scripts/openbao-bootstrap.py`, after dumping `secret/veta/platform` and `secret/veta/loadgen` with the read-only deploy token.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deploy log: `No OpenBao AppRole credentials` | The bootstrap has not run, or the credentials file was removed | Run `scripts/openbao-bootstrap.py`, or restore `openbao-approle.json` |
| Deploy log: `AppRole login ... failed` | Vault down or sealed, or the secret ID was destroyed | `bao status`; if unsealed, issue a new secret ID as `admin` |
| Deploy log: `could not read .../veta/platform` | Path deleted, or the `veta-deploy` policy changed | `bao kv get secret/veta/platform` as `admin`; restore with `bao kv rollback` |
| Every request returns `500` and the log says `no audit backend succeeded` | The audit volume is full or unwritable. OpenBao refuses requests it cannot audit | Free space on the server, then restart the container |
| `admin` login returns `invalid credentials`, or a saved root token returns `permission denied` | The password changed or the root token was revoked after setup, which is the intended state | [Recovering admin access](#recovering-admin-access) |
| `bao operator generate-root` returns `403` | The CLI uses an authenticated path under the static seal | Use the `sys/generate-root` API as described above |
| `recovery key does not match submitted values` | The key belongs to another vault, or was copied incorrectly | Find the key labelled for this vault. Do not retry in a loop |
| The deploy aborts with `is a known compose default` or `is not set` | `POSTGRES_PASSWORD`, `AUDIT_DB_PASSWORD`, `MINIO_ROOT_PASSWORD` or `INTERNAL_SERVICE_TOKEN` is missing or still a development default in `secret/veta/platform` | Set a real value as `admin`, rotating the live credential first. See the deployment page |
| A service starts with a default password after a manual command | It was recreated with a bare `docker compose` | Recreate it with `scripts/veta-compose.sh up -d <service>` |

## Source

- `deploy/openbao/compose.yml`, `deploy/openbao/config/openbao.hcl`
- `scripts/lib/openbao-env.sh` (deploy loader)
- `scripts/openbao-bootstrap.py` (first-time setup)
- `scripts/veta-compose.sh` (compose wrapper)

---
title: Full platform backup
description: Daily encrypted backup of both databases, the vault, the stack config and the small state volumes, with retention and a documented restore order.
---

The [Postgres backup](../postgres-backup/) container covers the platform
database only. `full-backup.sh` covers everything needed to rebuild the
platform from nothing: the platform and Authentik databases, the OpenBao
vault and its unseal key, the stack configuration (`.env` and `secrets/`),
and the small state volumes. A systemd timer runs it daily at 03:30 UTC.

## What it does

1. Takes the same lock as auto-pull, so a backup never overlaps a deploy.
2. Dumps the platform database (with its roles, without password hashes) and
   the Authentik database, and reads each dump back with `pg_restore --list`.
3. Archives the Grafana, MinIO, OpenSearch, market-data state and Authentik
   data volumes, and the stack config.
4. Stops the vault for the few seconds needed to archive its data and unseal
   volumes consistently, then starts it again and waits until it answers. The
   vault is restarted on every exit path, including failures.
5. Encrypts every artefact with `age` to a public key, deletes the plaintext,
   writes `SHA256SUMS` and checks it.
6. Renames the working directory into place only when everything succeeded,
   records the time in `last-success`, and keeps the newest seven backups.

Tracing data, Prometheus metrics and model files are not included. They can
be rebuilt or pulled again. The vault recovery key is not included either; it
belongs in a password manager.

## Encryption

The server holds only the public key, in
`secrets/backup-age-recipient.txt`. A compromised server cannot decrypt
earlier backups, and losing the server does not lose the ability to read
them. Keep the private key in a password manager and in at least one place
other than the server.

Generate the key pair on a trusted machine, never on the server:

```bash
age-keygen -o veta-backup.key
```

The public key is printed on the `Public key:` line. Place only that line in
`secrets/backup-age-recipient.txt` on the server.

## Install (one-time, on the server)

```bash
sudo apt-get install -y age
sudo install -m 0644 \
  /path/to/repo/scripts/homelab-systemd/veta-full-backup.service \
  /path/to/repo/scripts/homelab-systemd/veta-full-backup.timer \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now veta-full-backup.timer
```

The script is synced to `/opt/stacks/veta/scripts/` by the normal deploy.
Run it once by hand to confirm the setup:

```bash
sudo systemctl start veta-full-backup.service
journalctl -u veta-full-backup.service -n 30 --no-pager
```

## Configuration

| Variable             | Default                          | Meaning                                            |
| -------------------- | -------------------------------- | -------------------------------------------------- |
| `BACKUP_ROOT`        | `~/backups/scheduled`            | Directory that holds the dated backup folders.     |
| `BACKUP_KEEP`        | `7`                              | Number of backups to keep.                         |
| `AGE_RECIPIENT_FILE` | `secrets/backup-age-recipient.txt` | File holding the age public key.                 |
| `BACKUP_VOLUMES`     | the five volumes listed above    | Space separated Docker volume names to archive.    |
| `BACKUP_CONFIG_ITEMS`| `.env .env.loadgen secrets`      | Paths under the stack directory to archive.        |

## Copying a backup off the server

The backup directory is on the same disk as the platform. Copy the newest
folder to another machine regularly. The files are encrypted, so the copy
can sit on any storage.

```bash
rsync -a --ignore-existing <server>:backups/scheduled/ ./veta-backups/
```

## Restore order

Decrypt each file first:

```bash
age -d -i veta-backup.key -o veta-postgres.dump veta-postgres.dump.age
```

1. Vault: stop it, extract `secrets-openbao-data.tgz` into the vault data
   volume and `secrets-openbao-unseal.tgz` into `veta-openbao-unseal`, copy
   `secrets-deploy-approle.json` to `~/.config/veta/openbao-approle.json`, and
   start it. It unseals itself with the static key.
2. Stack config: extract `stack-config.tgz` into the stack directory.
3. Platform database: restore `veta-postgres.roles.sql`, then
   `pg_restore --clean --if-exists --no-owner veta-postgres.dump`. Role
   passwords come from the vault.
4. Authentik: `pg_restore` `authentik-postgres.dump` into the `authentik`
   database.
5. Volumes: extract each `volume-*.tgz` into its named volume.
6. Run the normal deploy.

## Limits

- A failed run exits non-zero, so the systemd unit shows as failed and
  `journalctl` holds the reason. There is no Prometheus alert for a stale
  full backup yet.
- The retention window is local only. Without a copy off the server, loss of
  the disk loses every backup.

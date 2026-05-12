# Runbook: bootstrap the UAT environment on the homelab

One-time setup for a second Docker Compose project (`veta-uat`) co-located with prod on the same homelab box, isolated by port range, Docker network, container names, and resource limits. Phase 3 of the [operations strategy](../../site/src/content/docs/platform/operations-strategy.mdx).

## Pre-conditions

- Latest `main` includes `compose.uat.yml`, `scripts/uat-deploy.sh`, `traefik.uat.yml`.
- Prod is running and healthy at `http://192.168.1.245/` (LAN) or `https://veta.mnetcs.com/` (public).
- You can SSH to the homelab as a user in the `docker` group.

## Port allocation

| Service | Prod port | UAT port |
|---------|-----------|----------|
| Traefik HTTP | 80 | **8080** |
| Traefik HTTPS | 443 | **8443** (unused; no UAT cert) |
| Traefik dashboard | 8888 | **8989** |
| Postgres | 5432 | **8432** |
| Disk monitor | 8099 | **8199** |

All other services are network-internal and don't bind host ports. They reach each other via `redpanda:9092`, `postgres:5432`, etc., on their respective Docker networks (`veta_trading-net` for prod, `veta-uat_trading-net` for UAT — automatic project-name prefix).

## Step 1 — create the UAT stack directory

```sh
ssh miles@192.168.1.245
sudo mkdir -p /opt/stacks/veta-uat/state
sudo chown -R "$USER:$USER" /opt/stacks/veta-uat
cd /opt/stacks/veta-uat
```

## Step 2 — copy the UAT `.env`

UAT needs its own `.env` so it doesn't share secrets with prod (you can use the same dev passcode here — it's the test env). Copy and edit:

```sh
sudo cp /opt/stacks/veta/.env /opt/stacks/veta-uat/.env
sudo chown "$USER:$USER" /opt/stacks/veta-uat/.env
# Optionally edit OAUTH2_SHARED_SECRET to a UAT-specific value.
```

## Step 3 — install the deploy script and config files

The first run uses a freshly cloned main:

```sh
cd /tmp && rm -rf veta-uat-bootstrap
git clone --depth 1 --branch main --filter=blob:none \
  https://github.com/milesburton/veta-trading-platform.git veta-uat-bootstrap
sudo install -m 0755 /tmp/veta-uat-bootstrap/scripts/uat-deploy.sh /opt/stacks/veta-uat/deploy.sh
ls -l /opt/stacks/veta-uat/deploy.sh
```

After the first deploy, the script will keep itself in sync via `sync_configs`.

## Step 4 — first deploy

```sh
cd /opt/stacks/veta-uat
./deploy.sh
```

Expected:
- "Syncing config files from repo..." — rsync's compose.yml, compose.uat.yml, compose.observability.yml, traefik.uat.yml, observability/ into `/opt/stacks/veta-uat/`.
- "Pulling latest images..." — pulls `:latest` for each service from GHCR.
- "Restarting UAT stack..." — `docker compose up -d`.
- "Waiting up to 180s for critical services..." — polls healthchecks.
- "✅ Live: <sha>" on success.

Containers will be named `veta-uat-gateway-1`, `veta-uat-frontend-1`, etc. (project name auto-derived from the dir name `veta-uat`).

## Step 5 — verify isolation from prod

```sh
# UAT routes:
curl -sf http://localhost:8080/ | head -c 80
curl -sf http://localhost:8080/api/gateway/ready | head -c 200

# Prod routes (unchanged):
curl -sf http://localhost/ | head -c 80
curl -sk -L http://localhost/api/gateway/ready | head -c 200

# Service counts:
docker ps --format '{{.Names}}' | grep -c '^veta-uat-'   # UAT containers
docker ps --format '{{.Names}}' | grep -c '^veta-'       # prod + UAT
```

Expected: UAT serves the dashboard on `:8080`, prod still on `:80`. The two project namespaces don't cross-contaminate.

## Step 6 — wire up auto-deploy from main (later, separate PR)

For now UAT is deploy-on-demand (run `./deploy.sh` manually). A follow-up PR adds a systemd timer + auto-pull for the UAT project, paralleling the prod auto-pull. Until then, redeploys are manual:

```sh
ssh miles@192.168.1.245 'cd /opt/stacks/veta-uat && ./deploy.sh'
```

## Step 7 — public route at uat.veta.mnetcs.com (later, OVH-side change)

The OVH edge needs a second reverse SSH tunnel from `uat.veta.mnetcs.com:443` → homelab `:8080`. Documented in a follow-up runbook once the homelab side is verified.

## Rollback

UAT is a non-critical environment. To remove it:

```sh
cd /opt/stacks/veta-uat
docker compose -f compose.yml -f compose.uat.yml -f compose.observability.yml --profile trading down -v
sudo rm -rf /opt/stacks/veta-uat
```

Prod is untouched.

## Notes

- **Resource caps**: every UAT service has an explicit `mem_limit` in `compose.uat.yml` so a UAT load test can't starve prod of memory. Total UAT budget: ~10 GB. Prod has no explicit caps and gets first claim on the host.
- **Same homelab box**: a hardware failure takes BOTH prod and UAT down. That's the trade-off this design accepts in exchange for not needing separate hardware. Phase 6 (multi-host prod) is the long-term answer.
- **No HTTPS on UAT**: UAT serves plain HTTP. The public `uat.veta.mnetcs.com` route would terminate TLS at the OVH edge (Let's Encrypt there, not on the homelab). Until that route is wired, UAT is LAN-only at `http://192.168.1.245:8080/`.
- **Shared infra not duplicated**: each project gets its own Postgres + Redpanda containers; LGTM observability stack is shared by both (it scrapes both networks because Grafana is on a third compose project, `lgtm-*`, which Traefik on both projects can reach for dashboard routing).

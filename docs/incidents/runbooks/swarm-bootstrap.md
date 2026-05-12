# Runbook: bootstrap Docker Swarm on the homelab

One-time setup to convert the homelab from plain `docker compose` + Watchtower to a single-node Docker Swarm with `docker stack deploy`. Phase 2 of the [operations strategy](../../site/src/content/docs/platform/operations-strategy.mdx).

## Pre-conditions

- The latest `main` is at a revision that includes `compose.swarm.yml`, `scripts/swarm-deploy.sh`, and the updated `scripts/homelab-auto-pull.sh`.
- You can SSH to the homelab as a user in the `docker` group (`ssh miles@192.168.1.245`).
- `/opt/stacks/veta/.env` contains `OAUTH2_SHARED_SECRET`, `OAUTH2_USER_SECRETS`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `GHCR_USER`, `GHCR_TOKEN`. (The auto-pull script sources this file, so missing entries surface as compose interpolation errors.)
- You have a known-good rollback path: the existing `compose.yml + compose.prod.yml + docker compose up -d` flow still works and is the fallback if Swarm bootstrap goes wrong.

## Step 1 — stop the existing flow cleanly

```sh
ssh miles@192.168.1.245
sudo systemctl stop veta-auto-pull.timer
sudo systemctl stop veta-auto-pull.service || true
cd /opt/stacks/veta
docker compose -f compose.yml -f compose.prod.yml stop watchtower
docker compose -f compose.yml -f compose.prod.yml rm -f watchtower
```

The trading services keep running on plain compose during the bootstrap. Watchtower is shut down first so it can't fight us during the transition.

## Step 2 — initialise Swarm

```sh
HOMELAB_IP=$(ip -4 addr show eth0 | awk '/inet /{print $2}' | cut -d/ -f1)
docker swarm init --advertise-addr "$HOMELAB_IP"
docker info --format '{{.Swarm.LocalNodeState}}'  # → active
docker node ls
```

Single-node Swarm. The advertise-addr is only used if you ever join a second node — for single-node it doesn't matter, but be explicit.

## Step 3 — tear down the compose stack

```sh
cd /opt/stacks/veta
docker compose -f compose.yml -f compose.prod.yml -f compose.observability.yml down
```

This is the brief outage. Stack-deploy in Step 5 brings everything back up.

## Step 4 — refresh the deploy script

```sh
sudo cp /tmp/swarm-deploy.sh /opt/stacks/veta/deploy.sh
sudo chmod +x /opt/stacks/veta/deploy.sh
ls -l /opt/stacks/veta/deploy.sh
```

(Or let the auto-pull script self-install it on its next tick — see Step 7. Doing it explicitly here means Step 5 uses the new code.)

## Step 5 — first stack deploy

```sh
cd /opt/stacks/veta
./deploy.sh
```

Watch the output. Expected:

- "Logging in to GHCR…" — succeeds (GHCR_TOKEN must be valid).
- "Deploying stack 'veta'…" — `docker stack deploy` runs.
- "Polling /api/gateway/ready…" — eventually returns "Stack is ready" within `PROBE_TIMEOUT` (default 300s).
- Service summary at the end lists every service with `1/1` replicas.

If the probe fails, the script exits non-zero and dumps the failed-task table. Common causes:
- Image pull race (GHCR rate limit / token) — re-run `./deploy.sh`.
- A service stuck rolling because its healthcheck is too slow — check `docker stack ps veta --no-trunc` for the `desired-state=shutdown` rows.

## Step 6 — sanity-check the routing

```sh
curl -sf http://localhost/__version | head -c 200
curl -sf http://localhost/api/gateway/ready | python3 -m json.tool
docker stack services veta
```

`docker stack services veta` should show 40 services with `REPLICAS 1/1` and `IMAGE ghcr.io/.../*:latest`.

## Step 7 — re-enable the auto-pull timer

```sh
sudo systemctl start veta-auto-pull.timer
sudo systemctl status veta-auto-pull.timer
```

The next tick the timer fires (every 5 min), the auto-pull script will:
1. Notice main has moved on (or not),
2. Self-install `swarm-deploy.sh` as `deploy.sh` (which is now what it expects),
3. Run `deploy.sh` to apply the latest stack.

## Step 8 — verify rolling-deploy works

Trigger a no-op redeploy and watch:

```sh
docker stack deploy --with-registry-auth --resolve-image=always \
  -c <(docker compose -f compose.yml -f compose.prod.yml -f compose.observability.yml -f compose.swarm.yml config) \
  veta

# In another terminal:
docker stack ps veta --filter 'desired-state=running' --no-trunc | head -20
```

You should see new tasks appear with `start-first` ordering (the new task is `Running` before the old task moves to `Shutdown`). The synthetic probe against `http://localhost/api/gateway/ready` should never miss a beat.

## Rollback to the pre-Swarm flow

If Swarm misbehaves:

```sh
sudo systemctl stop veta-auto-pull.timer
docker stack rm veta
docker swarm leave --force
cd /opt/stacks/veta
sudo cp /tmp/homelab-deploy.sh /opt/stacks/veta/deploy.sh
sudo chmod +x /opt/stacks/veta/deploy.sh
./deploy.sh
sudo systemctl start veta-auto-pull.timer
```

`docker stack rm` removes all Swarm services; `docker swarm leave --force` drops the node out of Swarm mode entirely. The auto-pull then reverts to the previous compose-based flow.

## Notes

- **Single-node Swarm has the same blast radius as plain compose.** If the homelab box dies, the platform is down — that's what Phase 6 (multi-host prod) addresses.
- **The Docker socket is still on the host.** Swarm doesn't change the security model on its own; the residual privileged surface is the same.
- **`docker stack deploy` ignores `depends_on: condition`.** Services start in dependency order without waiting for healthcheck. Each service's own healthcheck + Swarm's restart loop converge to a healthy state, so the only visible symptom is noisy logs during the first 30-60s of the bootstrap. After that, every service is in steady state.

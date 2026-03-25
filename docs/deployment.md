# Deployment

## Overview

The platform uses a single Docker Compose stack across all deployed environments:

```bash
# Base stack (local builds)
docker compose -f compose.yml up -d

# Production (GHCR images, TLS, Watchtower)
docker compose -f compose.yml -f compose.prod.yml up -d
```

Each service runs in its own container built from a shared base image. **Traefik** is the single reverse proxy for all environments.

---

## Fly.io (cloud demo)

The live demo runs at https://veta-trading.fly.dev/. Deployments are triggered manually via GitHub Actions (`workflow_dispatch`). Navigate to **Actions → Deploy to Fly.io → Run workflow** to deploy.

### First-time setup

1. Create a Fly.io API token: `flyctl tokens create deploy`
2. Add it as a GitHub Actions secret named `FLY_API_TOKEN` (Settings → Secrets → Actions)

The `fly.toml` and `.github/workflows/deploy.yml` are already configured.

### Manual deploy

```sh
flyctl deploy --compose compose.yml --compose compose.prod.yml
```

Fly.io terminates TLS at the edge (`force_https = true` in `fly.toml`). Traefik inside the VM uses HTTP only — no ACME configuration is needed for Fly.io deployments.

### Scaling (Redpanda HA)

The default deployment runs a single machine. Redpanda requires 3 machines for a quorum-safe HA cluster:

```sh
flyctl scale count 3 --app veta-trading
```

### Persistent storage

Fly volumes are declared in `fly.toml` and provisioned with:

```sh
flyctl volumes create <name> --region iad --size 10
```

| Volume | Service | Contents |
|---|---|---|
| `postgres_data` | postgres | Trade database |
| `redpanda_data` | redpanda | Kafka topic data |
| `llm_data` | ollama | Model weights |
| `market_data_state` | market-data | Source override state |
| `feature_engine_data` | feature-engine | Feature vector store |
| `signal_engine_data` | signal-engine | Signal weights |
| `llm_advisory_data` | llm-advisory, llm-worker | Advisory job store |

### LLM Advisory on Fly.io

The `ollama` service starts automatically and pulls `qwen2.5:3b` (~2 GB) on first boot via the `ollama-model-pull` one-shot container. Model weights persist across deployments in the `llm_data` volume.

### Debugging

```sh
flyctl logs --follow
flyctl ssh console
flyctl status
```

---

## Homelab (self-hosted)

Runs on a self-hosted VM (Proxmox, 8 vCPU / 20 GB RAM).
URL: accessible via your local DNS or hosts file entry for `veta.home`.

### Stack

```
ghcr.io/milesburton/veta-trading-platform/<service>:latest   (per-service images)
Traefik v3 — HTTP→HTTPS redirect, Let's Encrypt ACME, Docker provider
Watchtower — polls GHCR every 5 min, auto-restarts updated containers
```

Managed via [Dockge](https://github.com/louislam/dockge) at `http://veta.home:5001`.

### First-time setup

```sh
# On the homelab VM
mkdir -p /opt/stacks/veta
cd /opt/stacks/veta

# Create .env
cat > .env <<EOF
ACME_EMAIL=miles@mnetcs.com
DOMAIN=veta.home
COMMIT_SHA=latest
EOF

# Pull and start
docker compose -f compose.yml -f compose.prod.yml pull
docker compose -f compose.yml -f compose.prod.yml up -d
```

### Required environment variables

| Variable | Description | Example |
|---|---|---|
| `ACME_EMAIL` | Let's Encrypt registration email | `miles@mnetcs.com` |
| `DOMAIN` | Primary domain for Traefik Host() matchers | `veta.home` |
| `COMMIT_SHA` | Git SHA for version tracking (set by CI) | `abc1234` |

### TLS / HTTPS

Traefik issues certificates automatically via Let's Encrypt HTTP challenge. Certificates are stored in the `letsencrypt` named volume (`/letsencrypt/acme.json`).

For local `.home` domains without public DNS, use a self-signed cert or skip TLS by removing the `tls=true` labels from `compose.prod.yml`.

### Traefik dashboard

Available at `http://veta.home:8888/dashboard/`

### Updates

Watchtower polls GHCR every 5 minutes. When a new commit lands on `main` and CI passes (building and pushing `:latest` images), containers are updated automatically within ~5 minutes.

To force an immediate update:

```sh
docker compose -f compose.yml -f compose.prod.yml pull
docker compose -f compose.yml -f compose.prod.yml up -d
```

### Disk monitor

`scripts/disk-monitor.py` runs on port 8099 via the `disk-monitor` service in `compose.yml`:
- Returns `200 {"status":"ok"}` when disk usage < 85%
- Returns `503` when critical
- Auto-prunes dangling Docker images when disk exceeds 90%

Poll with Uptime Kuma: `http://veta.home:8099/health` (keyword: `ok`)

---

## Desktop (Electron)

Pre-built installers for macOS, Windows, and Linux are published automatically to [GitHub Releases](../../releases) when a version tag (`v*`) is pushed. The release workflow builds on all three platforms in parallel.

### Download a release

Go to [Releases](../../releases) and download the installer for your platform:

| Platform | File |
|---|---|
| macOS | `.dmg` (universal — Intel + Apple Silicon) |
| Windows | `.exe` (NSIS installer, x64) |
| Linux | `.AppImage` (x64) |

### Building locally

```sh
cd frontend

# Development (hot reload, connects to local backend)
npm run electron:dev

# Production distributable
npm run electron:build
# Output: frontend/dist-app/
```

The Electron app connects to the gateway at `http://localhost:5011` by default. All backend services must be running locally — start them via the Dev Container or `supervisorctl`.

### Creating a release

Tag the commit and push — the release workflow fires automatically:

```sh
git tag v1.2.3
git push origin v1.2.3
```

The workflow builds installers on `macos-latest`, `windows-latest`, and `ubuntu-latest`, then publishes them as a GitHub Release with auto-generated release notes.

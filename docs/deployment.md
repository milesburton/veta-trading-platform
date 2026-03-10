# Deployment

## Fly.io (cloud)

The live demo runs at https://veta-trading.fly.dev/. Deployments are triggered manually via GitHub Actions (`workflow_dispatch`). Navigate to **Actions → Deploy to Fly.io → Run workflow** to deploy.

### First-time setup

1. Create a Fly.io API token: `flyctl tokens create deploy`
2. Add it as a GitHub Actions secret named `FLY_API_TOKEN` (Settings → Secrets → Actions)

The `fly.toml` and `.github/workflows/deploy.yml` are already configured.

### Manual deploy

```sh
flyctl deploy --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

### Scaling (Redpanda HA)

The default deployment runs a single machine. Redpanda requires 3 machines for a quorum-safe HA cluster:

```sh
flyctl scale count 3 --app veta-trading
```

Each machine advertises its private IP in `redpanda.yaml`. For single-machine deployments `min_machines_running = 1` prevents state loss — the machine suspends rather than terminates between requests.

### Persistent storage

A 10 GB volume is mounted at `/app/backend/data` for:

- Journal and observability SQLite databases
- FIX archive SQLite database
- Ollama model weights (`/app/backend/data/ollama/models`)

### LLM Advisory on Fly.io

Ollama is installed in the Docker image and started by supervisord on boot. The `qwen2.5:3b` model (~2 GB) is pulled automatically by the `ollama-model-pull` program on first run. Model weights persist across deployments in the mounted volume.

### Debugging

```sh
flyctl logs --follow
flyctl ssh console
flyctl status
```

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

The Electron app connects to the gateway at `http://localhost:5011` by default (same as browser dev mode). All backend services must be running locally — start them via the Dev Container or `supervisorctl`.

### Creating a release

Tag the commit and push — the release workflow fires automatically:

```sh
git tag v1.2.3
git push origin v1.2.3
```

The workflow builds installers on `macos-latest`, `windows-latest`, and `ubuntu-latest`, then publishes them as a GitHub Release with auto-generated release notes.

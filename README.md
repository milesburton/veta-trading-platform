# VETA Trading Platform

**Live demo:** https://veta-trading.fly.dev/

A simulated equities trading environment built with Deno microservices and a React/TypeScript frontend. Includes a market price engine, execution and order management systems, seven algorithmic trading strategies, a market intelligence pipeline, FIX 4.4 protocol support, and an LLM advisory subsystem powered by a local Ollama instance.

## Quick Start

The project runs inside a [Dev Container](https://containers.dev/). Open in VS Code with the Dev Containers extension:

```
Ctrl+Shift+P → Dev Containers: Rebuild and Reopen in Container
```

All services start automatically. Open http://localhost:8080.

Default accounts:

| Username | Password | Role |
|---|---|---|
| `trader1` | `password` | Trader |
| `admin` | `password` | Admin |

## Running

```sh
# Browser
cd frontend && npm run dev

# Electron (desktop, hot reload)
cd frontend && npm run electron:dev

# Electron (production build)
cd frontend && npm run electron:build
```

## Tests

```sh
# Backend
deno task test
deno task test:smoke      # requires running services

# Frontend
cd frontend
npm run test:unit         # Vitest
npm run test:ui           # Playwright E2E (headless)
```

## Desktop Releases

Pre-built installers (macOS, Windows, Linux) are published on the [Releases](../../releases) page. To cut a release:

```sh
git tag v1.x.x && git push origin v1.x.x
```

## Deployment

```sh
flyctl deploy --remote-only \
  --build-arg VITE_COMMIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg VITE_BUILD_DATE=$(date -u +%Y-%m-%d)
```

See [docs/architecture.md](docs/architecture.md) for the full service map and design notes.

## Licence

MIT Licence &copy; 2025 Miles Burton

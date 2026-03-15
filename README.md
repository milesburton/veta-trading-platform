# VETA Trading Platform

**Live demo:** https://veta-trading.fly.dev/ (Note this will be transiently online as the project matures)

VETA is a near real world equities and fixed income trading platform. It will enable you to "paper trade" using a one of the algo services which is intended to help you learn market dynamics. 

This platform consists of:
* React based front end using Tailwind
* Observability service to retain logging throughout the platform
* Authentication and authorisation service
* 9 (currently) algo services (POV, TWAP, VWAP, Iceburg and so on)
* Signal engine driven from live market data
* Analytics engine to perform "What-If" scenarios
* Fake exchange to generate market data combined with real market data
* LLM service using OLLAMA to provide possible market signals (though this is advisory only)
* Order Management System
* Journalling system using PostgreSQL
* Market Data Adapter service to control incoming real world and immitation data

The platform requires approximately 10-12GB of memory depending on load. It's not overly CPU hungry however that will diverge depending on the number of orders are on the market.

Both the application and dev container are docker based. Using VSC or IntellJ you can clone the repository. The MOTD has a number of helpful commands to get you started.

## Running

```sh
# Browser (dev server)
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

The platform uses a single Docker Compose stack across all environments. See [docs/deployment.md](docs/deployment.md) for full instructions.

```sh
# Homelab / self-hosted
docker compose -f compose.yml -f compose.prod.yml up -d

# Fly.io (manual)
flyctl deploy --compose compose.yml --compose compose.prod.yml
```

See [docs/architecture.md](docs/architecture.md) for the full service map and design notes.

## Licence

MIT Licence &copy; 2025 Miles Burton

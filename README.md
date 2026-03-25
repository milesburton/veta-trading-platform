# VETA Trading Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Deploy to Fly.io](https://github.com/milesburton/veta-trading-platform/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/deploy.yml)
[![Backend: lint, typecheck, unit](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=backend%3A%20lint%20%2B%20unit&logo=deno)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Frontend: lint, typecheck, unit](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=frontend%3A%20lint%20%2B%20unit&logo=typescript)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Integration tests](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=integration%20tests&logo=postgresql)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![E2E tests](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=e2e%20%28playwright%29&logo=playwright)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Docker build](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=docker%20build&logo=docker)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)

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

## Screenshots

> Auto-generated from the live UI on every commit to `main`.

| Trading Dashboard | Order Ticket |
|---|---|
| ![Trading Dashboard](docs/screenshots/01-trading-dashboard.png) | ![Order Ticket](docs/screenshots/02-order-ticket.png) |

| Order Blotter | Algo Workspace |
|---|---|
| ![Order Blotter](docs/screenshots/03-order-blotter.png) | ![Algo Workspace](docs/screenshots/04-algo-workspace.png) |

| Fixed Income | Option Pricing |
|---|---|
| ![Fixed Income](docs/screenshots/05-fixed-income.png) | ![Option Pricing](docs/screenshots/06-option-pricing.png) |

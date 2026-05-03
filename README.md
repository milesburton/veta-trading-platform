# VETA Trading Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Deploy to Fly.io](https://github.com/milesburton/veta-trading-platform/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/deploy.yml)
[![Docs Pages](https://github.com/milesburton/veta-trading-platform/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/pages.yml)
[![Release Please](https://github.com/milesburton/veta-trading-platform/actions/workflows/release-please.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/release-please.yml)
[![Backend unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/backend-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Frontend unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/frontend-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Integration tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/integration-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![E2E tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/e2e-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Frontend coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/frontend-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Backend coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/backend-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Combined coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/combined-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)
[![Docker build](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=docker%20build&logo=docker)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)

VETA is a simulation-first equities and fixed income trading platform designed for realistic paper-trading and market-structure analysis.

<p align="center">
  <a href="https://milesburton.github.io/veta-trading-platform/"><strong>View Documentation</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://veta-trading.fly.dev/">Live Demo</a>
  &nbsp;&middot;&nbsp;
  <a href="https://milesburton.github.io/veta-trading-platform/guides/overview/">Getting Started</a>
  &nbsp;&middot;&nbsp;
  <a href="https://milesburton.github.io/veta-trading-platform/platform/screenshots/">Screenshots</a>
</p>

<p align="center">
  <img src="docs/screenshots/01-trading-dashboard.png" alt="Trading Dashboard" width="800" />
</p>

## What's in this repo

- **Trading pipeline** — market simulator, OMS, EMS, journal, FIX, nine algos, analytics services. See the [Service Map](https://milesburton.github.io/veta-trading-platform/platform/services/).
- **Frontend** — React + Redux trading UI in [`frontend/`](frontend/), bundled by Vite, packaged by Electron.
- **Supporting services** — Grafana / Prometheus / Loki / Tempo (LGTM stack), Traefik ingress, k6 load tests, kafka-relay, Watchtower auto-update. See [Supporting Services](https://milesburton.github.io/veta-trading-platform/platform/supporting-services/).
- **Documentation** — Astro / Starlight site under [`docs/site/`](docs/site/), deployed to GitHub Pages.

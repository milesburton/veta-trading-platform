# VETA Trading Platform

> **Overall:** [![VETA test coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/overall-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) across the backend and frontend.

| Domain | Check | Result |
| :--- | :--- | :---: |
| Project | License | [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) |
| Delivery | Continuous integration | [![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Delivery | Container build | [![Docker build](https://img.shields.io/github/actions/workflow/status/milesburton/veta-trading-platform/ci.yml?branch=main&label=docker%20build&logo=docker)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Delivery | Documentation | [![Docs Pages](https://github.com/milesburton/veta-trading-platform/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/pages.yml) |
| Delivery | Release automation | [![Release Please](https://github.com/milesburton/veta-trading-platform/actions/workflows/release-please.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/release-please.yml) |
| Tests | Backend unit | [![Backend unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/backend-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Tests | Frontend unit | [![Frontend unit tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/frontend-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Tests | Integration | [![Integration tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/integration-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Tests | Smoke | [![Smoke tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/smoke-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Tests | End-to-end | [![E2E tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/e2e-tests.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Coverage | Backend | [![Backend coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/backend-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Coverage | Frontend | [![Frontend coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/frontend-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Coverage | Combined | [![Combined coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/milesburton/veta-trading-platform/main/docs/badges/combined-coverage.json)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml) |
| Security | Secret scanning | [![Secret scan](https://github.com/milesburton/veta-trading-platform/actions/workflows/gitleaks.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/gitleaks.yml) |
| Security | Static analysis | [![CodeQL](https://github.com/milesburton/veta-trading-platform/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/codeql.yml) |
| Performance | k6 load tests | [![k6 load tests](https://img.shields.io/badge/k6%20load%20tests-manual%20%2F%20homelab-blue?logo=k6)](https://milesburton.github.io/veta-trading-platform/development/testing/k6-load-testing/) |

A simulation-first equities and fixed-income trading platform for paper trading and market-structure analysis. Built around realistic desk segregation, nine execution algorithms, and a pre-trade risk engine that gates every order.

<p align="center">
  <a href="https://milesburton.github.io/veta-trading-platform/"><strong>Documentation</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://veta.mnetcs.com/">Live demo</a>
  &nbsp;&middot;&nbsp;
  <a href="https://milesburton.github.io/veta-trading-platform/guides/quick-start/">Quick start</a>
  &nbsp;&middot;&nbsp;
  <a href="https://veta.mnetcs.com/grafana/">Grafana</a>
</p>

<p align="center">
  <a href="https://milesburton.github.io/veta-trading-platform/platform/screenshots/">
    <img src="docs/screenshots/01-trading-dashboard.png" alt="Trader workspace" width="48%" />
    <img src="docs/screenshots/04-algo-workspace.png" alt="Algo workspace" width="48%" />
  </a>
  <br />
  <a href="https://milesburton.github.io/veta-trading-platform/platform/screenshots/">
    <img src="docs/screenshots/05-fixed-income.png" alt="Fixed-income workspace" width="48%" />
    <img src="docs/screenshots/06-option-pricing.png" alt="Options workspace" width="48%" />
  </a>
</p>

<p align="center"><sub>Screenshots are regenerated by Playwright on every push to <code>main</code>. See the <a href="https://milesburton.github.io/veta-trading-platform/platform/screenshots/">full gallery</a>.</sub></p>

## Documentation

Full documentation is at **[milesburton.github.io/veta-trading-platform](https://milesburton.github.io/veta-trading-platform/)**, published on every merge to `main`.

## Discord log and feedback

[Join the Discord](https://discord.gg/tSGgsKnz) for release notes, the platform alerts feed, and bug submission.

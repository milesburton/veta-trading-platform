# API Endpoints Documentation

This document describes all available API endpoints in the VETA system.

## General

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /load-test | intentional for load-test shape, not for security. | ✅ |
| POST | /demo-day | Endpoint for /demo-day | ❌ |
| POST | /load-gen/start | Endpoint for /load-gen/start | ❌ |
| POST | /load-gen/stop | Endpoint for /load-gen/stop | ❌ |
| GET | /load-gen/status | Endpoint for /load-gen/status | ❌ |
| GET | /scenarios | Endpoint for /scenarios | ✅ |
| POST | /scenarios | Endpoint for /scenarios | ❌ |
| GET | /me | ── User self-info ─────────────────────────────────────────── | ❌ |
| GET | /assets | ── Reference data ─────────────────────────────────────────── | ✅ |
| GET | /data-depth | Endpoint for /data-depth | ✅ |
| GET | /ccp/stats | Endpoint for /ccp/stats | ✅ |
| GET | /ccp/settlements | Endpoint for /ccp/settlements | ✅ |
| GET | /rfq/stats | ── RFQ ────────────────────────────────────────────────────── | ✅ |
| GET | /rfq | Endpoint for /rfq | ✅ |
| POST | /rfq/sellside | Endpoint for /rfq/sellside | ✅ |
| GET | /rfq/sellside | Endpoint for /rfq/sellside | ✅ |
| GET | /rfq/sellside/stats | Endpoint for /rfq/sellside/stats | ✅ |
| GET | /products | ── Products ───────────────────────────────────────────────── | ✅ |
| GET | /products/stats | Endpoint for /products/stats | ✅ |
| POST | /products | Endpoint for /products | ✅ |
| POST | /grid/query | ── Grid query ─────────────────────────────────────────────── | ✅ |
| PUT | /preferences | Endpoint for /preferences | ✅ |
| GET | /shared-workspaces | ── Shared workspaces ──────────────────────────────────────── | ✅ |
| POST | /shared-workspaces | Endpoint for /shared-workspaces | ✅ |
| GET | /market-data/sources | ── Market-data sources/overrides ──────────────────────────── | ✅ |
| GET | /market-data/overrides | Endpoint for /market-data/overrides | ✅ |
| PUT | /market-data/overrides | Endpoint for /market-data/overrides | ✅ |
| POST | /analytics/quote | ── Analytics ──────────────────────────────────────────────── | ❌ |
| POST | /analytics/scenario | Endpoint for /analytics/scenario | ✅ |
| POST | /analytics/recommend | Endpoint for /analytics/recommend | ✅ |
| POST | /analytics/bond-price | Endpoint for /analytics/bond-price | ✅ |
| POST | /analytics/yield-curve | Endpoint for /analytics/yield-curve | ✅ |
| POST | /analytics/spread-analysis | Endpoint for /analytics/spread-analysis | ✅ |
| POST | /analytics/duration-ladder | Endpoint for /analytics/duration-ladder | ✅ |
| GET | /intelligence/weights | ── Intelligence ───────────────────────────────────────────── | ✅ |
| PUT | /intelligence/weights | Endpoint for /intelligence/weights | ✅ |
| GET | /intelligence/recommendations | Endpoint for /intelligence/recommendations | ✅ |
| POST | /intelligence/scenario | Endpoint for /intelligence/scenario | ✅ |
| POST | /intelligence/replay | Endpoint for /intelligence/replay | ✅ |
| POST | /advisory/request | ── Advisory ───────────────────────────────────────────────── | ✅ |
| GET | /advisory/jobs | Endpoint for /advisory/jobs | ✅ |
| GET | /advisory/admin/state | Endpoint for /advisory/admin/state | ✅ |
| PUT | /advisory/admin/state | Endpoint for /advisory/admin/state | ✅ |
| POST | /advisory/admin/watchlist-brief | Endpoint for /advisory/admin/watchlist-brief | ✅ |
| POST | /advisory/admin/trigger-worker | Endpoint for /advisory/admin/trigger-worker | ✅ |
| GET | /alerts | Endpoint for /alerts | ❌ |
| POST | /alerts | Endpoint for /alerts | ✅ |
| PUT | /alerts/dismiss-all | Endpoint for /alerts/dismiss-all | ✅ |

## Journal Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /candles | Endpoint for /candles | ✅ |
| GET | /orders | Endpoint for /orders | ✅ |
| GET | /pool/stats | ── Dark pool / CCP ────────────────────────────────────────── | ✅ |
| GET | /preferences | ── Preferences ────────────────────────────────────────────── | ✅ |

## Summary

| Service | Endpoints | Auth Required |
|---------|-----------|---------------|
| General | 48 | ✅ |
| Journal Service | 4 | ✅ |

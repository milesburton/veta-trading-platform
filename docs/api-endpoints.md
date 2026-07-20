# API Endpoints Documentation

This document describes all available API endpoints in the VETA system.

## General

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /load-test | originator of a trade. | ❌ |
| POST | /demo-day | Endpoint for /demo-day | ❌ |
| POST | /load-gen/start | Endpoint for /load-gen/start | ❌ |
| POST | /load-gen/stop | Endpoint for /load-gen/stop | ❌ |
| GET | /load-gen/status | Endpoint for /load-gen/status | ❌ |
| GET | /scenarios | Endpoint for /scenarios | ❌ |
| POST | /scenarios | Endpoint for /scenarios | ❌ |
| GET | /me | Endpoint for /me | ✅ |
| GET | /orders | Endpoint for /orders | ✅ |
| GET | /products | Endpoint for /products | ✅ |
| POST | /analytics/quote | Endpoint for /analytics/quote | ✅ |
| POST | /analytics/scenario | Endpoint for /analytics/scenario | ✅ |
| POST | /analytics/recommend | Endpoint for /analytics/recommend | ✅ |
| POST | /analytics/bond-price | Endpoint for /analytics/bond-price | ✅ |
| POST | /analytics/yield-curve | Endpoint for /analytics/yield-curve | ✅ |
| POST | /analytics/spread-analysis | Endpoint for /analytics/spread-analysis | ✅ |
| POST | /analytics/duration-ladder | Endpoint for /analytics/duration-ladder | ✅ |
| GET | /intelligence/weights | Endpoint for /intelligence/weights | ✅ |
| PUT | /intelligence/weights | Endpoint for /intelligence/weights | ✅ |
| GET | /intelligence/recommendations | Endpoint for /intelligence/recommendations | ✅ |
| POST | /intelligence/scenario | Endpoint for /intelligence/scenario | ✅ |
| POST | /intelligence/replay | Endpoint for /intelligence/replay | ✅ |
| POST | /advisory/request | Endpoint for /advisory/request | ✅ |
| GET | /advisory/jobs | Endpoint for /advisory/jobs | ✅ |
| GET | /advisory/admin/state | Endpoint for /advisory/admin/state | ✅ |
| PUT | /advisory/admin/state | Endpoint for /advisory/admin/state | ✅ |
| POST | /advisory/admin/watchlist-brief | Endpoint for /advisory/admin/watchlist-brief | ✅ |
| POST | /advisory/admin/trigger-worker | Endpoint for /advisory/admin/trigger-worker | ✅ |

## Market Simulator

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /assets | Endpoint for /assets | ✅ |

## Journal Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /data-depth | Endpoint for /data-depth | ✅ |
| GET | /candles | Endpoint for /candles | ✅ |
| POST | /grid/query | Endpoint for /grid/query | ✅ |

## Dark Pool

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /pool/stats | Endpoint for /pool/stats | ✅ |

## CCP Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /ccp/stats | Endpoint for /ccp/stats | ✅ |
| GET | /ccp/settlements | Endpoint for /ccp/settlements | ✅ |

## RFQ Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /rfq/stats | Endpoint for /rfq/stats | ✅ |
| GET | /rfq | Endpoint for /rfq | ✅ |
| POST | /rfq/sellside | Endpoint for /rfq/sellside | ✅ |
| GET | /rfq/sellside | Endpoint for /rfq/sellside | ✅ |
| GET | /rfq/sellside/stats | Endpoint for /rfq/sellside/stats | ✅ |

## Product Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /products/stats | Endpoint for /products/stats | ✅ |
| POST | /products | Endpoint for /products | ✅ |

## User Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /preferences | Endpoint for /preferences | ✅ |
| PUT | /preferences | Endpoint for /preferences | ✅ |
| GET | /shared-workspaces | Endpoint for /shared-workspaces | ✅ |
| POST | /shared-workspaces | Endpoint for /shared-workspaces | ✅ |
| GET | /alerts | Endpoint for /alerts | ✅ |
| POST | /alerts | Endpoint for /alerts | ✅ |
| PUT | /alerts/dismiss-all | Endpoint for /alerts/dismiss-all | ✅ |

## Market Data Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /market-data/sources | Endpoint for /market-data/sources | ✅ |
| GET | /market-data/overrides | Endpoint for /market-data/overrides | ✅ |
| PUT | /market-data/overrides | Endpoint for /market-data/overrides | ✅ |

## Summary

| Service | Endpoints | Auth Required |
|---------|-----------|---------------|
| General | 28 | ✅ |
| Market Simulator | 1 | ✅ |
| Journal Service | 3 | ✅ |
| Dark Pool | 1 | ✅ |
| CCP Service | 2 | ✅ |
| RFQ Service | 5 | ✅ |
| Product Service | 2 | ✅ |
| User Service | 7 | ✅ |
| Market Data Service | 3 | ✅ |

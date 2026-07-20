# API Endpoints Documentation

This document describes all available API endpoints in the VETA system.

## Market Simulator

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /scenarios | Endpoint for /scenarios | ❌ |
| GET | /assets | Endpoint for /assets | ✅ |

## Journal Service

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /data-depth | Endpoint for /data-depth | ✅ |
| GET | /candles | Endpoint for /candles | ✅ |
| GET | /orders | Endpoint for /orders | ✅ |
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
| GET | /products | Endpoint for /products | ✅ |
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
| Market Simulator | 2 | ✅ |
| Journal Service | 4 | ✅ |
| Dark Pool | 1 | ✅ |
| CCP Service | 2 | ✅ |
| RFQ Service | 5 | ✅ |
| Product Service | 3 | ✅ |
| User Service | 7 | ✅ |
| Market Data Service | 3 | ✅ |

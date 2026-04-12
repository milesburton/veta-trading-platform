---
title: Demo Personas
description: Every seeded user, their desk, trading style, and what they can access.
---

Every trader is modeled after a real-world desk: **exactly one primary desk, exactly one trading style**. Cross-asset-class traders do not exist; regulatory segregation and product specialisation make them unrealistic. Multi-desk oversight is modeled through the separate `desk-head` role with read-only cross-desk access.

## Equity cash traders

| User | Style | Purpose |
|------|-------|---------|
| **alice** | High touch | Canonical high-touch trader — manual ticket, click-to-submit |
| **bob** | Low touch | Canonical low-touch trader — VWAP/POV/TWAP algo flow |
| **james** | High touch | Senior — large tickets, dark pool access, ICEBERG/SNIPER |
| **sofia** | Low touch | Junior trainee — 1k share cap, LIMIT/TWAP only |
| **dave** | Low touch | Junior trainee — tight limits |
| **iris** | Low touch | Algo trader — pairs with Bob for multi-user demos |
| **amelia** | High touch | Mid-cap UK equities, manual execution |

## Equity derivatives traders

| User | Style | Purpose |
|------|-------|---------|
| **grace** | Derivs high touch | Manual options with vol surface + greeks |
| **priya** | Derivs high touch | Structured payoffs, volatility arb |
| **omar** | Derivs low touch | Vol-targeting algo strategies |

## Fixed income traders

| User | Desk | Style | Purpose |
|------|------|-------|---------|
| **carol** | FI govies | FI voice | Canonical — RFQ, yield curve, duration ladder |
| **henry** | FI credit | FI voice | Credit RFQs via sales workbench |

## FX traders

| User | Style | Purpose |
|------|-------|---------|
| **luca** | FX electronic | High-notional cash FX with dark pool |
| **yuki** | High touch | FX desk — manual EUR/USD, USD/JPY quotes |

## Commodities traders

| User | Style | Purpose |
|------|-------|---------|
| **rajesh** | Commodities voice | Oil, metals, agriculture RFQs |

## Oversight & support roles

| User | Role | Purpose |
|------|------|---------|
| **frank** | Desk head | Read-only oversight across equity cash + equity derivs + FI rates |
| **maya** | Risk manager | Sets VaR/notional limits, halts trading on breach (read-only book access) |
| **compliance** | Compliance | Read-only audit, session replay, trade review |
| **admin** | Admin | Mission Control, load test, LLM subsystem, RBAC |

## Trading style enforcement

Trading style is enforced at the panel level:

- **Low-touch traders** cannot open the manual Order Ticket — they use the Algo Monitor workspace
- **High-touch traders** cannot open the Algo Monitor — they use the Trading workspace
- **FI voice traders** see yield curve, duration ladder, and spread analysis panels that equity traders don't
- **Derivatives traders** get vol surface, greeks, option pricing, and scenario matrix panels
- **Default workspaces** follow the style: high-touch lands on Trading, low-touch on Algo, FI voice on FI Trading, derivatives on Options

The default demo passcode is `veta-dev-passcode` (configurable via `OAUTH2_SHARED_SECRET`).

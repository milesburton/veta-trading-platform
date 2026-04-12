---
title: RBAC & Permissions
description: Role-based access control for panels, orders, and admin functions.
---

## Roles

| Role | Can trade | Can admin | Panel access |
|------|-----------|-----------|-------------|
| `trader` | Yes | No | Style-dependent (see Trading Styles) |
| `desk-head` | No | No | Read-only cross-desk oversight |
| `risk-manager` | No | No | Read-only all desks + session replay |
| `admin` | No | Yes | Everything except order-ticket |
| `compliance` | No | No | Read-only + session replay |
| `sales` | No | No | Sales workbench, market data |
| `external-client` | No | No | Client RFQ only |
| `viewer` | No | No | Market data + analytics read-only |

## Panel permissions

Every panel has a `PANEL_PERMISSIONS` entry defining which roles can access it, and an optional `PANEL_TRADING_STYLES` entry further restricting trader access by style.

The `canAccessPanel(panelId, role, tradingStyle)` function is the single source of truth, used by:
- **ComponentPicker** — filters the "Add Panel" dropdown
- **DashboardLayout factory** — renders "no permission" message for unauthorized panels in saved layouts

## Enforcement points

1. **Frontend ComponentPicker**: panel not shown if role/style doesn't match
2. **Frontend DashboardLayout factory**: unauthorized panel renders denial message
3. **Frontend Order Ticket role-check**: blocks order submission with per-role/per-style messages
4. **Backend OMS**: rejects orders from non-trader roles
5. **Backend OMS**: rejects orders failing risk-engine checks

# Shared Type Definitions

[![CI](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/milesburton/veta-trading-platform/actions/workflows/ci.yml)

This directory contains TypeScript definitions shared by both backend (Deno) and frontend (Vite + TypeScript) modules.

## Standards

- No runtime logic. Only types and constant arrays are permitted.
- No external dependencies. Files must compile without imports from `backend/`, `frontend/`, or third-party packages.
- Single source of truth. Shared primitives must be defined here and reused elsewhere.

## Import paths

- Backend imports use `@veta/primitives` via [deno.json](../deno.json).
- Frontend imports use `@shared/primitives` via [frontend/tsconfig.json](../frontend/tsconfig.json) and [frontend/vite.config.ts](../frontend/vite.config.ts).

## Schema alignment

Backend schema mirrors are maintained in [backend/src/schemas/primitives.ts](../backend/src/schemas/primitives.ts), with `satisfies z.ZodType<T>` used to keep schema and type definitions aligned.

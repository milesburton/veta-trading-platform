# shared/

Plain TypeScript types imported by **both backend (Deno) and frontend (Vite + TS)**.

## Rules

- **No runtime code.** Types and const arrays only. No Zod, no functions, no classes.
- **No dependencies.** These files must compile with zero imports from `backend/`, `frontend/`, or any npm package other than TS itself.
- **Single source of truth.** If a value appears both here and elsewhere, this directory wins. Delete the duplicate.

## How it's imported

- Backend: `import { OrderSide } from "@veta/primitives"` (via [deno.json](../deno.json) import map)
- Frontend: `import type { OrderSide } from "@shared/primitives"` (via [frontend/tsconfig.json](../frontend/tsconfig.json) `paths` + [frontend/vite.config.ts](../frontend/vite.config.ts) `resolve.alias`)

## Zod wrappers

The backend mirrors each type as a Zod schema in [backend/src/schemas/primitives.ts](../backend/src/schemas/primitives.ts), using `satisfies z.ZodType<T>` so the two representations cannot drift.

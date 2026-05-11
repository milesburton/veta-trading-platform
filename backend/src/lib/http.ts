import type { z, ZodTypeAny } from "@veta/zod";

// CORS allowlist for shared @veta/http helpers (proxy.ts and a handful of
// internal services that import this). The gateway has its own per-request
// CORS logic; internal services are behind the gateway and rarely accessed
// cross-origin directly. We opt out of `Access-Control-Allow-Origin: *` —
// if a future internal service genuinely needs cross-origin browser access,
// it can compose headers similarly to gateway.ts (reflect Origin when in
// CORS_ALLOWED_ORIGINS).
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
};

export function json(
  data: unknown,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

export function jsonError(
  error: string,
  status = 400,
  extra?: Record<string, string>,
): Response {
  return json({ error }, status, extra);
}

export function corsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; res: Response };

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError("invalid json", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      res: json(
        { error: "validation_failed", issues: result.error.issues },
        400,
      ),
    };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<S extends ZodTypeAny>(
  url: URL,
  schema: S,
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    return {
      ok: false,
      res: json(
        { error: "validation_failed", issues: result.error.issues },
        400,
      ),
    };
  }
  return { ok: true, data: result.data };
}

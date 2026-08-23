import type { ZodTypeAny, z } from "@veta/zod";

// docs: /reference/api-gateway/
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

export function jsonError(error: string, status = 400, extra?: Record<string, string>): Response {
  return json({ error }, status, extra);
}

export function corsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; res: Response };

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S
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
      res: json({ error: "validation_failed", issues: result.error.issues }, 400),
    };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<S extends ZodTypeAny>(url: URL, schema: S): ParseResult<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    return {
      ok: false,
      res: json({ error: "validation_failed", issues: result.error.issues }, 400),
    };
  }
  return { ok: true, data: result.data };
}

// fallow-ignore-next-line unused-export
export function serveJsonService(options: {
  port: number;
  service: string;
  version: string;
  health: () => Record<string, unknown>;
  handler: (req: Request, url: URL, path: string) => Response | Promise<Response>;
  signal?: AbortSignal;
}): Deno.HttpServer {
  return Deno.serve(
    { port: options.port, signal: options.signal },
    async (req: Request): Promise<Response> => {
      if (req.method === "OPTIONS") {
        return corsOptions();
      }

      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/health" && req.method === "GET") {
        return json({
          service: options.service,
          version: options.version,
          status: "ok",
          ...options.health(),
        });
      }

      return options.handler(req, url, path);
    }
  );
}

import { CORS_HEADERS } from "@veta/http";

const POST_TIMEOUT_MS = 15_000;
const GET_PUT_TIMEOUT_MS = 8_000;

export async function proxyPost(internalUrl: string, req: Request): Promise<Response> {
  try {
    const body = await req.text();
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    const resBody = await res.arrayBuffer();
    const headers: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      ...CORS_HEADERS,
    };
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) headers["Set-Cookie"] = setCookie;
    return new Response(resBody, { status: res.status, headers });
  } catch (err) {
    return badGateway(err as Error);
  }
}

export async function proxyPut(internalUrl: string, req: Request): Promise<Response> {
  try {
    const body = await req.text();
    const res = await fetch(internalUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(GET_PUT_TIMEOUT_MS),
    });
    const resBody = await res.arrayBuffer();
    return new Response(resBody, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return badGateway(err as Error);
  }
}

export async function proxyGet(internalUrl: string, req: Request): Promise<Response> {
  const src = new URL(req.url);
  const target = new URL(internalUrl);
  target.search = src.search;
  try {
    const res = await fetch(target.toString(), {
      method: req.method,
      signal: AbortSignal.timeout(GET_PUT_TIMEOUT_MS),
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return badGateway(err as Error);
  }
}

function badGateway(err: Error): Response {
  return new Response(JSON.stringify({ error: err.message }), {
    status: 502,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

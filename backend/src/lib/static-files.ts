import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export async function serveDir(
  req: Request,
  options: { fsRoot: string; quiet?: boolean }
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const root = normalize(options.fsRoot);
  let target = normalize(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) {
    return new Response("Not Found", { status: 404 });
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, "index.html");
    const body = await readFile(target);
    return new Response(req.method === "HEAD" ? null : body, {
      headers: {
        "content-type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        "content-length": String(body.length),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

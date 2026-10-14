export function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

export const SERVICE_TOKEN_HEADER = "x-veta-service-token";

export function hasValidServiceToken(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const provided = req.headers.get(SERVICE_TOKEN_HEADER);
  if (provided === null) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  const length = Math.max(a.length, b.length);
  const mismatches = Array.from({ length }, (_, i) => (a[i] ?? 0) ^ (b[i] ?? 0)).reduce(
    (acc, diff) => acc | diff,
    a.length ^ b.length
  );
  return mismatches === 0;
}

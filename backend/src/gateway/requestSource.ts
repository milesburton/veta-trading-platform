// docs: /reference/api-gateway/
export function classifyRequestSource(ua: string | null | undefined): "loadgen" | undefined {
  if (!ua) return undefined;
  if (ua.startsWith("k6/")) return "loadgen";
  return undefined;
}

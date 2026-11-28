export function deriveServiceName(): string {
  const explicit = process.env.OTEL_SERVICE_NAME;
  if (explicit && explicit.length > 0) return explicit;
  const host = process.env.HOSTNAME ?? "";
  const stripped = host.replace(/^veta-/, "").replace(/-\d+$/, "");
  return stripped || "veta-service";
}

export function withInstanceId(resourceAttributes: string | undefined, instanceId: string): string {
  const existing = (resourceAttributes ?? "").split(",").filter((pair) => pair.trim().length > 0);
  if (existing.some((pair) => pair.trim().startsWith("service.instance.id="))) {
    return existing.join(",");
  }
  return [...existing, `service.instance.id=${encodeURIComponent(instanceId)}`].join(",");
}

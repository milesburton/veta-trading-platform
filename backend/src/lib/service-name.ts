export function deriveServiceName(): string {
  const explicit = process.env.OTEL_SERVICE_NAME;
  if (explicit && explicit.length > 0) return explicit;
  const host = process.env.HOSTNAME ?? "";
  const stripped = host.replace(/^veta-/, "").replace(/-\d+$/, "");
  return stripped || "veta-service";
}

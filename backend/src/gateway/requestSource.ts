/**
 * Classify a request by its User-Agent so security alerts can filter out
 * known automated traffic (loadgen) from real signal.
 *
 * Tagging at access-event time is what makes this useful — the alert rules
 * just need to add `!= "\"source\":\"loadgen\""` to their Loki queries to
 * silence noise during a load run without losing real incident signal.
 *
 * k6 (the loadgen container's HTTP client) sends `User-Agent: k6/0.55.0`.
 * A real attacker doesn't advertise "k6" in their UA, so this is a
 * tight filter — it explicitly does NOT trust the UA for any AUTH or
 * AUTHZ decision, only for noise-classification on outbound alerts.
 */
export function classifyRequestSource(ua: string | null | undefined): "loadgen" | undefined {
  if (!ua) return undefined;
  if (ua.startsWith("k6/")) return "loadgen";
  return undefined;
}

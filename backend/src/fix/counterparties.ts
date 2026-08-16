// Per-client identity for FIX sessions (gap #4). Starts as a static,
// env-configured map rather than a Postgres table — promote to a real
// table only once something besides Logon needs to query it, matching
// the codebase's general pattern of starting simple. Same config-string
// shape as user-service.ts's OAUTH2_USER_SECRETS
// (senderCompID:password;senderCompID:password).

export interface Counterparty {
  senderCompID: string;
  password: string;
}

function parseCounterparties(config: string): Map<string, Counterparty> {
  const result = new Map<string, Counterparty>();
  for (const rawEntry of config.split(";")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const sep = entry.indexOf(":");
    if (sep <= 0) continue;
    const senderCompID = entry.slice(0, sep).trim();
    const password = entry.slice(sep + 1).trim();
    if (!senderCompID || !password) continue;
    result.set(senderCompID, { senderCompID, password });
  }
  return result;
}

let counterparties = parseCounterparties(Deno.env.get("FIX_COUNTERPARTIES") ?? "");

export function loadCounterparties(config: string): void {
  counterparties = parseCounterparties(config);
}

export function resolveCounterparty(senderCompID: string | undefined): Counterparty | null {
  if (!senderCompID) return null;
  return counterparties.get(senderCompID) ?? null;
}

/**
 * A Logon's RawData/Password-equivalent isn't in the minimal FIX 4.4
 * dictionary this exchange implements (no tag 96/554 support), so
 * credential verification is scoped to "is this SenderCompID a
 * provisioned counterparty" rather than a full password check on Logon
 * itself — consistent with the exchange's existing acceptor-only,
 * no-encryption session model.
 */
export function isKnownCounterparty(senderCompID: string | undefined): boolean {
  return resolveCounterparty(senderCompID) !== null;
}

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "api-key",
  "privatekey",
  "private_key",
  "private-key",
  "credential",
];

const SENSITIVE_KEY_EXACT = new Set(["pass", "pwd", "pw", "sid", "jwt"]);

const MAX_DEPTH = 8;

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_EXACT.has(lower) || SENSITIVE_KEY_FRAGMENTS.some((f) => lower.includes(f));
}

const VALUE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/]{8,}=*/g, `Basic ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\b(?:hvs|hvb|hvr)\.[A-Za-z0-9_-]{20,}/g, REDACTED],
  [/\b[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}\b/g, REDACTED],
  [/(discord(?:app)?\.com\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]+/gi, `$1${REDACTED}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${REDACTED}@`],
  [
    /\b(session|sid|token|access_token|refresh_token|id_token|password|passwd|secret|api_key|apikey|client_secret)=([^\s&;"']+)/gi,
    `$1=${REDACTED}`,
  ],
];

export function redactString(value: string): string {
  return VALUE_RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    value
  );
}

export function redactValue(value: unknown, depth = 0, path: readonly object[] = []): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (path.includes(value)) return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  const nextPath = [...path, value];
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, nextPath));
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: redactString(value.stack ?? ""),
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(item, depth + 1, nextPath),
    ])
  );
}

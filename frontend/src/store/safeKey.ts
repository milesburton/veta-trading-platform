// Guards against prototype-pollution / remote-property-injection when
// indexing a Record<string, T> with a key that originated from external
// input (Kafka payload, gateway message, ?query=). Rejects "__proto__",
// "constructor", "prototype", anything with non-printable chars, and
// values that are too long to be a legitimate id.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_KEY_RE = /^[\w./:-]{1,128}$/;

export function isSafeKey(key: unknown): key is string {
  return typeof key === "string" && !FORBIDDEN_KEYS.has(key) && SAFE_KEY_RE.test(key);
}

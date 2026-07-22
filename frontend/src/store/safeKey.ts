// docs: /platform/security/
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_KEY_RE = /^[\w./:-]{1,128}$/;

export function isSafeKey(key: unknown): key is string {
  return typeof key === "string" && !FORBIDDEN_KEYS.has(key) && SAFE_KEY_RE.test(key);
}

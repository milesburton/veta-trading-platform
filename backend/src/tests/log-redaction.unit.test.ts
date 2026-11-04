import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { isSensitiveKey, REDACTED, redactString, redactValue } from "../lib/log-redaction.ts";
import { logger, registerLogSink } from "../lib/logger.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVl";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const ANTHROPIC_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const SLACK_TOKEN = "xoxb-123456789012-abcdefghijkl";
const VAULT_TOKEN = "hvs.CAESIJabcdefghijklmnopqrstuvwxyz";
const DISCORD_SECRET = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF";
const DB_PASSWORD = "s3cr3t-db-pass";
const PRIVATE_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";

const SECRETS = [
  JWT,
  GITHUB_TOKEN,
  ANTHROPIC_KEY,
  AWS_KEY,
  SLACK_TOKEN,
  VAULT_TOKEN,
  DISCORD_SECRET,
  DB_PASSWORD,
  "MIIEowIBAAKCAQEA",
  "hunter2",
  "session-cookie-value",
];

const CORPUS: Record<string, unknown> = {
  password: "hunter2",
  nested: { apiKey: ANTHROPIC_KEY, deeper: { client_secret: "hunter2" } },
  headers: { Authorization: `Bearer ${JWT}`, cookie: "session=session-cookie-value" },
  list: [`token=${GITHUB_TOKEN}`, { passwd: "hunter2" }],
  url: `postgres://veta:${DB_PASSWORD}@postgres:5432/veta`,
  webhook: `https://discord.com/api/webhooks/123456789012345678/${DISCORD_SECRET}`,
  cloud: `${AWS_KEY} ${SLACK_TOKEN} ${VAULT_TOKEN}`,
  pem: PRIVATE_KEY,
  err: new Error(`connect failed for postgres://veta:${DB_PASSWORD}@db/veta using Bearer ${JWT}`),
};

function leaked(text: string): string[] {
  return SECRETS.filter((secret) => text.includes(secret));
}

function captureStdout(fn: () => void): string {
  const original = process.stdout.write;
  const chunks: string[] = [];
  process.stdout.write = ((data: string | Uint8Array) => {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

test("[redaction] no secret from the corpus reaches stdout on any log level", () => {
  const output = captureStdout(() => {
    for (const level of ["info", "warn", "error"] as const) {
      logger[level](`leak check ${level} Bearer ${JWT}`, CORPUS);
    }
  });
  assertEquals(leaked(output), []);
  assert(output.includes(REDACTED));
});

test("[redaction] sinks receive the redacted line, message and context", () => {
  const seen: string[] = [];
  const unregister = registerLogSink((_level, msg, line, ctx) => {
    seen.push(msg, line, JSON.stringify(ctx));
  });
  try {
    captureStdout(() => logger.error(`token=${GITHUB_TOKEN}`, CORPUS));
  } finally {
    unregister();
  }
  assertEquals(seen.length, 3);
  assertEquals(leaked(seen.join("\n")), []);
});

test("[redaction] a secret in the error fallback path is redacted", () => {
  const circular: Record<string, unknown> = { password: "hunter2" };
  circular.self = circular;
  const output = captureStdout(() => logger.error(`Bearer ${JWT}`, circular));
  assertEquals(leaked(output), []);
});

test("[redaction] key matching covers common names and spares ordinary ones", () => {
  for (const key of [
    "password",
    "Authorization",
    "x-api-key",
    "accessToken",
    "Set-Cookie",
    "clientSecret",
    "PRIVATE_KEY",
  ]) {
    assert(isSensitiveKey(key), key);
  }
  for (const key of ["symbol", "orderId", "passed", "status", "keyboard", "price"]) {
    assert(!isSensitiveKey(key), key);
  }
});

test("[redaction] ordinary context is left unchanged", () => {
  const ctx = {
    symbol: "AAPL",
    qty: 100,
    nested: { side: "BUY", tags: ["a", "b"] },
    ok: true,
    none: null,
  };
  assertEquals(redactValue(ctx), ctx);
  assertEquals(redactString("order 42 filled at 190.37"), "order 42 filled at 190.37");
});

test("[redaction] deeply nested values are truncated rather than traversed forever", () => {
  const deep = Array.from({ length: 20 }).reduce<Record<string, unknown>>(
    (acc) => ({ child: acc }),
    { leaf: 1 }
  );
  assert(JSON.stringify(redactValue(deep)).includes("[Truncated]"));
});

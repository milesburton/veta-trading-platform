import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";

const GUARD = new URL("../../../scripts/lib/require-real-secrets.sh", import.meta.url).pathname;
const COMPOSE_PROD = readFileSync(new URL("../../../compose.prod.yml", import.meta.url), "utf8");
const DEPLOY = readFileSync(new URL("../../../scripts/homelab-deploy.sh", import.meta.url), "utf8");

const GOOD = {
  POSTGRES_PASSWORD: "p-9f3c",
  AUDIT_DB_PASSWORD: "a-4e18",
  MINIO_ROOT_PASSWORD: "m-71aa",
  INTERNAL_SERVICE_TOKEN: "t-5b20",
};

const runGuard = (env: Record<string, string>) =>
  runCommand("bash", ["-c", `. "${GUARD}"; require_real_secrets`], {
    env: { ...process.env, ...env },
  });

test("[prod-secrets] the guard accepts real values", async () => {
  assertEquals((await runGuard(GOOD)).code, 0);
});

test("[prod-secrets] the guard rejects a missing secret", async () => {
  const { POSTGRES_PASSWORD: _omitted, ...rest } = GOOD;
  assertEquals((await runGuard(rest)).code, 1);
});

test("[prod-secrets] the guard rejects each known compose default", async () => {
  const defaults = {
    POSTGRES_PASSWORD: "veta",
    AUDIT_DB_PASSWORD: "veta_audit",
    MINIO_ROOT_PASSWORD: "change-me-in-production",
    INTERNAL_SERVICE_TOKEN: "veta-dev-service-token",
  };
  for (const [name, value] of Object.entries(defaults)) {
    assertEquals((await runGuard({ ...GOOD, [name]: value })).code, 1, name);
  }
});

test("[prod-secrets] the optional application database password may be absent but not a default", async () => {
  assertEquals((await runGuard({ ...GOOD, APP_DB_PASSWORD: "" })).code, 0);
  assertEquals((await runGuard({ ...GOOD, APP_DB_PASSWORD: "s-83d1" })).code, 0);
  assertEquals((await runGuard({ ...GOOD, APP_DB_PASSWORD: "veta_app" })).code, 1);
});

test("[prod-secrets] compose.prod.yml has no defaulted secret variables", () => {
  const defaulted = COMPOSE_PROD.split("\n").filter((line) =>
    /\$\{[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z0-9_]*:-[^}]/.test(line)
  );
  assertEquals(defaulted, []);
});

test("[prod-secrets] the deploy runs the guard after loading the platform secrets", () => {
  assert(
    DEPLOY.indexOf("openbao_export platform") < DEPLOY.indexOf("require_real_secrets"),
    "require_real_secrets must run after openbao_export platform"
  );
});

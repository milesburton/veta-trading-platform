import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

const SCRIPT = read("scripts/openbao-recover-admin.py");
const NORMAL = read("deploy/openbao/config/openbao.hcl");
const RECOVERY = read("deploy/openbao/recovery/openbao.hcl");
const OVERRIDE = read("deploy/openbao/compose.recovery.yml");

const position = (needle: string): number => {
  const index = SCRIPT.indexOf(needle);
  assert(index >= 0, `missing: ${needle}`);
  return index;
};

test("[openbao-recovery] the recovery config differs from the normal one only by the generate-root flag", () => {
  const flag = /^\s*disable_unauthed_generate_root_endpoints\s*=\s*false\s*\n/m;
  assert(flag.test(RECOVERY));
  assertEquals(RECOVERY.replace(flag, ""), NORMAL);
  assert(!/disable_unauthed_generate_root_endpoints/.test(NORMAL));
});

test("[openbao-recovery] the override swaps only the config mount", () => {
  assert(OVERRIDE.includes("./recovery:/openbao/config:ro"));
  assert(!/image:|ports:|command:/.test(OVERRIDE));
});

test("[openbao-recovery] the recovery key and password come from stdin, never arguments", () => {
  assert(SCRIPT.includes("sys.stdin.read()"));
  assert(SCRIPT.includes("len(lines[1].strip()) < 16"));
  assert(!SCRIPT.includes("sys.argv"));
});

test("[openbao-recovery] the normal configuration is restored in a finally block, after the root token is revoked", () => {
  assert(position("finally:") < position('"POST", "auth/token/revoke-self", token=root'));
  assert(
    position('"POST", "auth/token/revoke-self", token=root') < position("compose_up(COMPOSE)\n")
  );
});

test("[openbao-recovery] success requires the unauthenticated endpoint to be closed again", () => {
  assert(SCRIPT.includes("is still open after restoring the configuration"));
});

test("[openbao-recovery] a failed generate-root attempt is cancelled", () => {
  assert(SCRIPT.includes('"DELETE", "sys/generate-root/attempt"'));
});

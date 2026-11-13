import { readFileSync } from "node:fs";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const SCRIPT = readFileSync(
  new URL("../../../scripts/openbao-rebuild.py", import.meta.url),
  "utf8"
);

const position = (needle: string): number => {
  const index = SCRIPT.indexOf(needle);
  assert(index >= 0, `missing: ${needle}`);
  return index;
};

test("[openbao-rebuild] secrets are dumped before any storage is touched", () => {
  assert(position("dump_existing()") < position("reset_storage()\n"));
  assert(position("def dump_existing") < position("def reset_storage"));
});

test("[openbao-rebuild] the old volume is archived and verified before it is removed", () => {
  assert(position('"czf"') < position('"volume", "rm"'));
  assert(position("looks empty") < position('"volume", "rm"'));
});

test("[openbao-rebuild] the old deploy credential is kept, not deleted", () => {
  assert(SCRIPT.includes("APPROLE_FILE.rename(APPROLE_BACKUP)"));
  assert(!/APPROLE_FILE\.unlink/.test(SCRIPT));
});

test("[openbao-rebuild] the admin password is read from stdin and length checked", () => {
  assert(SCRIPT.includes("sys.stdin.read()"));
  assert(SCRIPT.includes("len(admin_password) < 16"));
  assert(!SCRIPT.includes("sys.argv"));
});

test("[openbao-rebuild] restored values are verified through the deploy loader before root is revoked", () => {
  assert(position("bs.loader_view(") < position("round trip mismatch"));
  assert(
    position("round trip mismatch") < position('"POST", "auth/token/revoke-self", token=root')
  );
});

test("[openbao-rebuild] restores never overwrite an existing path", () => {
  assert(SCRIPT.includes('"options": {"cas": 0}'));
});

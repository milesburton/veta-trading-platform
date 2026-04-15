import { assert } from "jsr:@std/assert@0.217";

import {
  AlertCreateSchema,
  AuthorizeRequestSchema,
  LimitsUpdateSchema,
  PreferencesUpdateSchema,
  RegisterRequestSchema,
  SessionValidateSchema,
  SharedWorkspaceCreateSchema,
  TokenRequestSchema,
} from "../schemas/user.ts";

Deno.test("[user-schema] SessionValidateSchema accepts token or nothing", () => {
  assert(SessionValidateSchema.safeParse({}).success);
  assert(SessionValidateSchema.safeParse({ token: "abc123" }).success);
  assert(!SessionValidateSchema.safeParse({ token: 42 }).success);
});

Deno.test("[user-schema] AuthorizeRequestSchema requires response_type=code, S256, code_challenge", () => {
  const ok = AuthorizeRequestSchema.safeParse({
    client_id: "veta-web",
    username: "alice",
    password: "secret",
    response_type: "code",
    code_challenge: "abc",
    code_challenge_method: "S256",
    scope: "openid profile",
  });
  assert(ok.success, JSON.stringify(ok));
});

Deno.test("[user-schema] AuthorizeRequestSchema rejects bad response_type", () => {
  const res = AuthorizeRequestSchema.safeParse({
    response_type: "token",
    code_challenge: "abc",
    code_challenge_method: "S256",
  });
  assert(!res.success);
  if (!res.success) {
    const paths = res.error.issues.map((i) => i.path.join("."));
    assert(paths.includes("response_type"));
  }
});

Deno.test("[user-schema] AuthorizeRequestSchema rejects missing code_challenge", () => {
  const res = AuthorizeRequestSchema.safeParse({
    response_type: "code",
    code_challenge_method: "S256",
  });
  assert(!res.success);
  if (!res.success) {
    const paths = res.error.issues.map((i) => i.path.join("."));
    assert(paths.includes("code_challenge"));
  }
});

Deno.test("[user-schema] AuthorizeRequestSchema rejects non-S256 challenge method", () => {
  const res = AuthorizeRequestSchema.safeParse({
    response_type: "code",
    code_challenge: "abc",
    code_challenge_method: "plain",
  });
  assert(!res.success);
});

Deno.test("[user-schema] AuthorizeRequestSchema accepts an unknown client_id (auth rejects later, not schema)", () => {
  const res = AuthorizeRequestSchema.safeParse({
    client_id: "unknown-client",
    response_type: "code",
    code_challenge: "abc",
    code_challenge_method: "S256",
  });
  assert(res.success, "schema should accept unknown client_id; OAuth layer returns 401");
});

Deno.test("[user-schema] TokenRequestSchema requires grant_type=authorization_code, code, code_verifier", () => {
  assert(
    TokenRequestSchema.safeParse({
      grant_type: "authorization_code",
      code: "xyz",
      code_verifier: "verifier",
    }).success,
  );
  assert(
    !TokenRequestSchema.safeParse({
      grant_type: "password",
      code: "xyz",
      code_verifier: "verifier",
    }).success,
  );
  assert(
    !TokenRequestSchema.safeParse({
      grant_type: "authorization_code",
      code_verifier: "verifier",
    }).success,
  );
  assert(
    !TokenRequestSchema.safeParse({
      grant_type: "authorization_code",
      code: "xyz",
    }).success,
  );
});

Deno.test("[user-schema] RegisterRequestSchema requires name and username-or-userId", () => {
  assert(RegisterRequestSchema.safeParse({ username: "alice", name: "Alice" }).success);
  assert(RegisterRequestSchema.safeParse({ userId: "alice", name: "Alice" }).success);
  assert(!RegisterRequestSchema.safeParse({ name: "Alice" }).success);
  assert(!RegisterRequestSchema.safeParse({ username: "alice" }).success);
});

Deno.test("[user-schema] LimitsUpdateSchema accepts all fields optional", () => {
  assert(LimitsUpdateSchema.safeParse({}).success);
  assert(
    LimitsUpdateSchema.safeParse({
      max_order_qty: 10_000,
      max_daily_notional: 1_000_000,
      allowed_strategies: ["LIMIT", "TWAP"],
      allowed_desks: ["equity"],
      dark_pool_access: true,
    }).success,
  );
});

Deno.test("[user-schema] LimitsUpdateSchema rejects negative max_order_qty", () => {
  assert(!LimitsUpdateSchema.safeParse({ max_order_qty: -1 }).success);
});

Deno.test("[user-schema] LimitsUpdateSchema rejects non-integer max_order_qty", () => {
  assert(!LimitsUpdateSchema.safeParse({ max_order_qty: 100.5 }).success);
});

Deno.test("[user-schema] PreferencesUpdateSchema accepts arbitrary record", () => {
  assert(PreferencesUpdateSchema.safeParse({ theme: "dark", layout: { foo: 1 } }).success);
  assert(PreferencesUpdateSchema.safeParse({}).success);
});

Deno.test("[user-schema] SharedWorkspaceCreateSchema requires name and model", () => {
  assert(SharedWorkspaceCreateSchema.safeParse({ name: "WS1", model: { foo: 1 } }).success);
  assert(!SharedWorkspaceCreateSchema.safeParse({ name: "WS1" }).success);
  assert(!SharedWorkspaceCreateSchema.safeParse({ name: "", model: {} }).success);
});

Deno.test("[user-schema] AlertCreateSchema requires severity, source, message", () => {
  assert(
    AlertCreateSchema.safeParse({
      severity: "warning",
      source: "service",
      message: "slow",
    }).success,
  );
  assert(!AlertCreateSchema.safeParse({ severity: "warning", source: "service" }).success);
  assert(!AlertCreateSchema.safeParse({ severity: "warning", message: "x" }).success);
});

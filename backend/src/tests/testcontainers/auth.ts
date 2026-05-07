import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { TestStack } from "./services.ts";

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = `tc-${crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return { verifier, challenge };
}

export async function login(stack: TestStack, user: string): Promise<string> {
  const us = stack.urls["user-service"];
  if (!us) throw new Error("user-service URL not in stack");
  const { verifier, challenge } = await pkce();
  const auth = await fetch(`${us}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      username: user,
      redirect_uri: "postmessage",
      response_type: "code",
      scope: "openid profile",
      password: "veta-dev-passcode",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  assertEquals(auth.status, 200, `OAuth authorize for ${user} failed`);
  const { code } = await auth.json() as { code: string };

  const tokRes = await fetch(`${us}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      code,
      grant_type: "authorization_code",
      redirect_uri: "postmessage",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  await tokRes.body?.cancel();
  assertEquals(tokRes.status, 200, `token exchange for ${user} failed`);
  const cookie = tokRes.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `no veta_user cookie for ${user}`);
  return match[1];
}

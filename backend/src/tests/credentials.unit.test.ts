// fallow-ignore-file unused-file
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { hashPassword, verifyPassword } from "../user-service/credentials.ts";

Deno.test("hashPassword produces a versioned string with 4 parts", async () => {
  const h = await hashPassword("hunter2");
  const parts = h.split("$");
  assertEquals(parts.length, 4);
  assertEquals(parts[0], "pbkdf2-sha256-v1");
});

Deno.test("verifyPassword accepts the correct password", async () => {
  const h = await hashPassword("hunter2");
  assertEquals(await verifyPassword("hunter2", h), true);
});

Deno.test("verifyPassword rejects an incorrect password", async () => {
  const h = await hashPassword("hunter2");
  assertEquals(await verifyPassword("hunter3", h), false);
});

Deno.test("verifyPassword rejects empty password against any hash", async () => {
  const h = await hashPassword("secret");
  assertEquals(await verifyPassword("", h), false);
});

Deno.test("verifyPassword rejects a malformed stored hash", async () => {
  assertEquals(await verifyPassword("anything", "not-a-hash"), false);
  assertEquals(await verifyPassword("anything", "pbkdf2-sha256-v1$210000$bad"), false);
  assertEquals(await verifyPassword("anything", ""), false);
});

Deno.test("verifyPassword rejects an unknown version", async () => {
  assertEquals(
    await verifyPassword("anything", "bcrypt$10$xyz$abc"),
    false,
  );
});

Deno.test("hashPassword produces different hashes for the same password (random salt)", async () => {
  const a = await hashPassword("hunter2");
  const b = await hashPassword("hunter2");
  assert(a !== b, "salt should differ; got identical hashes");
});

Deno.test("verifyPassword rejects when iterations are absurdly low", async () => {
  // hand-craft a low-iteration record; constant-time math runs but we
  // refuse on policy grounds (matches the >= 10_000 floor).
  const fake = "pbkdf2-sha256-v1$1000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assertEquals(await verifyPassword("anything", fake), false);
});

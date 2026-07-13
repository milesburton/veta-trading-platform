import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { buildWelcomeMessage } from "../discord-bot/discord-bot.ts";

Deno.test("buildWelcomeMessage mentions the joining member", () => {
  const msg = buildWelcomeMessage("<@42>");
  assert(msg.includes("<@42>"));
});

Deno.test("buildWelcomeMessage points to the support channel", () => {
  const msg = buildWelcomeMessage("<@1>");
  assert(msg.includes("#support"));
});

Deno.test("buildWelcomeMessage is a single-line greeting", () => {
  const msg = buildWelcomeMessage("<@1>");
  assertEquals(msg.includes("\n"), false);
});

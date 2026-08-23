import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  buildWelcomeMessage,
  classifyGatewayEnvelope,
  decideWelcomePost,
  extractHeartbeatIntervalMs,
} from "../discord-bot/discord-bot.ts";

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

Deno.test("extractHeartbeatIntervalMs reads heartbeat_interval from the payload", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: { heartbeat_interval: 30_000 } }), 30_000);
});

Deno.test("extractHeartbeatIntervalMs falls back to the Discord default when missing", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10 }), 41_250);
});

Deno.test("extractHeartbeatIntervalMs falls back when d is not an object with the field", () => {
  assertEquals(extractHeartbeatIntervalMs({ op: 10, d: null }), 41_250);
});

Deno.test("classifyGatewayEnvelope: op 10 is a hello with the derived heartbeat interval", () => {
  const action = classifyGatewayEnvelope({ op: 10, d: { heartbeat_interval: 5_000 } });
  assertEquals(action, { kind: "hello", heartbeatIntervalMs: 5_000 });
});

Deno.test("classifyGatewayEnvelope: op 0 t=READY is ready", () => {
  const action = classifyGatewayEnvelope({ op: 0, t: "READY" });
  assertEquals(action, { kind: "ready" });
});

Deno.test("classifyGatewayEnvelope: op 0 t=GUILD_MEMBER_ADD carries the payload", () => {
  const data = { user: { id: "123" } };
  const action = classifyGatewayEnvelope({ op: 0, t: "GUILD_MEMBER_ADD", d: data });
  assertEquals(action, { kind: "guildMemberAdd", data });
});

Deno.test("classifyGatewayEnvelope: unrecognised op/t pairs are ignored", () => {
  assertEquals(classifyGatewayEnvelope({ op: 11 }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0, t: "MESSAGE_CREATE" }), { kind: "ignore" });
  assertEquals(classifyGatewayEnvelope({ op: 0 }), { kind: "ignore" });
});

Deno.test("decideWelcomePost posts when a channel is configured and the member has an id", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "chan-1");
  assertEquals(decision.shouldPost, true);
  assertEquals(decision.channelId, "chan-1");
  assert(decision.message?.includes("<@42>"));
});

Deno.test("decideWelcomePost does not post when no welcome channel is configured", () => {
  const decision = decideWelcomePost({ user: { id: "42" } }, "");
  assertEquals(decision.shouldPost, false);
  assertEquals(decision.channelId, undefined);
  assertEquals(decision.message, undefined);
});

Deno.test("decideWelcomePost does not post when the payload has no user", () => {
  const decision = decideWelcomePost({}, "chan-1");
  assertEquals(decision.shouldPost, false);
});

Deno.test("decideWelcomePost does not post when the payload is not an object with a user", () => {
  const decision = decideWelcomePost(null, "chan-1");
  assertEquals(decision.shouldPost, false);
});

import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { MsgType, Tag } from "../fix/fix-dictionary.ts";
import { decode, encode } from "../fix/fix-parser.ts";
import { FixSession, type SessionConfig, type SessionState } from "../fix/fix-session.ts";

function harness(overrides: Partial<SessionConfig> = {}) {
  const sent: string[] = [];
  const appMessages: Map<number, string>[] = [];
  const states: SessionState[] = [];
  const session = new FixSession({
    senderCompID: "EXCHANGE",
    targetCompID: "GATEWAY",
    heartBtInt: 30,
    onSend: (msg) => sent.push(msg),
    onApplicationMessage: (tags) => appMessages.push(tags),
    onStateChange: (state) => states.push(state),
    ...overrides,
  });
  return { session, sent, appMessages, states };
}

function logonFrom(senderSeq = 1): string {
  return encode([
    [Tag.MsgType, MsgType.Logon],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, senderSeq],
    [Tag.EncryptMethod, "0"],
    [Tag.HeartBtInt, 30],
  ]);
}

Deno.test("[fix-session] acceptor: inbound Logon transitions DISCONNECTED → ACTIVE and echoes Logon back", () => {
  const { session, sent, states } = harness();
  session.handleInbound(logonFrom(1));
  assertEquals(session.sessionState, "ACTIVE");
  assertEquals(states, ["ACTIVE"]);
  assertEquals(sent.length, 1);
  const reply = decode(sent[0]);
  assertEquals(reply.get(Tag.MsgType), MsgType.Logon);
  session.disconnect();
});

Deno.test("[fix-session] application messages are forwarded only once session is ACTIVE", () => {
  const { session, appMessages } = harness();

  const nos = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.MsgSeqNum, 1],
    [Tag.ClOrdID, "c1"],
  ]);
  session.handleInbound(nos);
  assertEquals(appMessages.length, 0, "message before Logon must not reach the application");

  session.handleInbound(logonFrom(1));

  const nos2 = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.MsgSeqNum, 2],
    [Tag.ClOrdID, "c2"],
  ]);
  session.handleInbound(nos2);
  assertEquals(appMessages.length, 1);
  assertEquals(appMessages[0].get(Tag.ClOrdID), "c2");
  session.disconnect();
});

Deno.test("[fix-session] sequence gap triggers a ResendRequest instead of dispatching", () => {
  const { session, sent, appMessages } = harness();
  session.handleInbound(logonFrom(1));
  sent.length = 0;

  const skippedSeq = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.MsgSeqNum, 5],
    [Tag.ClOrdID, "c1"],
  ]);
  session.handleInbound(skippedSeq);

  assertEquals(appMessages.length, 0);
  assertEquals(sent.length, 1);
  const resendReq = decode(sent[0]);
  assertEquals(resendReq.get(Tag.MsgType), MsgType.ResendRequest);
  assertEquals(resendReq.get(Tag.BeginSeqNo), "2");
  assertEquals(resendReq.get(Tag.EndSeqNo), "4");
  session.disconnect();
});

Deno.test("[fix-session] TestRequest gets an immediate Heartbeat echoing TestReqID", () => {
  const { session, sent } = harness();
  session.handleInbound(logonFrom(1));
  sent.length = 0;

  const testReq = encode([
    [Tag.MsgType, MsgType.TestRequest],
    [Tag.MsgSeqNum, 2],
    [Tag.TestReqID, "probe-1"],
  ]);
  session.handleInbound(testReq);

  assertEquals(sent.length, 1);
  const hb = decode(sent[0]);
  assertEquals(hb.get(Tag.MsgType), MsgType.Heartbeat);
  assertEquals(hb.get(Tag.TestReqID), "probe-1");
  session.disconnect();
});

Deno.test("[fix-session] Logout while active is acknowledged and disconnects", () => {
  const { session, sent, states } = harness();
  session.handleInbound(logonFrom(1));
  sent.length = 0;
  states.length = 0;

  const logout = encode([
    [Tag.MsgType, MsgType.Logout],
    [Tag.MsgSeqNum, 2],
  ]);
  session.handleInbound(logout);

  assertEquals(session.sessionState, "DISCONNECTED");
  assertEquals(states, ["DISCONNECTED"]);
  assertEquals(sent.length, 1);
  assertEquals(decode(sent[0]).get(Tag.MsgType), MsgType.Logout);
});

Deno.test("[fix-session] sendMessage wraps body tags with SenderCompID/TargetCompID/MsgSeqNum header", () => {
  const { session, sent } = harness();
  session.handleInbound(logonFrom(1));
  sent.length = 0;

  session.sendMessage([
    [Tag.MsgType, MsgType.ExecutionReport],
    [Tag.ClOrdID, "c1"],
  ]);

  assertEquals(sent.length, 1);
  const msg = decode(sent[0]);
  assertEquals(msg.get(Tag.SenderCompID), "EXCHANGE");
  assertEquals(msg.get(Tag.TargetCompID), "GATEWAY");
  assert(msg.get(Tag.MsgSeqNum));
  session.disconnect();
});

Deno.test("[fix-session] a message with an invalid checksum is dropped before dispatch", () => {
  const { session, appMessages } = harness();
  session.handleInbound(logonFrom(1));

  const nos = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.MsgSeqNum, 2],
    [Tag.ClOrdID, "c1"],
  ]);
  const tampered = nos.replace("=c1", "=c9");
  session.handleInbound(tampered);
  assertEquals(appMessages.length, 0);
  session.disconnect();
});

Deno.test("[fix-session] onLogonRequest rejecting a Logon sends a Logout and stays DISCONNECTED", () => {
  const { session, sent, states } = harness({ onLogonRequest: () => false });
  session.handleInbound(logonFrom(1));

  assertEquals(session.sessionState, "DISCONNECTED");
  assertEquals(states, []);
  assertEquals(sent.length, 1);
  assertEquals(decode(sent[0]).get(Tag.MsgType), MsgType.Logout);
});

Deno.test("[fix-session] a rejected Logon never reaches onApplicationMessage for a subsequent order", () => {
  const { session, appMessages } = harness({ onLogonRequest: () => false });
  session.handleInbound(logonFrom(1));

  const nos = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.MsgSeqNum, 2],
    [Tag.ClOrdID, "c1"],
  ]);
  session.handleInbound(nos);
  assertEquals(appMessages.length, 0);
});

Deno.test("[fix-session] onLogonRequest receives the inbound Logon's tags, including SenderCompID", () => {
  const seen: Map<number, string>[] = [];
  const { session } = harness({
    onLogonRequest: (tags) => {
      seen.push(tags);
      return true;
    },
  });
  session.handleInbound(logonFrom(1));

  assertEquals(seen.length, 1);
  assertEquals(seen[0].get(Tag.SenderCompID), "GATEWAY");
  session.disconnect();
});

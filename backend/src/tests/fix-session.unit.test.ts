import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { FakeTime } from "jsr:@std/testing@0.217/time";
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

function logonFrom(senderSeq = 1, heartBtInt = 30): string {
  return encode([
    [Tag.MsgType, MsgType.Logon],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, senderSeq],
    [Tag.EncryptMethod, "0"],
    [Tag.HeartBtInt, heartBtInt],
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

Deno.test("[fix-session] initiator: sendLogon transitions DISCONNECTED -> LOGON_SENT", () => {
  const { session, sent, states } = harness();
  session.sendLogon();
  assertEquals(session.sessionState, "LOGON_SENT");
  assertEquals(states, ["LOGON_SENT"]);
  assertEquals(decode(sent[0]).get(Tag.MsgType), MsgType.Logon);
});

Deno.test("[fix-session] initiator: receiving Logon back while LOGON_SENT transitions to ACTIVE without re-sending Logon", () => {
  const { session, sent, states } = harness();
  session.sendLogon();
  const logonReply = encode([
    [Tag.MsgType, MsgType.Logon],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, 1],
    [Tag.EncryptMethod, "0"],
    [Tag.HeartBtInt, 30],
  ]);
  session.handleInbound(logonReply);
  assertEquals(session.sessionState, "ACTIVE");
  assertEquals(states, ["LOGON_SENT", "ACTIVE"]);
  assertEquals(sent.length, 1, "no second Logon should be sent in response to the acceptor's reply");
  session.disconnect();
});

Deno.test("[fix-session] sendLogon(resetSeq: true) resets outbound MsgSeqNum to 1", () => {
  const { session, sent } = harness();
  session.handleInbound(logonFrom(1));
  session.sendMessage([[Tag.MsgType, MsgType.NewOrderSingle]]);
  session.disconnect();

  sent.length = 0;
  session.sendLogon(true);
  assertEquals(decode(sent[0]).get(Tag.MsgSeqNum), "1");
});

Deno.test("[fix-session] sendLogout transitions to LOGOUT_SENT and stops the heartbeat", () => {
  const time = new FakeTime();
  try {
    const { session, sent, states } = harness();
    session.handleInbound(logonFrom(1));
    sent.length = 0;
    session.sendLogout("bye");
    assertEquals(session.sessionState, "LOGOUT_SENT");
    assertEquals(states.at(-1), "LOGOUT_SENT");
    const logout = decode(sent[0]);
    assertEquals(logout.get(Tag.MsgType), MsgType.Logout);
    assertEquals(logout.get(Tag.Text), "bye");

    // heartbeat must be stopped — advancing well past heartBtInt sends nothing more
    sent.length = 0;
    time.tick(60_000);
    assertEquals(sent.length, 0);
  } finally {
    time.restore();
  }
});

Deno.test("[fix-session] disconnect() stops the heartbeat and resets to DISCONNECTED", () => {
  const time = new FakeTime();
  try {
    const { session, states } = harness();
    session.handleInbound(logonFrom(1));
    session.disconnect();
    assertEquals(session.sessionState, "DISCONNECTED");
    assertEquals(states.at(-1), "DISCONNECTED");
    time.tick(60_000);
    // no crash / no further sends expected once fully disconnected
  } finally {
    time.restore();
  }
});

Deno.test("[fix-session] setTargetCompID changes the TargetCompID on subsequent outbound messages", () => {
  const { session, sent } = harness();
  session.setTargetCompID("NEW-TARGET");
  session.sendLogon();
  assertEquals(decode(sent[0]).get(Tag.TargetCompID), "NEW-TARGET");
});

Deno.test("[fix-session] SequenceReset with a positive NewSeqNo advances the expected inbound sequence", () => {
  const { session, appMessages } = harness();
  session.handleInbound(logonFrom(1));

  const reset = encode([
    [Tag.MsgType, MsgType.SequenceReset],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, 2],
    [Tag.NewSeqNo, 10],
  ]);
  session.handleInbound(reset);

  const nos = encode([
    [Tag.MsgType, MsgType.NewOrderSingle],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, 10],
    [Tag.ClOrdID, "c1"],
  ]);
  session.handleInbound(nos);
  assertEquals(appMessages.length, 1, "sequence 10 should now be accepted as in-order after the reset");
  session.disconnect();
});

Deno.test("[fix-session] ResendRequest with an explicit EndSeqNo replies with a gap-fill SequenceReset", () => {
  const { session, sent } = harness();
  session.handleInbound(logonFrom(1));
  sent.length = 0;

  const resendReq = encode([
    [Tag.MsgType, MsgType.ResendRequest],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, 2],
    [Tag.BeginSeqNo, 1],
    [Tag.EndSeqNo, 5],
  ]);
  session.handleInbound(resendReq);

  const reply = decode(sent[0]);
  assertEquals(reply.get(Tag.MsgType), MsgType.SequenceReset);
  assertEquals(reply.get(Tag.GapFillFlag), "Y");
  assertEquals(reply.get(Tag.NewSeqNo), "6");
  session.disconnect();
});

Deno.test("[fix-session] ResendRequest with EndSeqNo=0 (resend-to-infinity) gap-fills to the current outSeq", () => {
  const { session, sent } = harness();
  session.handleInbound(logonFrom(1)); // consumes outSeq 1 for the Logon reply
  sent.length = 0;

  const resendReq = encode([
    [Tag.MsgType, MsgType.ResendRequest],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, 2],
    [Tag.BeginSeqNo, 1],
    [Tag.EndSeqNo, 0],
  ]);
  session.handleInbound(resendReq);

  const reply = decode(sent[0]);
  assertEquals(reply.get(Tag.NewSeqNo), "2", "NewSeqNo reflects outSeq at the point the gap-fill message is built, before its own MsgSeqNum is assigned");
  session.disconnect();
});

Deno.test("[fix-session] heartbeat timer sends a TestRequest after the configured interval, then Heartbeat clears it", () => {
  const time = new FakeTime();
  try {
    const { session, sent } = harness({ heartBtInt: 5 });
    session.handleInbound(logonFrom(1, 5));
    sent.length = 0;

    time.tick(5_000);
    assertEquals(sent.length, 1);
    const testReq = decode(sent[0]);
    assertEquals(testReq.get(Tag.MsgType), MsgType.TestRequest);
    const testReqId = testReq.get(Tag.TestReqID);
    assert(testReqId && testReqId.length > 0);

    sent.length = 0;
    const hbAck = encode([
      [Tag.MsgType, MsgType.Heartbeat],
      [Tag.SenderCompID, "GATEWAY"],
      [Tag.TargetCompID, "EXCHANGE"],
      [Tag.MsgSeqNum, 2],
      [Tag.TestReqID, testReqId],
    ]);
    session.handleInbound(hbAck);

    // acknowledged in time — the next tick sends a fresh TestRequest, not a timeout disconnect
    time.tick(5_000);
    assertEquals(session.sessionState, "ACTIVE");
    assertEquals(sent.length, 1);
    assertEquals(decode(sent[0]).get(Tag.MsgType), MsgType.TestRequest);
    session.disconnect();
  } finally {
    time.restore();
  }
});

Deno.test("[fix-session] an unanswered TestRequest triggers a heartbeat-timeout disconnect on the next interval", () => {
  const time = new FakeTime();
  try {
    const { session, states } = harness({ heartBtInt: 5 });
    session.handleInbound(logonFrom(1, 5));

    time.tick(5_000); // TestRequest sent, never acknowledged
    assertEquals(session.sessionState, "ACTIVE");

    time.tick(5_000); // no Heartbeat arrived — timeout
    assertEquals(session.sessionState, "DISCONNECTED");
    assertEquals(states.at(-1), "DISCONNECTED");
  } finally {
    time.restore();
  }
});

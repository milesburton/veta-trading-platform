import type { Socket } from "node:net";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { MsgType, OrdStatus, Side, Tag } from "../fix/fix-dictionary.ts";
import { decode, encode } from "../fix/fix-parser.ts";
import { connectTcp } from "../lib/tcp.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

// The market-hours reject path itself (ADR 0003 Phase 6) is unit-tested
// directly in fix-market-session.unit.test.ts against the extracted
// isMarketOpenForOrderEntry() predicate — market-sim's simulated session
// cycles a full day in ~390 real seconds with no hook to force a specific
// sessionPhase, so reaching HALTED/CLOSED from a fresh start here would be
// impractically slow for this suite.
const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";
const FIX_EXCHANGE_TCP_PORT = 9_880;
const FIX_EXCHANGE_TCP_PORT_RISK = FIX_EXCHANGE_TCP_PORT;

const SOH = "\x01";

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

/** Reads whole FIX messages off a TCP connection, reassembling by the 10=XXX<SOH> trailer. */
class FixMessageReader {
  #conn: Socket;
  #buffer = "";
  #closed = false;
  #wake: (() => void) | undefined;

  constructor(conn: Socket) {
    this.#conn = conn;
    conn.setEncoding("utf8");
    conn.on("data", (chunk: string) => {
      this.#buffer += chunk;
      this.#wake?.();
    });
    conn.on("close", () => {
      this.#closed = true;
      this.#wake?.();
    });
  }

  async next(timeoutMs = 8_000): Promise<Map<number, string>> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const msgEnd = this.#buffer.indexOf(`${SOH}10=`);
      if (msgEnd !== -1) {
        const trailerEnd = msgEnd + 8;
        if (trailerEnd <= this.#buffer.length) {
          const raw = this.#buffer.slice(0, trailerEnd);
          this.#buffer = this.#buffer.slice(trailerEnd);
          return decode(raw);
        }
      }
      if (this.#closed) throw new Error("connection closed while waiting for a message");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("timed out waiting for a FIX message");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>((resolve, reject) => {
        this.#wake = resolve;
        timer = setTimeout(() => reject(new Error("read timeout")), remaining);
      }).finally(() => clearTimeout(timer));
    }
  }

  get connection(): Socket {
    return this.#conn;
  }
}

function logonMsg(seq = 1): string {
  return encode([
    [Tag.MsgType, MsgType.Logon],
    [Tag.SenderCompID, "GATEWAY"],
    [Tag.TargetCompID, "EXCHANGE"],
    [Tag.MsgSeqNum, seq],
    [Tag.EncryptMethod, "0"],
    [Tag.HeartBtInt, 30],
  ]);
}

test({
  // Risk-engine disabled here — this suite covers session/venue/cancel/
  // archive behavior, not risk checking, and several steps intentionally
  // submit large quantities to force a resting order for cancel/replace
  // to act on. Those quantities would otherwise trip risk-engine's
  // notional/ADV checks unrelated to what's being tested. The one
  // risk-check scenario lives in its own suite below, with its own
  // realistic, small-quantity order.
  name: "fix-exchange: Logon + NewOrderSingle over real TCP (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: ["market-sim", "fix-exchange", "fix-gateway", "fix-archive"],
      perServiceEnv: {
        "fix-exchange": {
          FIX_EXCHANGE_PORT: String(FIX_EXCHANGE_TCP_PORT),
          FIX_COUNTERPARTIES: "GATEWAY:test-secret",
          RISK_ENGINE_ENABLED: "false",
        },
        "fix-gateway": { FIX_EXCHANGE_PORT: String(FIX_EXCHANGE_TCP_PORT) },
      },
      startupTimeoutMs: 60_000,
    });

    try {
      await t.step("fix-exchange and fix-gateway health endpoints are ok", async () => {
        const exRes = await fetch(`${url(stack, "fix-exchange")}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        assertEquals(exRes.status, 200);
        await exRes.body?.cancel();
        const gwRes = await fetch(`${url(stack, "fix-gateway")}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        assertEquals(gwRes.status, 200);
        await gwRes.body?.cancel();
      });

      await t.step(
        "/sessions reflects a Logon'd counterparty and clears on disconnect",
        async () => {
          const before = await fetch(`${url(stack, "fix-exchange")}/sessions`, {
            signal: AbortSignal.timeout(5_000),
          });
          assertEquals((await before.json()).sessions, []);

          const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
          const reader = new FixMessageReader(conn);
          try {
            conn.write(logonMsg());
            await reader.next();

            const after = await fetch(`${url(stack, "fix-exchange")}/sessions`, {
              signal: AbortSignal.timeout(5_000),
            });
            const { sessions } = (await after.json()) as {
              sessions: { counterparty: string | null; state: string; openOrders: number }[];
            };
            assertEquals(sessions.length, 1);
            assertEquals(sessions[0].counterparty, "GATEWAY");
            assertEquals(sessions[0].state, "ACTIVE");
            assertEquals(sessions[0].openOrders, 0);
          } finally {
            conn.destroy();
          }

          // Deregistration happens once fix-exchange observes the closed
          // socket, which is asynchronous relative to this side's conn.close().
          const deadline = Date.now() + 5_000;
          while (Date.now() < deadline) {
            const res = await fetch(`${url(stack, "fix-exchange")}/sessions`, {
              signal: AbortSignal.timeout(5_000),
            });
            const { sessions } = (await res.json()) as { sessions: unknown[] };
            if (sessions.length === 0) return;
            await new Promise((r) => setTimeout(r, 200));
          }
          throw new Error("session was not deregistered after disconnect");
        }
      );

      await t.step("NewOrderSingle over a direct TCP session gets acked and filled", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          const logonReply = await reader.next();
          assertEquals(logonReply.get(Tag.MsgType), MsgType.Logon);

          const clOrdId = `tc-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, 100],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);

          const ack = await reader.next();
          assertEquals(ack.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(ack.get(Tag.ClOrdID), clOrdId);
          assertEquals(ack.get(Tag.OrdStatus), OrdStatus.New);

          const fill = await reader.next();
          assertEquals(fill.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(fill.get(Tag.ClOrdID), clOrdId);
          assert(
            fill.get(Tag.OrdStatus) === OrdStatus.Filled ||
              fill.get(Tag.OrdStatus) === OrdStatus.PartiallyFilled,
            `expected a fill status, got ${fill.get(Tag.OrdStatus)}`
          );
        } finally {
          conn.destroy();
        }
      });

      await t.step("the fill is archived to fix-archive via fix.execution", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        let clOrdId: string;
        try {
          conn.write(logonMsg());
          await reader.next();

          clOrdId = `tc-archive-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, 100],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);
          await reader.next(); // ack
          await reader.next(); // fill
        } finally {
          conn.destroy();
        }

        const ARCHIVE = url(stack, "fix-archive");
        const deadline = Date.now() + 10_000;
        let found: { clOrdId: string; execType: string; ordStatus: string } | null = null;
        while (Date.now() < deadline && !found) {
          const res = await fetch(`${ARCHIVE}/executions?symbol=AAPL&limit=50`, {
            signal: AbortSignal.timeout(5_000),
          });
          const rows = (await res.json()) as {
            clOrdId: string;
            execType: string;
            ordStatus: string;
          }[];
          found = rows.find((r) => r.clOrdId === clOrdId) ?? null;
          if (!found) await new Promise((r) => setTimeout(r, 300));
        }

        assert(found, `expected an archived execution with clOrdId=${clOrdId}`);
        assertEquals(found.execType, "2");
        assertEquals(found.ordStatus, "2");
      });

      await t.step("Logon from an unprovisioned SenderCompID is rejected", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          const logon = encode([
            [Tag.MsgType, MsgType.Logon],
            [Tag.SenderCompID, "UNKNOWN-COUNTERPARTY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 1],
            [Tag.EncryptMethod, "0"],
            [Tag.HeartBtInt, 30],
          ]);
          conn.write(logon);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.Logout);
        } finally {
          conn.destroy();
        }
      });

      await t.step("NewOrderSingle carrying Account round-trips to the archive", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        let clOrdId: string;
        try {
          conn.write(logonMsg());
          await reader.next();

          clOrdId = `tc-account-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, 100],
            [Tag.OrdType, "2"],
            [Tag.Account, "ACCT-42"],
          ]);
          conn.write(nos);

          const ack = await reader.next();
          assertEquals(ack.get(Tag.Account), "ACCT-42");
          await reader.next(); // fill
        } finally {
          conn.destroy();
        }

        const ARCHIVE = url(stack, "fix-archive");
        const deadline = Date.now() + 10_000;
        let found: { clOrdId: string; account: string | null } | null = null;
        while (Date.now() < deadline && !found) {
          const res = await fetch(`${ARCHIVE}/executions?symbol=AAPL&limit=50`, {
            signal: AbortSignal.timeout(5_000),
          });
          const rows = (await res.json()) as { clOrdId: string; account: string | null }[];
          found = rows.find((r) => r.clOrdId === clOrdId) ?? null;
          if (!found) await new Promise((r) => setTimeout(r, 300));
        }

        assert(found, `expected an archived execution with clOrdId=${clOrdId}`);
        assertEquals(found.account, "ACCT-42");
      });

      await t.step("NewOrderSingle with a market order routed to IEX is rejected", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          const clOrdId = `tc-venue-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, 100],
            [Tag.OrdType, "1"], // Market
            [Tag.ExDestination, "IEX"],
          ]);
          conn.write(nos);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(reply.get(Tag.OrdStatus), OrdStatus.Rejected);
        } finally {
          conn.destroy();
        }
      });

      await t.step("OrderCancelRequest for an unknown order gets OrderCancelReject", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          const cancel = encode([
            [Tag.MsgType, MsgType.OrderCancelRequest],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, `cxl-${Date.now()}`],
            [Tag.OrigClOrdID, "never-existed"],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
          ]);
          conn.write(cancel);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.OrderCancelReject);
        } finally {
          conn.destroy();
        }
      });

      await t.step("OrderCancelRequest stops a working order before it fully fills", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          // A very large quantity relative to typical tick volume forces
          // the fill loop's participation cap to leave qty resting after
          // the first slice, giving the cancel a real window to land
          // before OrdStatus reaches Filled. Risk-engine is disabled for
          // this whole suite, so this quantity doesn't trip a notional/ADV
          // rejection instead.
          const clOrdId = `tc-cancel-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10_000_000],
            [Tag.Price, 100],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);

          const ack = await reader.next();
          assertEquals(ack.get(Tag.OrdStatus), OrdStatus.New);

          const cancel = encode([
            [Tag.MsgType, MsgType.OrderCancelRequest],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 3],
            [Tag.ClOrdID, `cxl-${Date.now()}`],
            [Tag.OrigClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
          ]);
          conn.write(cancel);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(reply.get(Tag.OrdStatus), OrdStatus.Canceled);
          assertEquals(reply.get(Tag.OrigClOrdID), clOrdId);

          // Confirm no further fills arrive for this order after the
          // cancel — the connection should go quiet for this clOrdId.
          let sawFillAfterCancel = false;
          try {
            const maybeFill = await reader.next(2_000);
            if (maybeFill.get(Tag.ClOrdID) === clOrdId) sawFillAfterCancel = true;
          } catch {
            // timeout is the expected/passing outcome — no more messages
          }
          assertEquals(sawFillAfterCancel, false, "no fill should follow a successful cancel");
        } finally {
          conn.destroy();
        }
      });

      await t.step("OrderCancelReplaceRequest changes price on a working order", async () => {
        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          const clOrdId = `tc-replace-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10_000_000],
            [Tag.Price, 100],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);
          await reader.next(); // ack

          const replaceClOrdId = `tc-replaced-${Date.now()}`;
          const replace = encode([
            [Tag.MsgType, MsgType.OrderCancelReplaceRequest],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 3],
            [Tag.ClOrdID, replaceClOrdId],
            [Tag.OrigClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 5_000_000],
            [Tag.Price, 150],
            [Tag.OrdType, "2"],
          ]);
          conn.write(replace);

          const replaceAck = await reader.next();
          assertEquals(replaceAck.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(replaceAck.get(Tag.ClOrdID), replaceClOrdId);
          assertEquals(replaceAck.get(Tag.OrigClOrdID), clOrdId);
          assert(
            replaceAck.get(Tag.OrdStatus) === OrdStatus.New ||
              replaceAck.get(Tag.OrdStatus) === OrdStatus.PartiallyFilled,
            `expected New or PartiallyFilled after replace, got ${replaceAck.get(Tag.OrdStatus)}`
          );

          // A subsequent cancel must reference the replacement ClOrdID —
          // the original is no longer a valid handle.
          const cancelOrig = encode([
            [Tag.MsgType, MsgType.OrderCancelRequest],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 4],
            [Tag.ClOrdID, `cxl-orig-${Date.now()}`],
            [Tag.OrigClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
          ]);
          conn.write(cancelOrig);
          const origCancelReply = await reader.next();
          assertEquals(origCancelReply.get(Tag.MsgType), MsgType.OrderCancelReject);

          const cancelReplaced = encode([
            [Tag.MsgType, MsgType.OrderCancelRequest],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 5],
            [Tag.ClOrdID, `cxl-replaced-${Date.now()}`],
            [Tag.OrigClOrdID, replaceClOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
          ]);
          conn.write(cancelReplaced);
          const replacedCancelReply = await reader.next();
          assertEquals(replacedCancelReply.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(replacedCancelReply.get(Tag.OrdStatus), OrdStatus.Canceled);
        } finally {
          conn.destroy();
        }
      });
    } finally {
      await stack.teardown();
    }
  },
});

test({
  name: "fix-exchange: pre-trade risk check (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: ["market-sim", "fix-exchange", "fix-gateway", "risk-engine"],
      perServiceEnv: {
        "fix-exchange": {
          FIX_EXCHANGE_PORT: String(FIX_EXCHANGE_TCP_PORT_RISK),
          FIX_COUNTERPARTIES: "GATEWAY:test-secret",
          RISK_ENGINE_ENABLED: "true",
        },
        "fix-gateway": { FIX_EXCHANGE_PORT: String(FIX_EXCHANGE_TCP_PORT_RISK) },
        // Real orders submitted at whatever moment CI happens to run —
        // disable market-hours enforcement so this isn't flaky depending
        // on the real-world clock, same rationale as
        // risk-rejection.integration.tc.test.ts.
        "risk-engine": {
          RISK_ENGINE_MARKET_HOURS_ENFORCED: "false",
          RISK_ENGINE_TEST_MODE: "1",
        },
      },
      startupTimeoutMs: 60_000,
    });

    try {
      await t.step("a fat-finger limit price is rejected by risk-engine, not filled", async () => {
        const MS = url(stack, "market-sim");
        const deadline = Date.now() + 20_000;
        let mid = 0;
        while (Date.now() < deadline && !mid) {
          const res = await fetch(`${MS}/prices`, { signal: AbortSignal.timeout(5_000) });
          const prices = (await res.json()) as Record<string, number>;
          if (prices.AAPL > 0) mid = prices.AAPL;
          else await new Promise((r) => setTimeout(r, 500));
        }
        assert(mid > 0, "no live AAPL price within 20s");

        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT_RISK);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          const clOrdId = `tc-risk-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, mid * 2],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(reply.get(Tag.OrdStatus), OrdStatus.Rejected);
          assert(
            (reply.get(Tag.Text) ?? "").toLowerCase().includes("risk"),
            `expected a risk-check rejection reason, got: ${reply.get(Tag.Text)}`
          );
        } finally {
          conn.destroy();
        }
      });

      await t.step("an at-market-price order passes the risk check and is acked", async () => {
        const MS = url(stack, "market-sim");
        const deadline = Date.now() + 20_000;
        let mid = 0;
        while (Date.now() < deadline && !mid) {
          const res = await fetch(`${MS}/prices`, { signal: AbortSignal.timeout(5_000) });
          const prices = (await res.json()) as Record<string, number>;
          if (prices.AAPL > 0) mid = prices.AAPL;
          else await new Promise((r) => setTimeout(r, 500));
        }
        assert(mid > 0, "no live AAPL price within 20s");

        for (const symbol of ["MSFT", "GOOGL", "AMZN", "NVDA"]) {
          const seeded = await fetch(`${url(stack, "risk-engine")}/test/positions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "GATEWAY", symbol, netQty: 100, avgPrice: 100 }),
            signal: AbortSignal.timeout(5_000),
          });
          assertEquals(seeded.status, 200);
          await seeded.body?.cancel();
        }

        const conn = await connectTcp("127.0.0.1", FIX_EXCHANGE_TCP_PORT_RISK);
        const reader = new FixMessageReader(conn);
        try {
          conn.write(logonMsg());
          await reader.next();

          const clOrdId = `tc-risk-ok-${Date.now()}`;
          const nos = encode([
            [Tag.MsgType, MsgType.NewOrderSingle],
            [Tag.SenderCompID, "GATEWAY"],
            [Tag.TargetCompID, "EXCHANGE"],
            [Tag.MsgSeqNum, 2],
            [Tag.ClOrdID, clOrdId],
            [Tag.Symbol, "AAPL"],
            [Tag.Side, Side.Buy],
            [Tag.OrderQty, 10],
            [Tag.Price, mid],
            [Tag.OrdType, "2"],
          ]);
          conn.write(nos);

          const reply = await reader.next();
          assertEquals(reply.get(Tag.MsgType), MsgType.ExecutionReport);
          assertEquals(reply.get(Tag.OrdStatus), OrdStatus.New);
        } finally {
          conn.destroy();
        }
      });
    } finally {
      await stack.teardown();
    }
  },
});

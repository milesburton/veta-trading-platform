import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { type AlertRouter, type OperatorAlert } from "../gateway/alert-router.ts";
import {
  anchorKey,
  type AnchorStore,
  createAuditAnchorWatch,
  createS3AnchorStore,
} from "../gateway/audit-anchor.ts";
import type { AuditAnchor } from "../lib/audit.ts";

const H = (c: string) => c.repeat(64);

function harness(options: { stored?: AuditAnchor | null; storeFails?: boolean } = {}) {
  const raised: OperatorAlert[] = [];
  const resolved: string[] = [];
  const written: AuditAnchor[] = [];
  const published: AuditAnchor[] = [];
  const clock = { t: 10_000_000 };
  let stored = options.stored ?? null;
  const router: AlertRouter = {
    raise: (a) => raised.push(a),
    resolve: (key) => resolved.push(key),
    notify: () => {},
    isActive: () => false,
  };
  const store: AnchorStore = {
    put: (a) => {
      written.push(a);
      stored = a;
      return Promise.resolve();
    },
    latest: () =>
      options.storeFails ? Promise.reject(new Error("down")) : Promise.resolve(stored),
  };
  const state = {
    head: { seq: 5, hash: H("e") } as AuditAnchor | null,
    at: null as AuditAnchor | null,
  };
  const watch = createAuditAnchorWatch({
    router,
    store,
    fetchHead: () => Promise.resolve({ head: state.head, at: state.at }),
    publish: (a) => {
      published.push(a);
      return Promise.resolve();
    },
    now: () => clock.t,
    publishIntervalMs: 3_600_000,
  });
  return { watch, raised, resolved, written, published, clock, state };
}

test("[audit-anchor] the first check publishes the current head when no anchor exists", async () => {
  const h = harness();
  await h.watch.check();
  assertEquals(h.written, [{ seq: 5, hash: H("e") }]);
  assertEquals(h.published, [{ seq: 5, hash: H("e") }]);
  assertEquals(h.raised.length, 0);
});

test("[audit-anchor] a matching anchor is left alone until the head moves and the interval passes", async () => {
  const h = harness({ stored: { seq: 5, hash: H("e") } });
  h.state.at = { seq: 5, hash: H("e") };
  await h.watch.check();
  assertEquals(h.written.length, 0);

  h.state.head = { seq: 9, hash: H("f") };
  await h.watch.check();
  assertEquals(h.written, [{ seq: 9, hash: H("f") }]);

  h.state.head = { seq: 12, hash: H("a") };
  h.state.at = { seq: 9, hash: H("f") };
  await h.watch.check();
  assertEquals(h.written.length, 1);

  h.clock.t += 3_600_000;
  await h.watch.check();
  assertEquals(h.written.length, 2);
});

test("[audit-anchor] removing the newest rows raises a critical alert and keeps the anchor", async () => {
  const h = harness({ stored: { seq: 8, hash: H("b") } });
  h.state.head = { seq: 5, hash: H("e") };
  await h.watch.check();
  assertEquals(h.raised.length, 1);
  assertEquals(h.raised[0].severity, "CRITICAL");
  assertEquals(h.raised[0].key, "audit-chain-anchor");
  assert(h.raised[0].detail?.includes("8"));
  assertEquals(h.written.length, 0);
});

test("[audit-anchor] an empty log behind an anchor raises a critical alert", async () => {
  const h = harness({ stored: { seq: 3, hash: H("b") } });
  h.state.head = null;
  await h.watch.check();
  assertEquals(h.raised[0].severity, "CRITICAL");
});

test("[audit-anchor] a rewritten anchored row raises a critical alert", async () => {
  const h = harness({ stored: { seq: 3, hash: H("b") } });
  h.state.head = { seq: 6, hash: H("c") };
  h.state.at = { seq: 3, hash: H("d") };
  await h.watch.check();
  assertEquals(h.raised[0].severity, "CRITICAL");
  assertEquals(h.written.length, 0);
});

test("[audit-anchor] a missing anchored row raises a critical alert", async () => {
  const h = harness({ stored: { seq: 3, hash: H("b") } });
  h.state.head = { seq: 6, hash: H("c") };
  h.state.at = null;
  await h.watch.check();
  assertEquals(h.raised[0].severity, "CRITICAL");
});

test("[audit-anchor] recovery resolves the alert", async () => {
  const h = harness({ stored: { seq: 3, hash: H("b") } });
  h.state.head = { seq: 3, hash: H("b") };
  h.state.at = { seq: 3, hash: H("b") };
  await h.watch.check();
  assertEquals(h.resolved.includes("audit-chain-anchor"), true);
});

test("[audit-anchor] an unreachable store raises a warning and never an anchor alert", async () => {
  const h = harness({ storeFails: true });
  await h.watch.check();
  assertEquals(
    h.raised.map((a) => [a.key, a.severity]),
    [["audit-chain-anchor-store", "WARNING"]]
  );
  assertEquals(h.written.length, 0);
});

test("[audit-anchor] the S3 store keys sort numerically and the newest anchor wins", async () => {
  const objects = new Map<string, string>();
  const store = createS3AnchorStore({
    putObject: (k, b) => {
      objects.set(k, b);
      return Promise.resolve();
    },
    listKeys: () => Promise.resolve([...objects.keys()]),
    getObject: (k) => Promise.resolve(objects.get(k) ?? ""),
  });
  assertEquals(await store.latest(), null);
  await store.put({ seq: 9, hash: H("a") });
  await store.put({ seq: 100, hash: H("b") });
  await store.put({ seq: 25, hash: H("c") });
  assertEquals(await store.latest(), { seq: 100, hash: H("b") });
  assert(anchorKey(9) < anchorKey(100));
});

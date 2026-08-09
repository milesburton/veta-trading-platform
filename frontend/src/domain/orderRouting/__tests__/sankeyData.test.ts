import { buildRoutingSankeyData } from "@veta/frontend/domain/orderRouting/sankeyData";
import type { ChildOrder, OrderRecord } from "@veta/frontend/types";
import { describe, expect, it } from "vitest";

const now = Date.now();

function makeChild(overrides: Partial<ChildOrder> = {}): ChildOrder {
  return {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    status: "filled",
    filled: 100,
    submittedAt: now,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 300_000,
    strategy: "TWAP",
    status: "filled",
    filled: 100,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

describe("buildRoutingSankeyData", () => {
  it("returns empty nodes and links for no orders", () => {
    expect(buildRoutingSankeyData([])).toEqual({ nodes: [], links: [] });
  });

  it("builds one strategy node and one venue node for a single filled child", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [makeChild({ venue: "XNAS", filled: 100 })],
    });
    const { nodes, links } = buildRoutingSankeyData([order]);
    expect(nodes).toEqual([
      { name: "TWAP", isStrategy: true },
      { name: "XNAS", isStrategy: false },
    ]);
    expect(links).toEqual([{ source: 0, target: 1, value: 100 }]);
  });

  it("aggregates filled quantity across multiple children of the same order into one link", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [
        makeChild({ id: "c1", venue: "XNAS", filled: 40 }),
        makeChild({ id: "c2", venue: "XNAS", filled: 60 }),
      ],
    });
    const { links } = buildRoutingSankeyData([order]);
    expect(links).toEqual([{ source: 0, target: 1, value: 100 }]);
  });

  it("splits children across multiple venues into separate links", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [
        makeChild({ id: "c1", venue: "XNAS", filled: 40 }),
        makeChild({ id: "c2", venue: "ARCX", filled: 60 }),
      ],
    });
    const { nodes, links } = buildRoutingSankeyData([order]);
    expect(nodes).toEqual([
      { name: "TWAP", isStrategy: true },
      { name: "ARCX", isStrategy: false },
      { name: "XNAS", isStrategy: false },
    ]);
    expect(links).toHaveLength(2);
    expect(links).toContainEqual({ source: 0, target: 1, value: 60 });
    expect(links).toContainEqual({ source: 0, target: 2, value: 40 });
  });

  it("combines flow from multiple orders on the same strategy", () => {
    const orderA = makeOrder({
      id: "a",
      strategy: "TWAP",
      children: [makeChild({ id: "ca", venue: "XNAS", filled: 50 })],
    });
    const orderB = makeOrder({
      id: "b",
      strategy: "TWAP",
      children: [makeChild({ id: "cb", venue: "XNAS", filled: 30 })],
    });
    const { links } = buildRoutingSankeyData([orderA, orderB]);
    expect(links).toEqual([{ source: 0, target: 1, value: 80 }]);
  });

  it("orders strategy nodes by descending total filled volume", () => {
    const small = makeOrder({
      id: "small",
      strategy: "VWAP",
      children: [makeChild({ id: "cs", venue: "XNAS", filled: 10 })],
    });
    const large = makeOrder({
      id: "large",
      strategy: "TWAP",
      children: [makeChild({ id: "cl", venue: "XNAS", filled: 90 })],
    });
    const { nodes } = buildRoutingSankeyData([small, large]);
    expect(nodes[0]).toEqual({ name: "TWAP", isStrategy: true });
    expect(nodes[1]).toEqual({ name: "VWAP", isStrategy: true });
  });

  it("ignores children with no venue assigned yet", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [makeChild({ venue: undefined, filled: 100 })],
    });
    expect(buildRoutingSankeyData([order])).toEqual({ nodes: [], links: [] });
  });

  it("ignores children with zero filled quantity", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [makeChild({ venue: "XNAS", filled: 0 })],
    });
    expect(buildRoutingSankeyData([order])).toEqual({ nodes: [], links: [] });
  });

  it("ignores children with negative filled quantity", () => {
    const order = makeOrder({
      strategy: "TWAP",
      children: [makeChild({ venue: "XNAS", filled: -5 })],
    });
    expect(buildRoutingSankeyData([order])).toEqual({ nodes: [], links: [] });
  });
});

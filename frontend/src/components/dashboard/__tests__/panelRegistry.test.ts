import { describe, expect, it } from "vitest";
import {
  CHANNEL_COLOURS,
  canAccessPanel,
  PANEL_CHANNEL_CAPS,
  PANEL_DESCRIPTIONS,
  PANEL_IDS,
  PANEL_PERMISSIONS,
  PANEL_TITLES,
  SINGLETON_PANELS,
} from "../panelRegistry.ts";

describe("PANEL_IDS completeness", () => {
  it("contains at least 15 panels", () => {
    expect(PANEL_IDS.length).toBeGreaterThanOrEqual(15);
  });

  it("every PANEL_ID has a title", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_TITLES[id], `title missing for ${id}`).toBeTruthy();
    }
  });

  it("every PANEL_ID has a description", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_DESCRIPTIONS[id], `description missing for ${id}`).toBeTruthy();
    }
  });

  it("every PANEL_ID has channel caps", () => {
    for (const id of PANEL_IDS) {
      const caps = PANEL_CHANNEL_CAPS[id];
      expect(caps, `caps missing for ${id}`).toBeDefined();
      expect(typeof caps.out).toBe("boolean");
      expect(typeof caps.in).toBe("boolean");
    }
  });
});

describe("SINGLETON_PANELS", () => {
  it("all singleton IDs are valid PANEL_IDs", () => {
    for (const id of SINGLETON_PANELS) {
      expect(PANEL_IDS).toContain(id);
    }
  });

  it("includes order-ticket, order-blotter, admin", () => {
    expect(SINGLETON_PANELS.has("order-ticket")).toBe(true);
    expect(SINGLETON_PANELS.has("order-blotter")).toBe(true);
    expect(SINGLETON_PANELS.has("admin")).toBe(true);
  });
});

describe("CHANNEL_COLOURS", () => {
  const CHANNEL_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

  it("defines all 6 channels", () => {
    for (const n of CHANNEL_NUMBERS) {
      expect(CHANNEL_COLOURS[n]).toBeDefined();
    }
  });

  it("each channel has hex, tw, and label", () => {
    for (const n of CHANNEL_NUMBERS) {
      const col = CHANNEL_COLOURS[n];
      expect(col.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(col.tw).toBeTruthy();
      expect(col.label).toBeTruthy();
    }
  });

  it("channel hex colours are unique", () => {
    const hexes = CHANNEL_NUMBERS.map((n) => CHANNEL_COLOURS[n].hex);
    expect(new Set(hexes).size).toBe(CHANNEL_NUMBERS.length);
  });
});

describe("PANEL_CHANNEL_CAPS logic", () => {
  it("market-ladder can only broadcast (out: true, in: false)", () => {
    expect(PANEL_CHANNEL_CAPS["market-ladder"].out).toBe(true);
    expect(PANEL_CHANNEL_CAPS["market-ladder"].in).toBe(false);
  });

  it("order-ticket can only receive (out: false, in: true)", () => {
    expect(PANEL_CHANNEL_CAPS["order-ticket"].out).toBe(false);
    expect(PANEL_CHANNEL_CAPS["order-ticket"].in).toBe(true);
  });

  it("admin cannot broadcast or receive", () => {
    expect(PANEL_CHANNEL_CAPS.admin.out).toBe(false);
    expect(PANEL_CHANNEL_CAPS.admin.in).toBe(false);
  });

  it("market-heatmap can broadcast but not receive", () => {
    expect(PANEL_CHANNEL_CAPS["market-heatmap"].out).toBe(true);
    expect(PANEL_CHANNEL_CAPS["market-heatmap"].in).toBe(false);
  });
});

describe("PANEL_PERMISSIONS completeness", () => {
  it("every PANEL_ID has a permission set", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_PERMISSIONS[id], `permissions missing for ${id}`).toBeDefined();
      expect(PANEL_PERMISSIONS[id].size, `${id} has no roles`).toBeGreaterThan(0);
    }
  });
});

describe("canAccessPanel — role restrictions", () => {
  it("returns false when role is undefined", () => {
    expect(canAccessPanel("market-ladder", undefined)).toBe(false);
  });

  it("only traders can access order-ticket and basket-order", () => {
    expect(canAccessPanel("order-ticket", "trader")).toBe(true);
    expect(canAccessPanel("order-ticket", "admin")).toBe(false);
    expect(canAccessPanel("order-ticket", "compliance")).toBe(false);
    expect(canAccessPanel("order-ticket", "sales")).toBe(false);
    expect(canAccessPanel("order-ticket", "external-client")).toBe(false);
    expect(canAccessPanel("order-ticket", "viewer")).toBe(false);

    expect(canAccessPanel("basket-order", "trader")).toBe(true);
    expect(canAccessPanel("basket-order", "admin")).toBe(false);
  });

  it("only admins can access admin panels", () => {
    expect(canAccessPanel("admin", "admin")).toBe(true);
    expect(canAccessPanel("admin", "trader")).toBe(false);
    expect(canAccessPanel("load-test", "admin")).toBe(true);
    expect(canAccessPanel("load-test", "trader")).toBe(false);
    expect(canAccessPanel("llm-subsystem", "admin")).toBe(true);
    expect(canAccessPanel("llm-subsystem", "trader")).toBe(false);
    expect(canAccessPanel("market-data-sources", "admin")).toBe(true);
    expect(canAccessPanel("market-data-sources", "compliance")).toBe(false);
  });

  it("only sales can access sales-workbench", () => {
    expect(canAccessPanel("sales-workbench", "sales")).toBe(true);
    expect(canAccessPanel("sales-workbench", "trader")).toBe(false);
    expect(canAccessPanel("sales-workbench", "admin")).toBe(false);
  });

  it("only external-client can access client-rfq", () => {
    expect(canAccessPanel("client-rfq", "external-client")).toBe(true);
    expect(canAccessPanel("client-rfq", "trader")).toBe(false);
    expect(canAccessPanel("client-rfq", "admin")).toBe(false);
  });

  it("session-replay is admin and compliance only", () => {
    expect(canAccessPanel("session-replay", "admin")).toBe(true);
    expect(canAccessPanel("session-replay", "compliance")).toBe(true);
    expect(canAccessPanel("session-replay", "trader")).toBe(false);
  });

  it("market-ladder is accessible to everyone", () => {
    expect(canAccessPanel("market-ladder", "trader")).toBe(true);
    expect(canAccessPanel("market-ladder", "admin")).toBe(true);
    expect(canAccessPanel("market-ladder", "compliance")).toBe(true);
    expect(canAccessPanel("market-ladder", "sales")).toBe(true);
    expect(canAccessPanel("market-ladder", "external-client")).toBe(true);
    expect(canAccessPanel("market-ladder", "viewer")).toBe(true);
  });

  it("viewer has read-only access to market data and analytics", () => {
    expect(canAccessPanel("market-ladder", "viewer")).toBe(true);
    expect(canAccessPanel("candle-chart", "viewer")).toBe(true);
    expect(canAccessPanel("market-heatmap", "viewer")).toBe(true);
    expect(canAccessPanel("order-ticket", "viewer")).toBe(false);
    expect(canAccessPanel("admin", "viewer")).toBe(false);
    expect(canAccessPanel("sales-workbench", "viewer")).toBe(false);
  });
});

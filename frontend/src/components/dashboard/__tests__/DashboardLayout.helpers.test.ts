import { describe, expect, it } from "vitest";
import { patchTabConfig } from "../DashboardLayout";

describe("patchTabConfig", () => {
  it("sets outgoing channel on matching tab", () => {
    const nodes = [
      {
        type: "tabset",
        children: [
          {
            type: "tab",
            id: "panel-1",
            config: { panelType: "market-ladder", incoming: 2 },
          },
        ],
      },
    ] as unknown as Array<Record<string, unknown>>;

    const changed = patchTabConfig(nodes, "panel-1", "out", 5);

    expect(changed).toBe(true);
    const tab = (nodes[0].children as Array<Record<string, unknown>>)[0];
    expect(tab.config).toMatchObject({
      panelType: "market-ladder",
      incoming: 2,
      outgoing: 5,
    });
  });

  it("clears incoming channel on matching tab", () => {
    const nodes = [
      {
        type: "tabset",
        children: [
          {
            type: "tab",
            id: "panel-2",
            config: { panelType: "order-ticket", outgoing: 3, incoming: 4 },
          },
        ],
      },
    ] as unknown as Array<Record<string, unknown>>;

    const changed = patchTabConfig(nodes, "panel-2", "in", null);

    expect(changed).toBe(true);
    const tab = (nodes[0].children as Array<Record<string, unknown>>)[0] as {
      config?: { outgoing?: number; incoming?: number };
    };
    expect(tab.config?.outgoing).toBe(3);
    expect(tab.config?.incoming).toBeUndefined();
  });

  it("returns false when tab id is not present", () => {
    const nodes = [
      {
        type: "tabset",
        children: [{ type: "tab", id: "panel-a", config: { panelType: "news" } }],
      },
    ] as unknown as Array<Record<string, unknown>>;

    const before = JSON.stringify(nodes);
    const changed = patchTabConfig(nodes, "missing", "out", 1);

    expect(changed).toBe(false);
    expect(JSON.stringify(nodes)).toBe(before);
  });
});

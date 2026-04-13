import { describe, expect, it } from "vitest";
import { getPanelComponent } from "../panelComponents";

describe("panelComponents registry", () => {
  it("returns a component for market-ladder", () => {
    expect(getPanelComponent("market-ladder")).toBeDefined();
  });

  it("returns a component for order-blotter", () => {
    expect(getPanelComponent("order-blotter")).toBeDefined();
  });

  it("returns a component for symbol-search", () => {
    expect(getPanelComponent("symbol-search")).toBeDefined();
  });

  it("returns a component for market-depth", () => {
    expect(getPanelComponent("market-depth")).toBeDefined();
  });

  it("returns undefined for unknown panel", () => {
    expect(getPanelComponent("nonexistent-panel")).toBeUndefined();
  });

  it("returns a component for every registered panel", () => {
    const knownPanels = [
      "market-ladder",
      "order-ticket",
      "order-blotter",
      "child-orders",
      "algo-monitor",
      "observability",
      "executions",
      "decision-log",
      "market-match",
      "admin",
      "news",
      "alerts",
      "option-pricing",
      "scenario-matrix",
      "market-heatmap",
      "estate-overview",
      "risk-dashboard",
      "my-positions",
      "symbol-search",
      "market-depth",
    ];
    for (const id of knownPanels) {
      expect(getPanelComponent(id)).toBeDefined();
    }
  });
});

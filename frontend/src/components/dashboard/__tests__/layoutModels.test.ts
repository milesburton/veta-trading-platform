import { Model } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import {
  LAYOUT_TEMPLATES,
  makeAdminModel,
  makeAlgoModel,
  makeAlgoPipelineModel,
  makeAnalysisModel,
  makeClearModel,
  makeDefaultModel,
  makeExecutionModel,
  makeObservabilityModel,
  makeOverviewModel,
  STORAGE_KEY,
  STORAGE_KEY_PREFIX,
} from "../layoutModels.ts";

function countTabs(model: ReturnType<typeof makeDefaultModel>): number {
  let count = 0;
  const m = Model.fromJson(model);
  m.visitNodes((node) => {
    if (node.getType() === "tab") count++;
  });
  return count;
}

describe("STORAGE_KEY", () => {
  it("STORAGE_KEY starts with STORAGE_KEY_PREFIX", () => {
    expect(STORAGE_KEY).toMatch(new RegExp(`^${STORAGE_KEY_PREFIX}`));
  });

  it("is a non-empty string", () => {
    expect(typeof STORAGE_KEY).toBe("string");
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

describe("makeDefaultModel", () => {
  it("produces a valid flexlayout JSON model", () => {
    const json = makeDefaultModel();
    expect(json.layout.type).toBe("row");
    expect(json.global).toBeDefined();
  });

  it("includes at least 8 tabs", () => {
    expect(countTabs(makeDefaultModel())).toBeGreaterThanOrEqual(8);
  });

  it("includes market-ladder panel", () => {
    let found = false;
    Model.fromJson(makeDefaultModel()).visitNodes((node) => {
      if (node.getType() === "tab" && node.getId() === "market-ladder") found = true;
    });
    expect(found).toBe(true);
  });

  it("does not include admin panel (mission control layout is separate)", () => {
    let found = false;
    Model.fromJson(makeDefaultModel()).visitNodes((node) => {
      if (node.getType() === "tab" && node.getId() === "admin") found = true;
    });
    expect(found).toBe(false);
  });
});

describe("makeExecutionModel", () => {
  it("contains market-ladder and order-blotter (order ticket is now a dialog)", () => {
    const ids = new Set<string>();
    Model.fromJson(makeExecutionModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("market-ladder")).toBe(true);
    expect(ids.has("order-blotter")).toBe(true);
    expect(ids.has("order-ticket")).toBe(false);
  });
});

describe("makeAlgoModel", () => {
  it("contains candle-chart and algo-monitor", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAlgoModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("candle-chart")).toBe(true);
    expect(ids.has("algo-monitor")).toBe(true);
  });
});

describe("makeAnalysisModel", () => {
  it("contains market-ladder, candle-chart, and news", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAnalysisModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("market-ladder")).toBe(true);
    expect(ids.has("candle-chart")).toBe(true);
    expect(ids.has("news")).toBe(true);
  });

  it("does not include order-ticket", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAnalysisModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
  });
});

describe("makeClearModel", () => {
  it("produces a model with zero tabs", () => {
    expect(countTabs(makeClearModel())).toBe(0);
  });

  it("has a single tabset child in the layout row", () => {
    const json = makeClearModel();
    expect(json.layout.children).toHaveLength(1);
    expect(json.layout.children[0].type).toBe("tabset");
  });
});

describe("makeOverviewModel", () => {
  it("contains market-heatmap", () => {
    const ids = new Set<string>();
    Model.fromJson(makeOverviewModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("market-heatmap")).toBe(true);
  });
});

describe("makeAdminModel", () => {
  it("includes admin panel", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAdminModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("admin")).toBe(true);
  });

  it("does not include order-ticket (admins cannot trade)", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAdminModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
  });
});

describe("makeObservabilityModel", () => {
  it("includes service-health, throughput-gauges, estate-overview, and observability", () => {
    const ids = new Set<string>();
    Model.fromJson(makeObservabilityModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("service-health")).toBe(true);
    expect(ids.has("throughput-gauges")).toBe(true);
    expect(ids.has("estate-overview")).toBe(true);
    expect(ids.has("observability")).toBe(true);
  });

  it("does not include order-ticket or market-ladder (ops view, no trading)", () => {
    const ids = new Set<string>();
    Model.fromJson(makeObservabilityModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
    expect(ids.has("market-ladder")).toBe(false);
  });

  it("includes algo-leaderboard and decision-log for audit trail", () => {
    const ids = new Set<string>();
    Model.fromJson(makeObservabilityModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("algo-leaderboard")).toBe(true);
    expect(ids.has("decision-log")).toBe(true);
  });
});

describe("makeAlgoPipelineModel", () => {
  it("includes algo-monitor, throughput-gauges, order-blotter, child-orders, executions, and decision-log", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAlgoPipelineModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("algo-monitor")).toBe(true);
    expect(ids.has("throughput-gauges")).toBe(true);
    expect(ids.has("order-blotter")).toBe(true);
    expect(ids.has("child-orders")).toBe(true);
    expect(ids.has("executions")).toBe(true);
    expect(ids.has("decision-log")).toBe(true);
  });

  it("does not include order-ticket or market-ladder (pipeline monitor, no trading)", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAlgoPipelineModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
    expect(ids.has("market-ladder")).toBe(false);
  });

  it("includes algo-leaderboard for strategy performance overview", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAlgoPipelineModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("algo-leaderboard")).toBe(true);
  });
});

describe("LAYOUT_TEMPLATES", () => {
  it("has 19 templates", () => {
    expect(LAYOUT_TEMPLATES).toHaveLength(19);
  });

  it("every template has id, label, description, and a valid model", () => {
    for (const tpl of LAYOUT_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.label).toBeTruthy();
      expect(tpl.description).toBeTruthy();
      expect(() => Model.fromJson(tpl.model)).not.toThrow();
    }
  });

  it("template ids are unique", () => {
    const ids = LAYOUT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes an 'overview' template with the market-heatmap tab", () => {
    const overviewTpl = LAYOUT_TEMPLATES.find((t) => t.id === "overview");
    if (!overviewTpl) throw new Error("overview template not found");
    const ids = new Set<string>();
    Model.fromJson(overviewTpl.model).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("market-heatmap")).toBe(true);
  });

  it("includes an 'observability' template with service-health and throughput-gauges", () => {
    const tpl = LAYOUT_TEMPLATES.find((t) => t.id === "observability");
    if (!tpl) throw new Error("observability template not found");
    const ids = new Set<string>();
    Model.fromJson(tpl.model).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("service-health")).toBe(true);
    expect(ids.has("throughput-gauges")).toBe(true);
  });

  it("includes an 'algo-pipeline' template with algo-monitor, child-orders, and executions", () => {
    const tpl = LAYOUT_TEMPLATES.find((t) => t.id === "algo-pipeline");
    if (!tpl) throw new Error("algo-pipeline template not found");
    const ids = new Set<string>();
    Model.fromJson(tpl.model).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("algo-monitor")).toBe(true);
    expect(ids.has("child-orders")).toBe(true);
    expect(ids.has("executions")).toBe(true);
  });
});

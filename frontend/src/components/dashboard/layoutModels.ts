import type { IJsonModel } from "flexlayout-react";
import type { TabChannelConfig } from "./panelRegistry.ts";
import { PANEL_TITLES } from "./panelRegistry.ts";

export const STORAGE_KEY_PREFIX = "dashboard-layout";
export const STORAGE_KEY = `${STORAGE_KEY_PREFIX}-v15`;

export function makeDefaultModel(): IJsonModel {
  return {
    global: {
      tabEnableClose: true,
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      tabSetEnableDeleteWhenEmpty: true,
      tabSetEnableSingleTabStretch: false,
      splitterSize: 4,
      splitterExtra: 4,
    },
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 18,
          enableDrag: false,
          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              enableDrag: false,
              enableClose: false,
              config: {
                panelType: "order-ticket",
                incoming: 1,
                pinned: true,
              } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 22,
          children: [
            {
              type: "tabset",
              weight: 67,
              enableDrag: false,
              children: [
                {
                  type: "tab",
                  id: "market-ladder",
                  name: PANEL_TITLES["market-ladder"],
                  component: "market-ladder",
                  enableDrag: false,
                  enableClose: false,
                  config: {
                    panelType: "market-ladder",
                    outgoing: 1,
                    pinned: true,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 33,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: {
                    panelType: "candle-chart",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 46,
          children: [
            {
              type: "tabset",
              weight: 28,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: {
                    panelType: "order-blotter",
                    outgoing: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 24,
              children: [
                {
                  type: "tab",
                  id: "child-orders",
                  name: PANEL_TITLES["child-orders"],
                  component: "child-orders",
                  config: {
                    panelType: "child-orders",
                    incoming: 1,
                    outgoing: 3,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 24,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 24,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: { panelType: "decision-log", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "tabset",
          weight: 14,
          children: [
            {
              type: "tab",
              id: "estate-overview",
              name: PANEL_TITLES["estate-overview"],
              component: "estate-overview",
              config: { panelType: "estate-overview" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "order-progress",
              name: PANEL_TITLES["order-progress"],
              component: "order-progress",
              config: {
                panelType: "order-progress",
                incoming: 1,
              } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "greeks-surface",
              name: PANEL_TITLES["greeks-surface"],
              component: "greeks-surface",
              config: { panelType: "greeks-surface" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "vol-profile",
              name: PANEL_TITLES["vol-profile"],
              component: "vol-profile",
              config: { panelType: "vol-profile" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeExecutionModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 36,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 42,
          children: [
            {
              type: "tab",
              id: "order-blotter",
              name: PANEL_TITLES["order-blotter"],
              component: "order-blotter",
              config: { panelType: "order-blotter" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeAlgoModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 65,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeAnalysisModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 25,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 45,
          children: [
            {
              type: "tabset",
              weight: 62,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 38,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "tabset",
          weight: 30,
          children: [
            {
              type: "tab",
              id: "news",
              name: PANEL_TITLES.news,
              component: "news",
              config: { panelType: "news" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "option-pricing",
              name: PANEL_TITLES["option-pricing"],
              component: "option-pricing",
              config: { panelType: "option-pricing" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "scenario-matrix",
              name: PANEL_TITLES["scenario-matrix"],
              component: "scenario-matrix",
              config: { panelType: "scenario-matrix" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "trade-recommendation",
              name: PANEL_TITLES["trade-recommendation"],
              component: "trade-recommendation",
              config: { panelType: "trade-recommendation" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "greeks-surface",
              name: PANEL_TITLES["greeks-surface"],
              component: "greeks-surface",
              config: { panelType: "greeks-surface" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "vol-profile",
              name: PANEL_TITLES["vol-profile"],
              component: "vol-profile",
              config: { panelType: "vol-profile" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "yield-curve",
              name: PANEL_TITLES["yield-curve"],
              component: "yield-curve",
              config: { panelType: "yield-curve" } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "price-fan",
              name: PANEL_TITLES["price-fan"],
              component: "price-fan",
              config: { panelType: "price-fan" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeResearchModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 35,
          children: [
            {
              type: "tab",
              id: "research-radar",
              name: PANEL_TITLES["research-radar"],
              component: "research-radar",
              config: { panelType: "research-radar", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 40,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "instrument-analysis",
                  name: PANEL_TITLES["instrument-analysis"],
                  component: "instrument-analysis",
                  config: {
                    panelType: "instrument-analysis",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "tabset",
          weight: 25,
          children: [
            {
              type: "tab",
              id: "signal-explainability",
              name: PANEL_TITLES["signal-explainability"],
              component: "signal-explainability",
              config: {
                panelType: "signal-explainability",
                incoming: 1,
              } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "news",
              name: PANEL_TITLES.news,
              component: "news",
              config: { panelType: "news" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeClearModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 100,
          children: [],
        },
      ],
    },
  };
}

export function makeOverviewModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 100,
          children: [
            {
              type: "tab",
              id: "market-heatmap",
              name: PANEL_TITLES["market-heatmap"],
              component: "market-heatmap",
              config: { panelType: "market-heatmap" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeAdminModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 30,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "market-heatmap",
                  name: PANEL_TITLES["market-heatmap"],
                  component: "market-heatmap",
                  config: { panelType: "market-heatmap" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-ladder",
                  name: PANEL_TITLES["market-ladder"],
                  component: "market-ladder",
                  config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "estate-overview",
                  name: PANEL_TITLES["estate-overview"],
                  component: "estate-overview",
                  config: { panelType: "estate-overview" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "service-health",
                  name: PANEL_TITLES["service-health"],
                  component: "service-health",
                  config: { panelType: "service-health" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "throughput-gauges",
                  name: PANEL_TITLES["throughput-gauges"],
                  component: "throughput-gauges",
                  config: { panelType: "throughput-gauges" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "admin",
                  name: PANEL_TITLES.admin,
                  component: "admin",
                  config: { panelType: "admin" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "observability",
                  name: PANEL_TITLES.observability,
                  component: "observability",
                  config: { panelType: "observability" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "news-sources",
                  name: PANEL_TITLES["news-sources"],
                  component: "news-sources",
                  config: { panelType: "news-sources" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "market-data-sources",
                  name: PANEL_TITLES["market-data-sources"],
                  component: "market-data-sources",
                  config: { panelType: "market-data-sources" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "market-feed-control",
                  name: PANEL_TITLES["market-feed-control"],
                  component: "market-feed-control",
                  config: { panelType: "market-feed-control" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 30,
              children: [
                {
                  type: "tab",
                  id: "algo-leaderboard",
                  name: PANEL_TITLES["algo-leaderboard"],
                  component: "algo-leaderboard",
                  config: { panelType: "algo-leaderboard" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "load-test",
                  name: PANEL_TITLES["load-test"],
                  component: "load-test",
                  config: { panelType: "load-test" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "llm-subsystem",
                  name: PANEL_TITLES["llm-subsystem"],
                  component: "llm-subsystem",
                  config: { panelType: "llm-subsystem" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 35,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: { panelType: "decision-log", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 35,
              children: [
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

// ── Admin split workspaces ────────────────────────────────────────────────────

export function makeMarketFeedsModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 55,
          children: [
            {
              type: "tabset",
              weight: 100,
              children: [
                {
                  type: "tab",
                  id: "market-heatmap",
                  name: PANEL_TITLES["market-heatmap"],
                  component: "market-heatmap",
                  config: { panelType: "market-heatmap" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 45,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "market-data-sources",
                  name: PANEL_TITLES["market-data-sources"],
                  component: "market-data-sources",
                  config: { panelType: "market-data-sources" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "market-feed-control",
                  name: PANEL_TITLES["market-feed-control"],
                  component: "market-feed-control",
                  config: { panelType: "market-feed-control" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "news-sources",
                  name: PANEL_TITLES["news-sources"],
                  component: "news-sources",
                  config: { panelType: "news-sources" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeSystemStatusModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "estate-overview",
                  name: PANEL_TITLES["estate-overview"],
                  component: "estate-overview",
                  config: { panelType: "estate-overview" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "service-health",
                  name: PANEL_TITLES["service-health"],
                  component: "service-health",
                  config: { panelType: "service-health" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "throughput-gauges",
                  name: PANEL_TITLES["throughput-gauges"],
                  component: "throughput-gauges",
                  config: { panelType: "throughput-gauges" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 65,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "observability",
                  name: PANEL_TITLES.observability,
                  component: "observability",
                  config: { panelType: "observability" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeAdministrationModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 50,
          children: [
            {
              type: "tabset",
              weight: 100,
              children: [
                {
                  type: "tab",
                  id: "admin",
                  name: PANEL_TITLES.admin,
                  component: "admin",
                  config: { panelType: "admin" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 50,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "load-test",
                  name: PANEL_TITLES["load-test"],
                  component: "load-test",
                  config: { panelType: "load-test" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "llm-subsystem",
                  name: PANEL_TITLES["llm-subsystem"],
                  component: "llm-subsystem",
                  config: { panelType: "llm-subsystem" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeAiAdvisoryModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 28,
          children: [
            {
              type: "tab",
              id: "research-radar",
              name: PANEL_TITLES["research-radar"],
              component: "research-radar",
              config: { panelType: "research-radar", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 44,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "instrument-analysis",
                  name: PANEL_TITLES["instrument-analysis"],
                  component: "instrument-analysis",
                  config: {
                    panelType: "instrument-analysis",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 28,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-ticket",
                  name: PANEL_TITLES["order-ticket"],
                  component: "order-ticket",
                  config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "signal-explainability",
                  name: PANEL_TITLES["signal-explainability"],
                  component: "signal-explainability",
                  config: {
                    panelType: "signal-explainability",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "trade-recommendation",
                  name: PANEL_TITLES["trade-recommendation"],
                  component: "trade-recommendation",
                  config: { panelType: "trade-recommendation" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "greeks-surface",
                  name: PANEL_TITLES["greeks-surface"],
                  component: "greeks-surface",
                  config: { panelType: "greeks-surface" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "vol-profile",
                  name: PANEL_TITLES["vol-profile"],
                  component: "vol-profile",
                  config: { panelType: "vol-profile" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeIntelligenceModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 30,
          children: [
            {
              type: "tab",
              id: "research-radar",
              name: PANEL_TITLES["research-radar"],
              component: "research-radar",
              config: { panelType: "research-radar", outgoing: 1 } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "market-heatmap",
              name: PANEL_TITLES["market-heatmap"],
              component: "market-heatmap",
              config: { panelType: "market-heatmap", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 45,
          children: [
            {
              type: "tabset",
              weight: 65,
              children: [
                {
                  type: "tab",
                  id: "instrument-analysis",
                  name: PANEL_TITLES["instrument-analysis"],
                  component: "instrument-analysis",
                  config: {
                    panelType: "instrument-analysis",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 35,
              children: [
                {
                  type: "tab",
                  id: "signal-explainability",
                  name: PANEL_TITLES["signal-explainability"],
                  component: "signal-explainability",
                  config: {
                    panelType: "signal-explainability",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "trade-recommendation",
                  name: PANEL_TITLES["trade-recommendation"],
                  component: "trade-recommendation",
                  config: { panelType: "trade-recommendation" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "scenario-matrix",
                  name: PANEL_TITLES["scenario-matrix"],
                  component: "scenario-matrix",
                  config: { panelType: "scenario-matrix" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "vol-profile",
                  name: PANEL_TITLES["vol-profile"],
                  component: "vol-profile",
                  config: { panelType: "vol-profile" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 25,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "news",
                  name: PANEL_TITLES.news,
                  component: "news",
                  config: { panelType: "news" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "alerts",
                  name: PANEL_TITLES.alerts,
                  component: "alerts",
                  config: { panelType: "alerts" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeFiAnalysisModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 42,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "price-fan",
                  name: PANEL_TITLES["price-fan"],
                  component: "price-fan",
                  config: { panelType: "price-fan" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "vol-profile",
                  name: PANEL_TITLES["vol-profile"],
                  component: "vol-profile",
                  config: { panelType: "vol-profile" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 36,
          children: [
            {
              type: "tabset",
              weight: 34,
              children: [
                {
                  type: "tab",
                  id: "spread-analysis",
                  name: PANEL_TITLES["spread-analysis"],
                  component: "spread-analysis",
                  config: { panelType: "spread-analysis" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 33,
              children: [
                {
                  type: "tab",
                  id: "duration-ladder",
                  name: PANEL_TITLES["duration-ladder"],
                  component: "duration-ladder",
                  config: { panelType: "duration-ladder" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 33,
              children: [
                {
                  type: "tab",
                  id: "vol-surface",
                  name: PANEL_TITLES["vol-surface"],
                  component: "vol-surface",
                  config: { panelType: "vol-surface" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "yield-curve",
                  name: PANEL_TITLES["yield-curve"],
                  component: "yield-curve",
                  config: { panelType: "yield-curve" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "greeks-surface",
                  name: PANEL_TITLES["greeks-surface"],
                  component: "greeks-surface",
                  config: { panelType: "greeks-surface" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "scenario-matrix",
                  name: PANEL_TITLES["scenario-matrix"],
                  component: "scenario-matrix",
                  config: { panelType: "scenario-matrix" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeFiTradingModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 30,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "yield-curve",
                  name: PANEL_TITLES["yield-curve"],
                  component: "yield-curve",
                  config: { panelType: "yield-curve" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "price-fan",
                  name: PANEL_TITLES["price-fan"],
                  component: "price-fan",
                  config: { panelType: "price-fan" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "vol-profile",
                  name: PANEL_TITLES["vol-profile"],
                  component: "vol-profile",
                  config: { panelType: "vol-profile" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 38,
          children: [
            {
              type: "tabset",
              weight: 48,
              children: [
                {
                  type: "tab",
                  id: "order-ticket",
                  name: PANEL_TITLES["order-ticket"],
                  component: "order-ticket",
                  config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 52,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "child-orders",
                  name: PANEL_TITLES["child-orders"],
                  component: "child-orders",
                  config: {
                    panelType: "child-orders",
                    incoming: 2,
                    outgoing: 3,
                  } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 32,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "market-ladder",
                  name: PANEL_TITLES["market-ladder"],
                  component: "market-ladder",
                  config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeFiResearchModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 28,
          children: [
            {
              type: "tab",
              id: "research-radar",
              name: PANEL_TITLES["research-radar"],
              component: "research-radar",
              config: { panelType: "research-radar", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 40,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "instrument-analysis",
                  name: PANEL_TITLES["instrument-analysis"],
                  component: "instrument-analysis",
                  config: {
                    panelType: "instrument-analysis",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 32,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "yield-curve",
                  name: PANEL_TITLES["yield-curve"],
                  component: "yield-curve",
                  config: { panelType: "yield-curve" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "price-fan",
                  name: PANEL_TITLES["price-fan"],
                  component: "price-fan",
                  config: { panelType: "price-fan" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "scenario-matrix",
                  name: PANEL_TITLES["scenario-matrix"],
                  component: "scenario-matrix",
                  config: { panelType: "scenario-matrix" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "signal-explainability",
                  name: PANEL_TITLES["signal-explainability"],
                  component: "signal-explainability",
                  config: {
                    panelType: "signal-explainability",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "news",
                  name: PANEL_TITLES.news,
                  component: "news",
                  config: { panelType: "news" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "trade-recommendation",
                  name: PANEL_TITLES["trade-recommendation"],
                  component: "trade-recommendation",
                  config: { panelType: "trade-recommendation" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "spread-analysis",
                  name: PANEL_TITLES["spread-analysis"],
                  component: "spread-analysis",
                  config: { panelType: "spread-analysis" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "duration-ladder",
                  name: PANEL_TITLES["duration-ladder"],
                  component: "duration-ladder",
                  config: { panelType: "duration-ladder" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "vol-surface",
                  name: PANEL_TITLES["vol-surface"],
                  component: "vol-surface",
                  config: { panelType: "vol-surface" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeObservabilityModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "estate-overview",
                  name: PANEL_TITLES["estate-overview"],
                  component: "estate-overview",
                  config: { panelType: "estate-overview" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "service-health",
                  name: PANEL_TITLES["service-health"],
                  component: "service-health",
                  config: { panelType: "service-health" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "throughput-gauges",
                  name: PANEL_TITLES["throughput-gauges"],
                  component: "throughput-gauges",
                  config: { panelType: "throughput-gauges" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "alerts",
                  name: PANEL_TITLES.alerts,
                  component: "alerts",
                  config: { panelType: "alerts" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 40,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "observability",
                  name: PANEL_TITLES.observability,
                  component: "observability",
                  config: { panelType: "observability" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "algo-leaderboard",
                  name: PANEL_TITLES["algo-leaderboard"],
                  component: "algo-leaderboard",
                  config: { panelType: "algo-leaderboard" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "order-progress",
                  name: PANEL_TITLES["order-progress"],
                  component: "order-progress",
                  config: { panelType: "order-progress" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 25,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: { panelType: "decision-log", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 1 } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeAlgoPipelineModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 30,
          children: [
            {
              type: "tabset",
              weight: 55,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: {
                    panelType: "algo-monitor",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 45,
              children: [
                {
                  type: "tab",
                  id: "throughput-gauges",
                  name: PANEL_TITLES["throughput-gauges"],
                  component: "throughput-gauges",
                  config: { panelType: "throughput-gauges" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "algo-leaderboard",
                  name: PANEL_TITLES["algo-leaderboard"],
                  component: "algo-leaderboard",
                  config: { panelType: "algo-leaderboard" } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 40,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: {
                    panelType: "order-blotter",
                    outgoing: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "child-orders",
                  name: PANEL_TITLES["child-orders"],
                  component: "child-orders",
                  config: {
                    panelType: "child-orders",
                    incoming: 1,
                    outgoing: 2,
                  } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "order-progress",
                  name: PANEL_TITLES["order-progress"],
                  component: "order-progress",
                  config: {
                    panelType: "order-progress",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 30,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: {
                    panelType: "decision-log",
                    incoming: 2,
                  } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export const LAYOUT_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  model: IJsonModel;
  locked?: boolean;
}[] = [
  {
    id: "full",
    locked: true,
    label: "Full Dashboard",
    description: "All panels — complete trading view",
    model: makeDefaultModel(),
  },
  {
    id: "execution",
    locked: true,
    label: "Execution",
    description: "Order entry, ladder, and blotter",
    model: makeExecutionModel(),
  },
  {
    id: "algo",
    locked: true,
    label: "Algo Trading",
    description: "Algorithm monitor, chart, and blotter",
    model: makeAlgoModel(),
  },
  {
    id: "analysis",
    locked: true,
    label: "Market Analysis",
    description: "Chart, depth, ladder, and options analytics — no order entry",
    model: makeAnalysisModel(),
  },
  {
    id: "admin",
    locked: true,
    label: "Mission Control",
    description: "Heatmap + mission control panels — observability, system config, news sources",
    model: makeAdminModel(),
  },
  {
    id: "market-feeds",
    locked: true,
    label: "Market Feeds",
    description: "Live heatmap, data source overrides, feed controls, and news sources",
    model: makeMarketFeedsModel(),
  },
  {
    id: "system-status",
    locked: true,
    label: "System Status",
    description: "Service health, throughput gauges, estate overview, and native observability",
    model: makeSystemStatusModel(),
  },
  {
    id: "administration",
    locked: true,
    label: "Administration",
    description: "Desk limits and RBAC, load testing, and LLM subsystem controls",
    model: makeAdministrationModel(),
  },
  {
    id: "overview",
    locked: true,
    label: "Market Overview",
    description:
      "Full-screen heatmap — sector view with room for key stocks, most traded, most moved",
    model: makeOverviewModel(),
  },
  {
    id: "research",
    locked: true,
    label: "Research",
    description:
      "Signal radar, instrument analysis, and factor explainability — market intelligence pipeline",
    model: makeResearchModel(),
  },
  {
    id: "ai-advisory",
    locked: true,
    label: "AI Advisory",
    description:
      "Signal radar → instrument analysis with LLM advisory note → order ticket for immediate action",
    model: makeAiAdvisoryModel(),
  },
  {
    id: "intelligence",
    locked: true,
    label: "Intelligence Hub",
    description:
      "Full intelligence pipeline — radar, heatmap, instrument deep-dive, signal explainability, scenario matrix, and news",
    model: makeIntelligenceModel(),
  },
  {
    id: "fi-analysis",
    locked: true,
    label: "FI Analysis",
    description: "Yield curve, price fan, vol profile, and scenario matrix — no order entry",
    model: makeFiAnalysisModel(),
  },
  {
    id: "fi-trading",
    locked: true,
    label: "FI Trading",
    description: "High-touch bond desk — yield curve + price fan + full order workflow",
    model: makeFiTradingModel(),
  },
  {
    id: "fi-research",
    locked: true,
    label: "FI Research",
    description: "Rates intelligence — signal radar, instrument analysis, yield curve, and news",
    model: makeFiResearchModel(),
  },
  {
    id: "observability",
    locked: true,
    label: "Observability",
    description:
      "System health command centre — service status, throughput gauges, observability panel, algo leaderboard, and order audit trail",
    model: makeObservabilityModel(),
  },
  {
    id: "algo-pipeline",
    locked: true,
    label: "Pipeline Monitor",
    description:
      "Real-time algo pipeline — strategy monitor, throughput, child order slices, fill progress, executions, and decision log",
    model: makeAlgoPipelineModel(),
  },
  {
    id: "clear",
    label: "Clear Layout",
    description: "Empty canvas — add panels from the panel picker",
    model: makeClearModel(),
  },
];

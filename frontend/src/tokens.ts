export const COLOR = {
  UP: "#34d399",
  UP_DARK: "#059669",
  UP_BG: "#34d39966",
  DOWN: "#f87171",
  DOWN_DARK: "#dc2626",
  DOWN_BG: "#f8717166",
  NEUTRAL: "#9ca3af",

  MAKER: "#10b981",
  TAKER: "#f59e0b",
  CROSS: "#38bdf8",

  LIMIT: "#3b82f6",
  TWAP: "#a855f7",
  POV: "#f97316",
  VWAP: "#eab308",
  ICEBERG: "#22d3ee",
  SNIPER: "#f43f5e",
  ARRIVAL_PRICE: "#818cf8",

  CHART_GRID: "#1f2937",
  CHART_AXIS: "#6b7280",
  CHART_TOOLTIP_BG: "#111827",
  CHART_TOOLTIP_BORDER: "#374151",
  CHART_CURSOR: "#ffffff08",

  HEAT_STRONG_UP: "#0d6b3a",
  HEAT_MID_UP: "#1a8c4e",
  HEAT_UP: "#22a85f",
  HEAT_LIGHT_UP: "#4aba7a",
  HEAT_FAINT_UP: "#73c998",
  HEAT_NEUTRAL: "#374151",
  HEAT_FAINT_DOWN: "#f87171",
  HEAT_DOWN: "#ef4444",
  HEAT_MID_DOWN: "#dc2626",
  HEAT_STRONG_DOWN: "#b91c1c",
  HEAT_DEEP_DOWN: "#7f1d1d",

  HEAT_TEXT_LIGHT_UP: "#052e16",
  HEAT_TEXT_LIGHT_DOWN: "#1c0606",
  HEAT_TEXT_DEFAULT: "#ffffff",

  HEAT_BG: "#0d1117",
  HEAT_SECTOR_BG: "#111827",
  HEAT_SECTOR_LABEL: "#9ca3af",

  FILL: "#34d399",
  REMAINING: "#1f2937",
} as const;

export type ColorKey = keyof typeof COLOR;

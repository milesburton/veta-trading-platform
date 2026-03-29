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

  // Finviz-style heat palette — symmetric, perceptually balanced.
  // Green scale: small moves are muted olive, large moves are deep forest green.
  HEAT_STRONG_UP: "#0a5c31", // ≥ +4%: deep forest green
  HEAT_MID_UP: "#147a41", // ≥ +2%: rich green
  HEAT_UP: "#1e9952", // ≥ +1%: medium green
  HEAT_LIGHT_UP: "#2db56a", // ≥ +0.25%: green, clearly positive
  HEAT_FAINT_UP: "#1e4d2b", // > 0%: very muted dark olive — barely moved up
  HEAT_NEUTRAL: "#1c2531", // 0%: near-black blue-grey
  HEAT_FAINT_DOWN: "#4d1c1c", // < 0%: very muted dark maroon — barely moved down
  HEAT_DOWN: "#b52a2a", // > -1%: red
  HEAT_MID_DOWN: "#922020", // > -2%: deeper red
  HEAT_STRONG_DOWN: "#721515", // > -4%: dark crimson
  HEAT_DEEP_DOWN: "#4f0d0d", // ≤ -4%: deep maroon

  HEAT_TEXT_LIGHT_UP: "#a7f3d0", // light text on dark-olive faint-up tiles
  HEAT_TEXT_LIGHT_DOWN: "#fca5a5", // light text on dark-maroon faint-down tiles
  HEAT_TEXT_DEFAULT: "#f0f0f0", // standard white on all other heat tiles

  HEAT_BG: "#0a0e14", // very dark navy — gaps between tiles
  HEAT_SECTOR_BG: "#0d1520", // slightly lighter for sector label band
  HEAT_SECTOR_LABEL: "#64748b", // slate-grey sector name text

  FILL: "#34d399",
  REMAINING: "#1f2937",
} as const;

export type ColorKey = keyof typeof COLOR;

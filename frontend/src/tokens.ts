/**
 * Trading-semantic colour tokens, sourced from CSS custom properties.
 *
 * For Tailwind class consumers, prefer the semantic palette directly:
 *   <div className="bg-semantic-up" />
 *   <div className="text-semantic-maker" />
 *   <div className="border-chart-grid" />
 *
 * For consumers that need a raw string at runtime (Recharts, canvas APIs,
 * inline `style={{ color }}`, SVG `fill=`), import COLOR and use it
 * exactly as before — values are now resolved from the live CSS variable
 * each time so theme switches take effect without recomputing module state.
 *
 * Defining values in CSS keeps a single source of truth between Tailwind
 * classes and JS reads, and lets the four `data-theme` variants override
 * trading colours per-theme later (a follow-up).
 */

const FALLBACK = {
  "--semantic-up": "52 211 153",
  "--semantic-up-dark": "5 150 105",
  "--semantic-down": "248 113 113",
  "--semantic-down-dark": "220 38 38",
  "--semantic-neutral": "156 163 175",
  "--semantic-maker": "16 185 129",
  "--semantic-taker": "245 158 11",
  "--semantic-cross": "56 189 248",
  "--semantic-limit": "59 130 246",
  "--semantic-twap": "168 85 247",
  "--semantic-pov": "249 115 22",
  "--semantic-vwap": "234 179 8",
  "--semantic-iceberg": "34 211 238",
  "--semantic-sniper": "244 63 94",
  "--semantic-arrival-price": "129 140 248",
  "--semantic-is": "45 212 191",
  "--semantic-momentum": "232 121 249",
  "--chart-grid": "31 41 55",
  "--chart-axis": "107 114 128",
  "--chart-tooltip-bg": "17 24 39",
  "--chart-tooltip-border": "55 65 81",
  "--heat-strong-up": "10 92 49",
  "--heat-mid-up": "20 122 65",
  "--heat-up": "30 153 82",
  "--heat-light-up": "45 181 106",
  "--heat-faint-up": "30 77 43",
  "--heat-neutral": "28 37 49",
  "--heat-faint-down": "77 28 28",
  "--heat-down": "181 42 42",
  "--heat-mid-down": "146 32 32",
  "--heat-strong-down": "114 21 21",
  "--heat-deep-down": "79 13 13",
  "--heat-text-light-up": "167 243 208",
  "--heat-text-light-down": "252 165 165",
  "--heat-text-default": "240 240 240",
  "--heat-bg": "10 14 20",
  "--heat-sector-bg": "13 21 32",
  "--heat-sector-label": "100 116 139",
  "--gray-800": "30 41 55",
} as const;

type CssVar = keyof typeof FALLBACK;

function rgb(name: CssVar, alpha = 1): string {
  if (typeof document === "undefined") {
    return `rgba(${FALLBACK[name].replace(/ /g, ", ")}, ${alpha})`;
  }
  const raw =
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || FALLBACK[name];
  const triplet = raw.replace(/ /g, ", ");
  return alpha === 1 ? `rgb(${triplet})` : `rgba(${triplet}, ${alpha})`;
}

export const COLOR = {
  get UP() {
    return rgb("--semantic-up");
  },
  get UP_DARK() {
    return rgb("--semantic-up-dark");
  },
  get UP_BG() {
    return rgb("--semantic-up", 0.4);
  },
  get DOWN() {
    return rgb("--semantic-down");
  },
  get DOWN_DARK() {
    return rgb("--semantic-down-dark");
  },
  get DOWN_BG() {
    return rgb("--semantic-down", 0.4);
  },
  get NEUTRAL() {
    return rgb("--semantic-neutral");
  },

  get MAKER() {
    return rgb("--semantic-maker");
  },
  get TAKER() {
    return rgb("--semantic-taker");
  },
  get CROSS() {
    return rgb("--semantic-cross");
  },

  get LIMIT() {
    return rgb("--semantic-limit");
  },
  get TWAP() {
    return rgb("--semantic-twap");
  },
  get POV() {
    return rgb("--semantic-pov");
  },
  get VWAP() {
    return rgb("--semantic-vwap");
  },
  get ICEBERG() {
    return rgb("--semantic-iceberg");
  },
  get SNIPER() {
    return rgb("--semantic-sniper");
  },
  get ARRIVAL_PRICE() {
    return rgb("--semantic-arrival-price");
  },
  get IS() {
    return rgb("--semantic-is");
  },
  get MOMENTUM() {
    return rgb("--semantic-momentum");
  },

  get CHART_GRID() {
    return rgb("--chart-grid");
  },
  get CHART_AXIS() {
    return rgb("--chart-axis");
  },
  get CHART_TOOLTIP_BG() {
    return rgb("--chart-tooltip-bg");
  },
  get CHART_TOOLTIP_BORDER() {
    return rgb("--chart-tooltip-border");
  },
  get CHART_CURSOR() {
    return "rgba(255, 255, 255, 0.03)";
  },

  get HEAT_STRONG_UP() {
    return rgb("--heat-strong-up");
  },
  get HEAT_MID_UP() {
    return rgb("--heat-mid-up");
  },
  get HEAT_UP() {
    return rgb("--heat-up");
  },
  get HEAT_LIGHT_UP() {
    return rgb("--heat-light-up");
  },
  get HEAT_FAINT_UP() {
    return rgb("--heat-faint-up");
  },
  get HEAT_NEUTRAL() {
    return rgb("--heat-neutral");
  },
  get HEAT_FAINT_DOWN() {
    return rgb("--heat-faint-down");
  },
  get HEAT_DOWN() {
    return rgb("--heat-down");
  },
  get HEAT_MID_DOWN() {
    return rgb("--heat-mid-down");
  },
  get HEAT_STRONG_DOWN() {
    return rgb("--heat-strong-down");
  },
  get HEAT_DEEP_DOWN() {
    return rgb("--heat-deep-down");
  },
  get HEAT_TEXT_LIGHT_UP() {
    return rgb("--heat-text-light-up");
  },
  get HEAT_TEXT_LIGHT_DOWN() {
    return rgb("--heat-text-light-down");
  },
  get HEAT_TEXT_DEFAULT() {
    return rgb("--heat-text-default");
  },
  get HEAT_BG() {
    return rgb("--heat-bg");
  },
  get HEAT_SECTOR_BG() {
    return rgb("--heat-sector-bg");
  },
  get HEAT_SECTOR_LABEL() {
    return rgb("--heat-sector-label");
  },

  get FILL() {
    return rgb("--semantic-up");
  },
  get REMAINING() {
    return rgb("--gray-800");
  },
} as const;

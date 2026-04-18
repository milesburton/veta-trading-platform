import { describe, expect, it } from "vitest";
import { COLOR } from "../../tokens";
import { collapseSmallTiles, pctToColor, squarify, tileTextColor } from "../MarketHeatmap";

describe("MarketHeatmap helpers", () => {
  it("maps percentage bands to heat colors", () => {
    expect(pctToColor(4)).toBe(COLOR.HEAT_STRONG_UP);
    expect(pctToColor(2)).toBe(COLOR.HEAT_MID_UP);
    expect(pctToColor(1)).toBe(COLOR.HEAT_UP);
    expect(pctToColor(0.3)).toBe(COLOR.HEAT_LIGHT_UP);
    expect(pctToColor(0.1)).toBe(COLOR.HEAT_FAINT_UP);
    expect(pctToColor(0)).toBe(COLOR.HEAT_NEUTRAL);
    expect(pctToColor(-0.1)).toBe(COLOR.HEAT_FAINT_DOWN);
    expect(pctToColor(-0.5)).toBe(COLOR.HEAT_DOWN);
    expect(pctToColor(-1.5)).toBe(COLOR.HEAT_MID_DOWN);
    expect(pctToColor(-3)).toBe(COLOR.HEAT_STRONG_DOWN);
    expect(pctToColor(-4)).toBe(COLOR.HEAT_DEEP_DOWN);
  });

  it("uses legible text color on faint tiles", () => {
    expect(tileTextColor(0.1)).toBe(COLOR.HEAT_TEXT_LIGHT_UP);
    expect(tileTextColor(-0.1)).toBe(COLOR.HEAT_TEXT_LIGHT_DOWN);
    expect(tileTextColor(0)).toBe(COLOR.HEAT_TEXT_DEFAULT);
    expect(tileTextColor(2)).toBe(COLOR.HEAT_TEXT_DEFAULT);
  });

  it("returns empty layout when bounds are invalid", () => {
    const items = [{ symbol: "A", sector: "Tech", pct: 1, size: 1 }];
    expect(squarify(items, { x: 0, y: 0, w: 0, h: 100 })).toEqual([]);
    expect(squarify(items, { x: 0, y: 0, w: 100, h: 0 })).toEqual([]);
  });

  it("generates one tile per item with positive dimensions", () => {
    const items = [
      { symbol: "A", sector: "Tech", pct: 1.2, size: 5 },
      { symbol: "B", sector: "Tech", pct: -0.4, size: 3 },
      { symbol: "C", sector: "Tech", pct: 0.2, size: 2 },
    ];
    const out = squarify(items, { x: 0, y: 0, w: 100, h: 60 });

    expect(out).toHaveLength(items.length);
    for (const tile of out) {
      expect(tile.w).toBeGreaterThan(0);
      expect(tile.h).toBeGreaterThan(0);
    }
  });

  it("collapses tiny sector tiles into a single OTHER tile", () => {
    const items = [
      { symbol: "A", sector: "Tech", pct: 1, size: 1 },
      { symbol: "B", sector: "Tech", pct: 2, size: 1 },
      { symbol: "C", sector: "Tech", pct: -1, size: 1 },
      { symbol: "D", sector: "Tech", pct: -2, size: 1 },
    ];

    const out = collapseSmallTiles(items, { x: 0, y: 0, w: 20, h: 20 }, "Tech");
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("Tech:OTHER");
    expect(out[0].isOther).toBe(true);
    expect(out[0].otherCount).toBe(4);
  });
});

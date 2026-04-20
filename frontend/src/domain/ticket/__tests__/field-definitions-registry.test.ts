import { describe, expect, it } from "vitest";
import { quantityLabel, quantitySubLabel, STRATEGY_OPTIONS } from "../field-definitions";
import { FIELD_REGISTRY, FK, getFieldDef } from "../field-registry";

describe("ticket field definitions", () => {
  it("contains all supported strategy options", () => {
    expect(STRATEGY_OPTIONS.map((s) => s.value)).toEqual([
      "LIMIT",
      "TWAP",
      "POV",
      "VWAP",
      "ICEBERG",
      "SNIPER",
      "ARRIVAL_PRICE",
      "IS",
      "MOMENTUM",
    ]);
  });

  it("returns quantity labels by instrument type", () => {
    expect(quantityLabel("option")).toBe("Contracts");
    expect(quantityLabel("bond")).toBe("Quantity");
    expect(quantityLabel("equity")).toBe("Quantity");
  });

  it("returns quantity sub-labels by instrument type", () => {
    expect(quantitySubLabel("option")).toBe("(1 contract = 100 shares)");
    expect(quantitySubLabel("bond")).toBe("(bonds)");
    expect(quantitySubLabel("equity")).toBe("(shares)");
  });
});

describe("ticket field registry", () => {
  it("contains canonical keys in expected sections", () => {
    expect(getFieldDef(FK.SIDE)?.section).toBe("order");
    expect(getFieldDef(FK.VENUE)?.section).toBe("routing");
    expect(getFieldDef(FK.OPTION_TYPE)?.section).toBe("instrument");
    expect(getFieldDef(FK.BOND_SYMBOL)?.section).toBe("instrument");
  });

  it("marks required and visible defaults correctly", () => {
    expect(getFieldDef(FK.SIDE)?.defaultRequired).toBe(true);
    expect(getFieldDef(FK.SIDE)?.defaultVisible).toBe(true);
    expect(getFieldDef(FK.OPTION_TYPE)?.defaultRequired).toBe(false);
    expect(getFieldDef(FK.OPTION_TYPE)?.defaultVisible).toBe(false);
  });

  it("returns undefined for unknown keys", () => {
    expect(getFieldDef("does-not-exist")).toBeUndefined();
  });

  it("registers unique field keys", () => {
    const keys = FIELD_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

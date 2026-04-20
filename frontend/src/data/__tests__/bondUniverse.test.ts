import { describe, expect, it } from "vitest";
import { BOND_UNIVERSE, getBond, getBonds } from "../bondUniverse";

describe("BOND_UNIVERSE – data integrity", () => {
  it("contains at least 10 bonds", () => {
    expect(BOND_UNIVERSE.length).toBeGreaterThanOrEqual(10);
  });

  it("every bond has required fields", () => {
    for (const bond of BOND_UNIVERSE) {
      expect(bond.isin).toBeTruthy();
      expect(bond.symbol).toBeTruthy();
      expect(bond.description).toBeTruthy();
      expect(bond.faceValue).toBeGreaterThan(0);
      expect(bond.periodsPerYear).toBeGreaterThan(0);
      expect(bond.issuer).toMatch(/^(UST|Corp)$/);
    }
  });

  it("includes US Treasury bonds", () => {
    const ust = BOND_UNIVERSE.filter((b) => b.issuer === "UST");
    expect(ust.length).toBeGreaterThan(0);
  });

  it("includes corporate bonds", () => {
    const corp = BOND_UNIVERSE.filter((b) => b.issuer === "Corp");
    expect(corp.length).toBeGreaterThan(0);
  });
});

describe("getBond", () => {
  it("returns the matching bond for a known symbol", () => {
    const first = BOND_UNIVERSE[0];
    const result = getBond(first.symbol);
    expect(result).toEqual(first);
  });

  it("returns undefined for an unknown symbol", () => {
    expect(getBond("UNKNOWN-XYZ")).toBeUndefined();
  });
});

describe("getBonds", () => {
  it("returns all bonds when called with no filter", () => {
    expect(getBonds()).toHaveLength(BOND_UNIVERSE.length);
  });

  it("returns all bonds when filter issuer is undefined", () => {
    expect(getBonds({})).toHaveLength(BOND_UNIVERSE.length);
  });

  it("returns only UST bonds when filtering by UST issuer", () => {
    const result = getBonds({ issuer: "UST" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((b) => b.issuer === "UST")).toBe(true);
  });

  it("returns only Corp bonds when filtering by Corp issuer", () => {
    const result = getBonds({ issuer: "Corp" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((b) => b.issuer === "Corp")).toBe(true);
  });

  it("UST + Corp count equals total", () => {
    const ust = getBonds({ issuer: "UST" });
    const corp = getBonds({ issuer: "Corp" });
    expect(ust.length + corp.length).toBe(BOND_UNIVERSE.length);
  });
});

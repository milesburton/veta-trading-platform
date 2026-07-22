// docs: /platform/market-simulator/
// #region docs:bond-universe-shared
import { CURATED_BONDS } from "../../../shared/curatedBonds.ts";
import { GENERATED_BONDS } from "../../../shared/generatedBondUniverse.ts";
import type { BondDef } from "../../../shared/bondUniverseTypes.ts";

export type { BondDef };

export const BOND_UNIVERSE: BondDef[] = [...CURATED_BONDS, ...GENERATED_BONDS];
// #endregion docs:bond-universe-shared

/** Look up a bond by symbol. */
export function getBond(symbol: string): BondDef | undefined {
  return BOND_UNIVERSE.find((b) => b.symbol === symbol);
}

/** Return all bonds or filter by issuer type. */
export function getBonds(filter?: { issuer?: "UST" | "Corp" }): BondDef[] {
  if (!filter?.issuer) return BOND_UNIVERSE;
  return BOND_UNIVERSE.filter((b) => b.issuer === filter.issuer);
}

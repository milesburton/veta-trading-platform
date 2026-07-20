/**
 * Fixed-income asset universe: hand-curated on-the-run bonds plus a
 * generated set of off-the-run UST and additional IG corporate bonds.
 * Both curated and generated data live in shared/ so the frontend order
 * ticket reads the same source instead of hand-duplicating it.
 */

import { CURATED_BONDS } from "../../../shared/curatedBonds.ts";
import { GENERATED_BONDS } from "../../../shared/generatedBondUniverse.ts";
import type { BondDef } from "../../../shared/bondUniverseTypes.ts";

export type { BondDef };

export const BOND_UNIVERSE: BondDef[] = [...CURATED_BONDS, ...GENERATED_BONDS];

/** Look up a bond by symbol. */
export function getBond(symbol: string): BondDef | undefined {
  return BOND_UNIVERSE.find((b) => b.symbol === symbol);
}

/** Return all bonds or filter by issuer type. */
export function getBonds(filter?: { issuer?: "UST" | "Corp" }): BondDef[] {
  if (!filter?.issuer) return BOND_UNIVERSE;
  return BOND_UNIVERSE.filter((b) => b.issuer === filter.issuer);
}

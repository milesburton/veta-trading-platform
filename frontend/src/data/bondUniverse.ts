/**
 * Frontend bond universe. Reads the same curated + generated data as
 * backend/src/market-sim/bondUniverse.ts from shared/ instead of
 * hand-duplicating it (Vite can import shared/*.ts directly; it's only
 * Deno-specific backend modules it can't reach).
 */

import type { BondDef } from "@shared/bondUniverseTypes";
import { CURATED_BONDS } from "@shared/curatedBonds";
import { GENERATED_BONDS } from "@shared/generatedBondUniverse";

export type { BondDef };

export const BOND_UNIVERSE: BondDef[] = [...CURATED_BONDS, ...GENERATED_BONDS];

export function getBond(symbol: string): BondDef | undefined {
  return BOND_UNIVERSE.find((b) => b.symbol === symbol);
}

export function getBonds(filter?: { issuer?: "UST" | "Corp" }): BondDef[] {
  if (!filter?.issuer) return BOND_UNIVERSE;
  return BOND_UNIVERSE.filter((b) => b.issuer === filter.issuer);
}

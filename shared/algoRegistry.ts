import { STRATEGIES, type Strategy } from "./primitives.ts";

export interface AlgoRegistration {
  readonly algoId: string;
  readonly version: string;
  readonly description: string;
}

export const ALGO_REGISTRY: Readonly<Record<Strategy, AlgoRegistration>> = {
  LIMIT: {
    algoId: "VETA-LIMIT",
    version: "1.0.0",
    description: "Limit order working at the stated price",
  },
  TWAP: {
    algoId: "VETA-TWAP",
    version: "1.0.0",
    description: "Time-weighted average price slicing",
  },
  POV: { algoId: "VETA-POV", version: "1.0.0", description: "Percentage of volume participation" },
  VWAP: {
    algoId: "VETA-VWAP",
    version: "1.0.0",
    description: "Volume-weighted average price slicing",
  },
  ICEBERG: {
    algoId: "VETA-ICEBERG",
    version: "1.0.0",
    description: "Iceberg with a hidden reserve",
  },
  SNIPER: {
    algoId: "VETA-SNIPER",
    version: "1.0.0",
    description: "Opportunistic liquidity-taking sniper",
  },
  ARRIVAL_PRICE: {
    algoId: "VETA-ARRIVAL-PRICE",
    version: "1.0.0",
    description: "Arrival price benchmark execution",
  },
  IS: { algoId: "VETA-IS", version: "1.0.0", description: "Implementation shortfall minimisation" },
  MOMENTUM: {
    algoId: "VETA-MOMENTUM",
    version: "1.0.0",
    description: "Momentum-following execution",
  },
};

export function algoRegistration(strategy: string | undefined): AlgoRegistration | undefined {
  if (!strategy) return undefined;
  const key = strategy.toUpperCase().replaceAll("-", "_") as Strategy;
  return (STRATEGIES as readonly string[]).includes(key) ? ALGO_REGISTRY[key] : undefined;
}

export function isAlgorithmicStrategy(strategy: string | undefined): boolean {
  const key = strategy?.toUpperCase();
  return key !== undefined && key !== "LIMIT" && algoRegistration(key) !== undefined;
}

export function algoIdentifiers(strategy: string | undefined): {
  algoId?: string;
  algoVersion?: string;
} {
  const registration = isAlgorithmicStrategy(strategy) ? algoRegistration(strategy) : undefined;
  return registration ? { algoId: registration.algoId, algoVersion: registration.version } : {};
}

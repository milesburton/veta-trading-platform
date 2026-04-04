import type { Strategy } from "../../types";

export interface StrategyMeta {
  value: Strategy;
  label: string;
}

export const STRATEGY_OPTIONS: StrategyMeta[] = [
  { value: "LIMIT", label: "Limit Order" },
  { value: "TWAP", label: "TWAP — Time Weighted Avg Price" },
  { value: "POV", label: "POV — Percentage of Volume" },
  { value: "VWAP", label: "VWAP — Volume Weighted Avg Price" },
  { value: "ICEBERG", label: "ICEBERG — Hidden quantity reveal" },
  { value: "SNIPER", label: "SNIPER — Multi-venue smart routing" },
  {
    value: "ARRIVAL_PRICE",
    label: "ARRIVAL PRICE — Minimise arrival slippage",
  },
  { value: "IS", label: "IS — Implementation Shortfall" },
  { value: "MOMENTUM", label: "MOMENTUM — EMA crossover entry" },
];

export function quantityLabel(instrumentType: string): string {
  switch (instrumentType) {
    case "option":
      return "Contracts";
    case "bond":
      return "Quantity";
    default:
      return "Quantity";
  }
}

export function quantitySubLabel(instrumentType: string): string {
  switch (instrumentType) {
    case "option":
      return "(1 contract = 100 shares)";
    case "bond":
      return "(bonds)";
    default:
      return "(shares)";
  }
}

import type { ProductLegPayload } from "./api";

export type LegType = "equity" | "bond" | "option";

export interface DraftLeg {
  _key: string;
  type: LegType;
  symbol: string;
  weight: number;
  isin?: string;
  optionStrike?: string;
  optionExpiry?: string;
  optionPutCall?: "CALL" | "PUT";
}

let _legKey = 0;

export function newLegKey(): string {
  return `dleg-${++_legKey}`;
}

function buildOptionSpec(leg: DraftLeg): ProductLegPayload["optionSpec"] | undefined {
  if (leg.type !== "option" || !leg.optionStrike || !leg.optionExpiry) return undefined;
  return {
    strike: parseFloat(leg.optionStrike),
    expiry: leg.optionExpiry,
    putCall: leg.optionPutCall ?? "CALL",
  };
}

export function toLegPayloads(legs: DraftLeg[]): ProductLegPayload[] {
  return legs.map((l) => {
    const payload: ProductLegPayload = {
      type: l.type,
      symbol: l.symbol,
      weight: l.weight / 100,
    };
    if (l.isin) payload.isin = l.isin;
    const optionSpec = buildOptionSpec(l);
    if (optionSpec) payload.optionSpec = optionSpec;
    return payload;
  });
}

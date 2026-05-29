export type TradingStyle =
  | "high_touch"
  | "low_touch"
  | "fi_voice"
  | "fx_electronic"
  | "commodities_voice"
  | "derivatives_high_touch"
  | "derivatives_low_touch"
  | "oversight";

export type PrimaryDesk =
  | "equity-cash"
  | "equity-derivs"
  | "fi-rates"
  | "fi-credit"
  | "fi-govies"
  | "fx-cash"
  | "commodities"
  | "cross-desk";

export interface TraderArchetype {
  id: string;
  label: string;
  description: string;
  tradingStyle: TradingStyle;
  primaryDesk: PrimaryDesk;
  allowedDesks: string;
  allowedStrategies: string;
  darkPoolAccess: boolean;
}

export const STARTER_MAX_ORDER_QTY = 10_000;
export const STARTER_MAX_DAILY_NOTIONAL = 1_000_000;

export const TRADER_ARCHETYPES: readonly TraderArchetype[] = [
  {
    id: "equity-high-touch",
    label: "Equity high-touch",
    description: "Manual equity execution: order ticket, ICEBERG, arrival price.",
    tradingStyle: "high_touch",
    primaryDesk: "equity-cash",
    allowedDesks: "equity",
    allowedStrategies: "LIMIT,TWAP,POV,VWAP,ICEBERG,ARRIVAL_PRICE",
    darkPoolAccess: false,
  },
  {
    id: "equity-low-touch",
    label: "Equity low-touch / algo",
    description: "Algo equity flow: VWAP, POV, TWAP via the algo monitor.",
    tradingStyle: "low_touch",
    primaryDesk: "equity-cash",
    allowedDesks: "equity",
    allowedStrategies: "LIMIT,TWAP,POV,VWAP",
    darkPoolAccess: false,
  },
  {
    id: "fi-voice",
    label: "Fixed income voice",
    description: "Rates and credit voice trading: RFQ, yield curve, duration ladder.",
    tradingStyle: "fi_voice",
    primaryDesk: "fi-govies",
    allowedDesks: "fi",
    allowedStrategies: "LIMIT",
    darkPoolAccess: false,
  },
  {
    id: "fx-electronic",
    label: "FX electronic",
    description: "Electronic cash FX with dark pool access.",
    tradingStyle: "fx_electronic",
    primaryDesk: "fx-cash",
    allowedDesks: "fx",
    allowedStrategies: "LIMIT,TWAP,POV,VWAP",
    darkPoolAccess: true,
  },
  {
    id: "fx-high-touch",
    label: "FX high-touch",
    description: "Manual FX quoting on the cash desk.",
    tradingStyle: "high_touch",
    primaryDesk: "fx-cash",
    allowedDesks: "fx",
    allowedStrategies: "LIMIT,TWAP",
    darkPoolAccess: false,
  },
  {
    id: "derivatives-high-touch",
    label: "Derivatives high-touch",
    description: "Manual options with vol surface and greeks.",
    tradingStyle: "derivatives_high_touch",
    primaryDesk: "equity-derivs",
    allowedDesks: "derivatives",
    allowedStrategies: "LIMIT,TWAP,POV,ICEBERG",
    darkPoolAccess: false,
  },
  {
    id: "derivatives-low-touch",
    label: "Derivatives low-touch",
    description: "Vol-targeting algo strategies on the derivatives desk.",
    tradingStyle: "derivatives_low_touch",
    primaryDesk: "equity-derivs",
    allowedDesks: "derivatives",
    allowedStrategies: "LIMIT,TWAP,POV,VWAP,ICEBERG",
    darkPoolAccess: false,
  },
  {
    id: "commodities-voice",
    label: "Commodities voice",
    description: "Oil, metals, and agriculture RFQ trading.",
    tradingStyle: "commodities_voice",
    primaryDesk: "commodities",
    allowedDesks: "commodities",
    allowedStrategies: "LIMIT",
    darkPoolAccess: false,
  },
] as const;

export const TRADER_ARCHETYPE_IDS = TRADER_ARCHETYPES.map((a) => a.id);

export function getTraderArchetype(id: string): TraderArchetype | undefined {
  return TRADER_ARCHETYPES.find((a) => a.id === id);
}

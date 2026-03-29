import type { Strategy } from "../../types";

export type MarketPhase =
  | "PRE_OPEN"
  | "OPENING_AUCTION"
  | "CONTINUOUS"
  | "CLOSING_AUCTION"
  | "HALTED"
  | "CLOSED";

export interface SessionState {
  phase: MarketPhase;
  allowsOrderEntry: boolean;
  allowsAmend: boolean;
  allowsCancel: boolean;
  supportedStrategies: Strategy[];
  phaseLabel: string;
  nextTransitionAt?: number;
}

// ---------------------------------------------------------------------------

const ALL_STRATEGIES: Strategy[] = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
];

const AUCTION_STRATEGIES: Strategy[] = ["LIMIT"];

/** Resolve a MarketPhase into a full SessionState. */
export function resolveSession(phase: MarketPhase, nextTransitionAt?: number): SessionState {
  switch (phase) {
    case "PRE_OPEN":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Pre-Open",
        nextTransitionAt,
      };
    case "OPENING_AUCTION":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Opening Auction",
        nextTransitionAt,
      };
    case "CONTINUOUS":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: ALL_STRATEGIES,
        phaseLabel: "Continuous Trading",
        nextTransitionAt,
      };
    case "CLOSING_AUCTION":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: false,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Closing Auction",
        nextTransitionAt,
      };
    case "HALTED":
      return {
        phase,
        allowsOrderEntry: false,
        allowsAmend: false,
        allowsCancel: true,
        supportedStrategies: [],
        phaseLabel: "Trading Halted",
        nextTransitionAt,
      };
    case "CLOSED":
      return {
        phase,
        allowsOrderEntry: false,
        allowsAmend: false,
        allowsCancel: false,
        supportedStrategies: [],
        phaseLabel: "Market Closed",
        nextTransitionAt,
      };
  }
}

export function isStrategyAllowedInSession(session: SessionState, strategy: Strategy): boolean {
  return session.supportedStrategies.includes(strategy);
}

export function isAuction(phase: MarketPhase): boolean {
  return phase === "OPENING_AUCTION" || phase === "CLOSING_AUCTION";
}

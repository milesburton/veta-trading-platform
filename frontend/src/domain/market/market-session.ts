// ---------------------------------------------------------------------------
// Market Session Model
// ---------------------------------------------------------------------------
// Pure types and helpers describing exchange session phases and their
// implications for order entry. No React or Redux dependencies.
// ---------------------------------------------------------------------------

import type { Strategy } from "../../types";

/** Exchange session phases, in lifecycle order. */
export type MarketPhase =
  | "PRE_OPEN"
  | "OPENING_AUCTION"
  | "CONTINUOUS"
  | "CLOSING_AUCTION"
  | "HALTED"
  | "CLOSED";

/**
 * Resolved session state — what the trading ticket needs to know about
 * the current exchange session. Produced by the backend (market-sim or
 * a real market-session-service) and consumed by the rule engine.
 */
export interface SessionState {
  phase: MarketPhase;

  /** Can new orders be entered in this phase? */
  allowsOrderEntry: boolean;

  /** Can existing orders be amended? */
  allowsAmend: boolean;

  /** Can existing orders be cancelled? */
  allowsCancel: boolean;

  /** Which order types / strategies are accepted in this phase? */
  supportedStrategies: Strategy[];

  /** Human-readable description for UI display. */
  phaseLabel: string;

  /** Optional: when the next phase transition is expected (epoch ms). */
  nextTransitionAt?: number;
}

// ---------------------------------------------------------------------------
// Phase definitions — explicit, testable TypeScript, not config JSON
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

/**
 * Resolve a MarketPhase into a full SessionState.
 *
 * This is the single source of truth for what each phase allows.
 * It can run on the backend (market-sim) or frontend (rule engine).
 */
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

/** Check if a given strategy is supported in the current session phase. */
export function isStrategyAllowedInSession(session: SessionState, strategy: Strategy): boolean {
  return session.supportedStrategies.includes(strategy);
}

/** Is the market in an auction phase? */
export function isAuction(phase: MarketPhase): boolean {
  return phase === "OPENING_AUCTION" || phase === "CLOSING_AUCTION";
}

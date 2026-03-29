import type { TradingLimits } from "../../store/authSlice";
import type { KillBlock } from "../../store/killSwitchSlice";
import type { InstrumentType, Strategy, TimeInForce } from "../../types";
import type { SessionState } from "../market/market-session";
import type { VenueMIC } from "../market/venue-capabilities";

// ---------------------------------------------------------------------------
// Ticket Context — everything the rule engine receives as input
// ---------------------------------------------------------------------------

export type Side = "BUY" | "SELL";

/** Tracks whether a field value was set by the user or auto-defaulted. */
export type FieldOrigin = "default" | "user" | "derived";

export interface InstrumentContext {
  instrumentType: InstrumentType;
  symbol: string;
  lotSize: number;
  currentPrice: number | undefined;
  orderBookMid: number | undefined;
}

export interface DraftOrder {
  side: Side;
  quantity: number;
  limitPrice: number;
  strategy: Strategy;
  expiresAtSecs: number;
  tif: TimeInForce;
}

export interface OptionDraft {
  optionType: "call" | "put";
  strike: number;
  expirySecs: number;
  hasQuote: boolean;
  isFetching: boolean;
}

export interface BondDraft {
  symbol: string;
  yieldPct: number;
  hasQuote: boolean;
  isFetching: boolean;
  hasBondDef: boolean;
}

export interface TicketContext {
  userId: string | undefined;
  userRole: "trader" | "admin" | "compliance" | "sales" | "external-client" | undefined;
  limits: TradingLimits;
  killBlocks: KillBlock[];
  instrument: InstrumentContext;
  draft: DraftOrder;
  option: OptionDraft;
  bond: BondDraft;
  /** Which fields the user has explicitly edited (not auto-filled). */
  dirtyFields: ReadonlySet<string>;

  /** Current exchange session state (phase, allowed actions). */
  session: SessionState;

  /** Selected routing venue (if user has explicitly chosen one). */
  selectedVenue?: VenueMIC;

  /** Bid-ask spread in bps — used for spread-threshold validation. */
  spreadBps?: number;
}

// ---------------------------------------------------------------------------
// Diagnostics — structured validation output
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  field: string; // field key, or "*" for form-level
  severity: Severity;
  message: string;
  ruleId: string; // stable identifier for test assertions
}

// ---------------------------------------------------------------------------
// Strategy option for the UI dropdown
// ---------------------------------------------------------------------------

export interface StrategyOption {
  value: Strategy;
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

// ---------------------------------------------------------------------------
// Ticket Resolution — the complete computed state of the ticket
// ---------------------------------------------------------------------------

export interface TicketResolution {
  /** Can the form be submitted right now? (no errors + required fields filled) */
  canSubmit: boolean;
  /** Primary reason submission is blocked, if any. */
  submitBlockReason: string | null;

  /** Role-based lockout (admin/compliance cannot trade). */
  roleLocked: boolean;
  roleLockedMessage: string | null;

  /** Which instrument type tabs are available to this user. */
  availableInstrumentTypes: InstrumentType[];

  /** Strategy dropdown options with enabled/disabled state. */
  strategyOptions: StrategyOption[];

  /** Whether strategy selector should be visible (hidden for options/bonds). */
  showStrategySelector: boolean;

  /** Whether limit price field is visible (hidden for options/bonds). */
  showLimitPrice: boolean;

  /** Whether TIF / duration / algo params are visible. */
  showTradingParams: boolean;

  /** Whether the asset selector is visible (hidden for bonds). */
  showAssetSelector: boolean;

  /** Quantity label override ("Contracts", "Quantity (bonds)", etc.) */
  quantityLabel: string;
  quantitySubLabel: string;

  /** Dark pool eligibility for this order. */
  darkPoolEligible: boolean;

  /** Current market phase label for UI display. */
  marketPhaseLabel: string;

  /** Whether order entry is allowed in the current session phase. */
  sessionAllowsEntry: boolean;

  /** Computed notional value, or null if qty/price incomplete. */
  notional: number | null;

  /** Arrival slippage vs order book mid, in bps. */
  arrivalSlippageBps: number | null;

  /** All diagnostics from all rules. */
  diagnostics: Diagnostic[];

  /** Convenience: diagnostics filtered to errors only. */
  errors: Diagnostic[];

  /** Convenience: diagnostics filtered to warnings only. */
  warnings: Diagnostic[];
}

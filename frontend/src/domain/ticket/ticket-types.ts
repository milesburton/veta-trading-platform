import type { TradingLimits } from "../../store/authSlice";
import type { KillBlock } from "../../store/killSwitchSlice";
import type { InstrumentType, Strategy, TimeInForce } from "../../types";
import type { SessionState } from "../market/market-session";
import type { VenueMIC } from "../market/venue-capabilities";

export type Side = "BUY" | "SELL";

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
  userRole:
    | "trader"
    | "desk-head"
    | "admin"
    | "compliance"
    | "sales"
    | "external-client"
    | "viewer"
    | undefined;
  limits: TradingLimits;
  killBlocks: KillBlock[];
  instrument: InstrumentContext;
  draft: DraftOrder;
  option: OptionDraft;
  bond: BondDraft;
  dirtyFields: ReadonlySet<string>;
  session: SessionState;
  selectedVenue?: VenueMIC;
  spreadBps?: number;
}

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  field: string;
  severity: Severity;
  message: string;
  ruleId: string;
}

export interface StrategyOption {
  value: Strategy;
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

export interface ResolvedField {
  key: string;
  value: unknown;
  visible: boolean;
  disabled: boolean;
  required: boolean;
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  errors: string[];
  warnings: string[];
  origin: FieldOrigin;
}

export interface TicketResolution {
  canSubmit: boolean;
  submitBlockReason: string | null;
  roleLocked: boolean;
  roleLockedMessage: string | null;
  availableInstrumentTypes: InstrumentType[];
  strategyOptions: StrategyOption[];
  showStrategySelector: boolean;
  showLimitPrice: boolean;
  showTradingParams: boolean;
  showAssetSelector: boolean;
  quantityLabel: string;
  quantitySubLabel: string;
  darkPoolEligible: boolean;
  marketPhaseLabel: string;
  sessionAllowsEntry: boolean;
  notional: number | null;
  arrivalSlippageBps: number | null;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  resolvedFields: Record<string, ResolvedField>;
}

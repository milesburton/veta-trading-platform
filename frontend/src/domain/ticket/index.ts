export { STRATEGY_OPTIONS } from "./field-definitions";
export { resolveTicket } from "./resolve-ticket";
export { checkDarkPoolEligible } from "./rules/dark-pool";
export { availableInstrumentTypes, deriveDesk } from "./rules/desk-access";
export { checkRoleLocked } from "./rules/role-check";
export type {
  BondDraft,
  Diagnostic,
  DraftOrder,
  FieldOrigin,
  InstrumentContext,
  OptionDraft,
  Severity,
  Side,
  StrategyOption,
  TicketContext,
  TicketResolution,
} from "./ticket-types";
export { useTicketResolution } from "./useTicketResolution";

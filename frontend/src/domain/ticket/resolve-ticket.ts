import { isStrategyAllowedInSession } from "../market/market-session";
import { quantityLabel, quantitySubLabel, STRATEGY_OPTIONS } from "./field-definitions";
import { checkDarkPoolEligible } from "./rules/dark-pool";
import { availableInstrumentTypes, runDeskAccessCheck } from "./rules/desk-access";
import { runInstrumentSpecCheck } from "./rules/instrument-spec";
import { runKillSwitchCheck } from "./rules/kill-switch";
import { runLimitChecks } from "./rules/limit-checks";
import { checkRoleLocked } from "./rules/role-check";
import { runSessionRules } from "./rules/session-rules";
import { runSpreadCheck } from "./rules/spread-check";
import { runStaticValidation } from "./rules/static-validation";
import { runVenueRules } from "./rules/venue-rules";
import type { Diagnostic, StrategyOption, TicketContext, TicketResolution } from "./ticket-types";

/**
 * Pure, deterministic ticket resolution.
 *
 * Given the same TicketContext, this function always returns the same
 * TicketResolution. It contains zero side-effects and no DOM/React
 * dependencies — run it anywhere (frontend, backend, tests).
 *
 * Performance: this function does O(rules) work, where each rule is O(1).
 * Typical execution: <0.1ms. The caller is responsible for memoizing the
 * TicketContext so this only re-runs when a rule-relevant input changes.
 */
export function resolveTicket(ctx: TicketContext): TicketResolution {
  const { instrument, draft, limits } = ctx;
  const isOptions = instrument.instrumentType === "option";
  const isBond = instrument.instrumentType === "bond";
  const isEquityLike = !isOptions && !isBond;

  // 1. Role lockout — fast exit
  const role = checkRoleLocked(ctx);
  if (role.locked) {
    return buildLockedResolution(ctx, role.message);
  }

  // 2. Collect diagnostics from all rule functions
  const diagnostics: Diagnostic[] = [
    ...runSessionRules(ctx),
    ...runStaticValidation(ctx),
    ...runLimitChecks(ctx),
    ...runKillSwitchCheck(ctx),
    ...runDeskAccessCheck(ctx),
    ...runInstrumentSpecCheck(ctx),
    ...runVenueRules(ctx),
    ...runSpreadCheck(ctx),
  ];

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  // 3. Determine canSubmit
  const canSubmit = errors.length === 0;
  const submitBlockReason = errors.length > 0 ? errors[0].message : null;

  // 4. Strategy options — check both user permissions and session phase
  const strategyOptions: StrategyOption[] = STRATEGY_OPTIONS.map((s) => {
    const permitted = limits.allowed_strategies.includes(s.value);
    const sessionAllowed = isStrategyAllowedInSession(ctx.session, s.value);
    const enabled = permitted && sessionAllowed;
    const reason = !permitted
      ? "Not permitted for your account"
      : !sessionAllowed
        ? `Not available during ${ctx.session.phaseLabel}`
        : undefined;
    return {
      value: s.value,
      label: reason ? `${s.label} (${reason.toLowerCase()})` : s.label,
      enabled,
      disabledReason: reason,
    };
  });

  // 5. Computed values
  const notional =
    draft.quantity > 0 && draft.limitPrice > 0 ? draft.quantity * draft.limitPrice : null;

  const mid = instrument.orderBookMid;
  const arrivalSlippageBps =
    isEquityLike && mid && mid > 0 && draft.limitPrice > 0
      ? ((draft.limitPrice - mid) / mid) * 10_000 * (draft.side === "BUY" ? 1 : -1)
      : null;

  // 6. Dark pool eligibility
  const darkPoolEligible = checkDarkPoolEligible(ctx);

  return {
    canSubmit,
    submitBlockReason,
    roleLocked: false,
    roleLockedMessage: null,
    availableInstrumentTypes: availableInstrumentTypes(limits.allowed_desks ?? ["equity"]),
    strategyOptions,
    showStrategySelector: isEquityLike,
    showLimitPrice: isEquityLike,
    showTradingParams: isEquityLike,
    showAssetSelector: !isBond,
    quantityLabel: quantityLabel(instrument.instrumentType),
    quantitySubLabel: quantitySubLabel(instrument.instrumentType),
    darkPoolEligible,
    marketPhaseLabel: ctx.session.phaseLabel,
    sessionAllowsEntry: ctx.session.allowsOrderEntry,
    notional,
    arrivalSlippageBps,
    diagnostics,
    errors,
    warnings,
  };
}

function buildLockedResolution(ctx: TicketContext, message: string | null): TicketResolution {
  return {
    canSubmit: false,
    submitBlockReason: message,
    roleLocked: true,
    roleLockedMessage: message,
    availableInstrumentTypes: availableInstrumentTypes(ctx.limits.allowed_desks ?? ["equity"]),
    strategyOptions: [],
    showStrategySelector: false,
    showLimitPrice: false,
    showTradingParams: false,
    showAssetSelector: false,
    quantityLabel: "Quantity",
    quantitySubLabel: "(shares)",
    darkPoolEligible: false,
    marketPhaseLabel: ctx.session.phaseLabel,
    sessionAllowsEntry: ctx.session.allowsOrderEntry,
    notional: null,
    arrivalSlippageBps: null,
    diagnostics: [],
    errors: [],
    warnings: [],
  };
}

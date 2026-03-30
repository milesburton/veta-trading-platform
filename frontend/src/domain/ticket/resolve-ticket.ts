import { isStrategyAllowedInSession } from "../market/market-session";
import { quantityLabel, quantitySubLabel, STRATEGY_OPTIONS } from "./field-definitions";
import { FIELD_REGISTRY, FK } from "./field-registry";
import { checkDarkPoolEligible } from "./rules/dark-pool";
import { availableInstrumentTypes, runDeskAccessCheck } from "./rules/desk-access";
import { runInstrumentSpecCheck } from "./rules/instrument-spec";
import { runKillSwitchCheck } from "./rules/kill-switch";
import { runLimitChecks } from "./rules/limit-checks";
import { runPriceCollarCheck } from "./rules/price-collar";
import { checkRoleLocked } from "./rules/role-check";
import { runSessionRules } from "./rules/session-rules";
import { runSpreadCheck } from "./rules/spread-check";
import { runStaticValidation } from "./rules/static-validation";
import { runVenueRules } from "./rules/venue-rules";
import type {
  Diagnostic,
  FieldOrigin,
  ResolvedField,
  StrategyOption,
  TicketContext,
  TicketResolution,
} from "./ticket-types";

/**
 * Pure, deterministic ticket resolution.
 *
 * Given the same TicketContext, always returns the same TicketResolution.
 * Zero side-effects, no DOM/React dependencies — portable to any runtime.
 */
export function resolveTicket(ctx: TicketContext): TicketResolution {
  const { instrument, draft, limits } = ctx;
  const isOptions = instrument.instrumentType === "option";
  const isBond = instrument.instrumentType === "bond";
  const isEquityLike = !isOptions && !isBond;

  const role = checkRoleLocked(ctx);
  if (role.locked) {
    return buildLockedResolution(ctx, role.message);
  }

  const diagnostics: Diagnostic[] = [
    ...runSessionRules(ctx),
    ...runStaticValidation(ctx),
    ...runLimitChecks(ctx),
    ...runKillSwitchCheck(ctx),
    ...runDeskAccessCheck(ctx),
    ...runInstrumentSpecCheck(ctx),
    ...runVenueRules(ctx),
    ...runSpreadCheck(ctx),
    ...runPriceCollarCheck(ctx),
  ];

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  const canSubmit = errors.length === 0;
  const submitBlockReason = errors.length > 0 ? errors[0].message : null;

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

  const notional =
    draft.quantity > 0 && draft.limitPrice > 0 ? draft.quantity * draft.limitPrice : null;

  const mid = instrument.orderBookMid;
  const arrivalSlippageBps =
    isEquityLike && mid && mid > 0 && draft.limitPrice > 0
      ? ((draft.limitPrice - mid) / mid) * 10_000 * (draft.side === "BUY" ? 1 : -1)
      : null;

  const darkPoolEligible = checkDarkPoolEligible(ctx);
  const resolvedFields = buildResolvedFields(ctx, diagnostics, strategyOptions);

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
    resolvedFields,
  };
}

function buildLockedResolution(ctx: TicketContext, message: string | null): TicketResolution {
  const resolvedFields: Record<string, ResolvedField> = {};
  for (const def of FIELD_REGISTRY) {
    resolvedFields[def.key] = {
      key: def.key,
      value: getFieldValue(ctx, def.key),
      visible: false,
      disabled: true,
      required: false,
      errors: [],
      warnings: [],
      origin: "default",
    };
  }

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
    resolvedFields,
  };
}

function getFieldValue(ctx: TicketContext, key: string): unknown {
  switch (key) {
    case FK.SIDE:
      return ctx.draft.side;
    case FK.SYMBOL:
      return ctx.instrument.symbol;
    case FK.QUANTITY:
      return ctx.draft.quantity;
    case FK.LIMIT_PRICE:
      return ctx.draft.limitPrice;
    case FK.STRATEGY:
      return ctx.draft.strategy;
    case FK.VENUE:
      return ctx.selectedVenue ?? null;
    case FK.TIF:
      return ctx.draft.tif;
    case FK.EXPIRES_AT:
      return ctx.draft.expiresAtSecs;
    case FK.OPTION_TYPE:
      return ctx.option.optionType;
    case FK.STRIKE:
      return ctx.option.strike;
    case FK.EXPIRY:
      return ctx.option.expirySecs;
    case FK.BOND_SYMBOL:
      return ctx.bond.symbol;
    case FK.YIELD_PCT:
      return ctx.bond.yieldPct;
    default:
      return undefined;
  }
}

function fieldOrigin(ctx: TicketContext, key: string): FieldOrigin {
  if (ctx.dirtyFields.has(key)) return "user";
  return "default";
}

function buildResolvedFields(
  ctx: TicketContext,
  diagnostics: Diagnostic[],
  strategyOptions: StrategyOption[]
): Record<string, ResolvedField> {
  const { instrument, session } = ctx;
  const isOptions = instrument.instrumentType === "option";
  const isBond = instrument.instrumentType === "bond";
  const isEquityLike = !isOptions && !isBond;
  const entryBlocked = !session.allowsOrderEntry;

  const errorsByField: Record<string, string[]> = {};
  const warningsByField: Record<string, string[]> = {};
  for (const d of diagnostics) {
    const target = d.field === "*" ? "__form__" : d.field;
    if (d.severity === "error") {
      if (!errorsByField[target]) errorsByField[target] = [];
      errorsByField[target].push(d.message);
    } else if (d.severity === "warning") {
      if (!warningsByField[target]) warningsByField[target] = [];
      warningsByField[target].push(d.message);
    }
  }

  const fields: Record<string, ResolvedField> = {};

  for (const def of FIELD_REGISTRY) {
    const visible = resolveFieldVisibility(def.key, isOptions, isBond, isEquityLike);
    const disabled = entryBlocked;
    const required = resolveFieldRequired(def.key, isOptions, isBond, isEquityLike);

    const rf: ResolvedField = {
      key: def.key,
      value: getFieldValue(ctx, def.key),
      visible,
      disabled,
      required,
      errors: errorsByField[def.key] ?? [],
      warnings: warningsByField[def.key] ?? [],
      origin: fieldOrigin(ctx, def.key),
    };

    if (def.key === FK.STRATEGY) {
      rf.options = strategyOptions.map((s) => ({
        value: s.value,
        label: s.label,
        disabled: !s.enabled,
      }));
    }

    if (def.key === FK.TIF) {
      rf.options = [
        { value: "DAY", label: "Day" },
        { value: "GTC", label: "Good Till Cancel" },
        { value: "IOC", label: "Immediate or Cancel" },
        { value: "FOK", label: "Fill or Kill" },
      ];
    }

    fields[def.key] = rf;
  }

  return fields;
}

function resolveFieldVisibility(
  key: string,
  isOptions: boolean,
  isBond: boolean,
  isEquityLike: boolean
): boolean {
  switch (key) {
    case FK.SIDE:
    case FK.QUANTITY:
      return true;

    case FK.LIMIT_PRICE:
    case FK.STRATEGY:
    case FK.TIF:
    case FK.EXPIRES_AT:
      return isEquityLike;

    case FK.SYMBOL:
      return !isBond;

    case FK.VENUE:
      return isEquityLike;

    case FK.OPTION_TYPE:
    case FK.STRIKE:
    case FK.EXPIRY:
      return isOptions;

    case FK.BOND_SYMBOL:
    case FK.YIELD_PCT:
      return isBond;

    default:
      return true;
  }
}

function resolveFieldRequired(
  key: string,
  isOptions: boolean,
  isBond: boolean,
  isEquityLike: boolean
): boolean {
  switch (key) {
    case FK.SIDE:
    case FK.QUANTITY:
      return true;

    case FK.LIMIT_PRICE:
    case FK.EXPIRES_AT:
      return isEquityLike;

    case FK.SYMBOL:
      return !isBond;

    case FK.STRATEGY:
    case FK.TIF:
      return isEquityLike;

    case FK.VENUE:
      return false;

    case FK.STRIKE:
    case FK.EXPIRY:
      return isOptions;

    case FK.BOND_SYMBOL:
      return isBond;

    case FK.YIELD_PCT:
      return false;

    default:
      return false;
  }
}

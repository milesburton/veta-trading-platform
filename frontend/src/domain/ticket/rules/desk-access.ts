import type { InstrumentType } from "../../../types";
import type { Diagnostic, TicketContext } from "../ticket-types";

/** Map instrument type to the desk that handles it. */
export function deriveDesk(
  instrumentType: InstrumentType
): "equity" | "fi" | "derivatives" | "fx" | "commodities" {
  switch (instrumentType) {
    case "bond":
      return "fi";
    case "option":
      return "derivatives";
    case "fx":
      return "fx";
    case "commodity":
      return "commodities";
    default:
      return "equity";
  }
}

export function runDeskAccessCheck(ctx: TicketContext): Diagnostic[] {
  const desk = deriveDesk(ctx.instrument.instrumentType);
  const allowedDesks = ctx.limits.allowed_desks ?? ["equity"];

  if (!allowedDesks.includes(desk)) {
    return [
      {
        field: "*",
        severity: "error",
        message: `Your account does not have access to the ${desk} desk`,
        ruleId: "desk-access-denied",
      },
    ];
  }
  return [];
}

/** Compute which instrument type tabs the user can see. */
export function availableInstrumentTypes(allowedDesks: string[]): InstrumentType[] {
  const types: InstrumentType[] = [];
  if (allowedDesks.includes("equity")) types.push("equity");
  if (allowedDesks.includes("derivatives")) types.push("option");
  if (allowedDesks.includes("fi")) types.push("bond");
  if (allowedDesks.includes("fx")) types.push("fx");
  if (allowedDesks.includes("commodities")) types.push("commodity");
  return types;
}

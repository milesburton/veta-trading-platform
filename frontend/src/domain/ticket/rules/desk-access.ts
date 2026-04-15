import type { Desk, InstrumentType } from "../../../types";
import type { Diagnostic, TicketContext } from "../ticket-types";

export function deriveDesk(instrumentType: InstrumentType): Desk {
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

export function availableInstrumentTypes(allowedDesks: string[]): InstrumentType[] {
  const types: InstrumentType[] = [];
  if (allowedDesks.includes("equity")) types.push("equity");
  if (allowedDesks.includes("derivatives")) types.push("option");
  if (allowedDesks.includes("fi")) types.push("bond");
  if (allowedDesks.includes("fx")) types.push("fx");
  if (allowedDesks.includes("commodities")) types.push("commodity");
  return types;
}

import type { Middleware } from "@reduxjs/toolkit";
import { alertAdded } from "../alertsSlice.ts";
import { allBlocksCleared, blockAdded } from "../killSwitchSlice.ts";
import { orderPatched } from "../ordersSlice.ts";

export const alertsMiddleware: Middleware = (storeAPI) => {
  if (typeof window !== "undefined") {
    window.addEventListener("workspace-save-error", () => {
      storeAPI.dispatch(
        alertAdded({
          severity: "INFO",
          source: "workspace",
          message: "Workspace save failed — your layout changes may not have been persisted.",
          ts: Date.now(),
        })
      );
    });
  }

  return (next) => (action) => {
    const result = next(action);

    if (blockAdded.match(action)) {
      const b = action.payload;
      const scopeDetail =
        b.scope === "all"
          ? "all orders halted"
          : b.scope === "user"
            ? "user trading halted"
            : `${b.scope}: ${b.scopeValues.join(", ")}`;
      storeAPI.dispatch(
        alertAdded({
          severity: "CRITICAL",
          source: "kill-switch",
          message: `Kill switch activated — ${scopeDetail}`,
          detail: `Issued by ${b.issuedBy}`,
          ts: b.issuedAt,
        })
      );
    }

    if (allBlocksCleared.match(action)) {
      storeAPI.dispatch(
        alertAdded({
          severity: "INFO",
          source: "kill-switch",
          message: "Kill switch cleared — trading resumed",
          ts: Date.now(),
        })
      );
    }

    if (orderPatched.match(action) && action.payload.patch.status === "rejected") {
      storeAPI.dispatch(
        alertAdded({
          severity: "WARNING",
          source: "order",
          message: `Order rejected: ${action.payload.id}`,
          ts: Date.now(),
        })
      );
    }

    return result;
  };
};

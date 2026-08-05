import { STORAGE_KEY } from "@veta/frontend/components/dashboard/layoutModels.ts";
import {
  type QuickTradeIntent,
  QuickTradeIntentSchema,
} from "@veta/frontend/domain/quickTrade/parse.ts";
import type { WindowSize } from "@veta/frontend/store/uiSlice.ts";
import type { OrderRecord } from "@veta/frontend/types.ts";

const DEFAULT_SIZE: WindowSize = { w: 480, h: 780 };

/**
 * Build a new-order draft from a blotter row; this never mutates the source order.
 * Each optional field is checked against QuickTradeIntentSchema's own bounds and
 * dropped individually if out of range, rather than letting one bad field (e.g. a
 * TWAP order with more slices than the ticket's duration field can express) fail
 * the schema's strict `.parse()` on the receiving end and silently discard the
 * whole prefill.
 */
export function orderToTicketPrefill(order: OrderRecord): QuickTradeIntent {
  const shape = QuickTradeIntentSchema.shape;
  const prefill: QuickTradeIntent = {
    side: order.side,
    symbol: order.asset,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    strategy: order.strategy,
  };

  if (!shape.quantity.safeParse(prefill.quantity).success) prefill.quantity = undefined;
  if (!shape.limitPrice.safeParse(prefill.limitPrice).success) prefill.limitPrice = undefined;

  if (order.timeInForce && order.timeInForce !== "GTD") {
    if (shape.tif.safeParse(order.timeInForce).success) prefill.tif = order.timeInForce;
  }

  if (order.algoParams.strategy === "TWAP") {
    // The ticket expresses TWAP duration as three minutes per slice.
    const minutes = order.algoParams.numSlices * 3;
    if (shape.twapDurationMinutes.safeParse(minutes).success) prefill.twapDurationMinutes = minutes;
  } else if (order.algoParams.strategy === "POV") {
    const rate = order.algoParams.participationRate;
    if (shape.povRatePercent.safeParse(rate).success) prefill.povRatePercent = rate;
  } else if (order.algoParams.strategy === "ICEBERG") {
    const qty = order.algoParams.visibleQty;
    if (shape.icebergVisibleQty.safeParse(qty).success) prefill.icebergVisibleQty = qty;
  }

  return prefill;
}

export function openOrderTicketWindow(
  size: WindowSize = DEFAULT_SIZE,
  prefill?: QuickTradeIntent
): void {
  const params = new URLSearchParams({
    panel: "order-ticket",
    type: "order-ticket",
    layout: STORAGE_KEY,
  });
  if (prefill) {
    params.set("prefill", encodeURIComponent(JSON.stringify(prefill)));
  }
  globalThis.open(
    `${globalThis.location.origin}${globalThis.location.pathname}?${params}`,
    "order-ticket",
    `width=${size.w},height=${size.h},resizable=yes`
  );
}

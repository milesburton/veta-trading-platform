import { STORAGE_KEY } from "@veta/frontend/components/dashboard/layoutModels.ts";
import type { QuickTradeIntent } from "@veta/frontend/domain/quickTrade/parse.ts";
import type { WindowSize } from "@veta/frontend/store/uiSlice.ts";
import type { OrderRecord } from "@veta/frontend/types.ts";

const DEFAULT_SIZE: WindowSize = { w: 480, h: 780 };

/** Build a new-order draft from a blotter row; this never mutates the source order. */
export function orderToTicketPrefill(order: OrderRecord): QuickTradeIntent {
  const prefill: QuickTradeIntent = {
    side: order.side,
    symbol: order.asset,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    strategy: order.strategy,
  };

  if (order.timeInForce && order.timeInForce !== "GTD") prefill.tif = order.timeInForce;
  if (order.algoParams.strategy === "TWAP") {
    // The ticket expresses TWAP duration as three minutes per slice.
    prefill.twapDurationMinutes = order.algoParams.numSlices * 3;
  } else if (order.algoParams.strategy === "POV") {
    prefill.povRatePercent = order.algoParams.participationRate;
  } else if (order.algoParams.strategy === "ICEBERG") {
    prefill.icebergVisibleQty = order.algoParams.visibleQty;
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

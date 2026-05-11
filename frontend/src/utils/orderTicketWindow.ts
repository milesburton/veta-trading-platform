import { STORAGE_KEY } from "../components/dashboard/layoutModels.ts";
import type { QuickTradeIntent } from "../domain/quickTrade/parse.ts";
import type { WindowSize } from "../store/uiSlice.ts";

const DEFAULT_SIZE: WindowSize = { w: 480, h: 780 };

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
  window.open(
    `${window.location.origin}${window.location.pathname}?${params}`,
    "order-ticket",
    `width=${size.w},height=${size.h},resizable=yes`
  );
}

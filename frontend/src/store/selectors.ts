import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "./index.ts";

export const selectSymbols = createSelector(
  (s: RootState) => s.market.assets,
  (assets) => assets.map((a) => a.symbol),
);

export const selectSeenUsers = createSelector(
  (s: RootState) => s.orders.orders,
  (orders) => [
    ...new Set(
      orders
        .map((order) => order.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ],
);

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "./index.ts";

export const selectSymbols = createSelector(
  (s: RootState) => s.market.assets,
  (assets) => assets.map((a) => a.symbol)
);

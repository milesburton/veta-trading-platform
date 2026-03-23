import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type FeedSource = "market" | "orders" | "algo" | "news";

export interface FeedState {
  lastSeenAt: Record<FeedSource, number | null>;
}

const initialState: FeedState = {
  lastSeenAt: {
    market: null,
    orders: null,
    algo: null,
    news: null,
  },
};

export const feedSlice = createSlice({
  name: "feed",
  initialState,
  reducers: {
    feedReceived(state, action: PayloadAction<FeedSource>) {
      state.lastSeenAt[action.payload] = Date.now();
    },
  },
});

export const { feedReceived } = feedSlice.actions;

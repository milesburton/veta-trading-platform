import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { isSafeKey } from "./safeKey.ts";

export interface FeatureVector {
  symbol: string;
  ts: number;
  momentum: number;
  relativeVolume: number;
  realisedVol: number;
  sectorRelativeStrength: number;
  eventScore: number;
  newsVelocity: number;
  sentimentDelta: number;
}

export interface SignalFactor {
  name: string;
  weight: number;
  contribution: number;
}

export interface Signal {
  symbol: string;
  score: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  factors: SignalFactor[];
  ts: number;
}

export interface TradeRecommendation {
  symbol: string;
  action: "buy" | "sell" | "hold";
  suggestedQty: number;
  rationale: string;
  signalScore: number;
  confidence: number;
  ts: number;
}

interface IntelligenceState {
  signals: Record<string, Signal>;
  features: Record<string, FeatureVector>;
  recommendations: TradeRecommendation[];
}

const initialState: IntelligenceState = {
  signals: {},
  features: {},
  recommendations: [],
};

export const intelligenceSlice = createSlice({
  name: "intelligence",
  initialState,
  reducers: {
    signalReceived(state, action: PayloadAction<Signal>) {
      if (!isSafeKey(action.payload.symbol)) return;
      state.signals[action.payload.symbol] = action.payload;
    },
    featureReceived(state, action: PayloadAction<FeatureVector>) {
      if (!isSafeKey(action.payload.symbol)) return;
      state.features[action.payload.symbol] = action.payload;
    },
    recommendationReceived(state, action: PayloadAction<TradeRecommendation>) {
      state.recommendations.unshift(action.payload);
      if (state.recommendations.length > 100) {
        state.recommendations.length = 100;
      }
    },
    signalsBatchReceived(state, action: PayloadAction<Signal[]>) {
      for (const sig of action.payload) {
        if (!isSafeKey(sig.symbol)) continue;
        state.signals[sig.symbol] = sig;
      }
    },
    featuresBatchReceived(state, action: PayloadAction<FeatureVector[]>) {
      for (const fv of action.payload) {
        if (!isSafeKey(fv.symbol)) continue;
        state.features[fv.symbol] = fv;
      }
    },
  },
});

export const {
  signalReceived,
  featureReceived,
  recommendationReceived,
  signalsBatchReceived,
  featuresBatchReceived,
} = intelligenceSlice.actions;

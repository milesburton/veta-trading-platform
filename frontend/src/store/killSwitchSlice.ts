import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { KillScope } from "./ordersSlice.ts";

export interface KillBlock {
  id: string;
  scope: KillScope;
  scopeValues: string[];
  targetUserId?: string;
  issuedBy: string;
  issuedAt: number;
  resumeAt?: number;
  fromGateway?: boolean;
}

interface KillSwitchState {
  blocks: KillBlock[];
}

const initialState: KillSwitchState = { blocks: [] };

export const killSwitchSlice = createSlice({
  name: "killSwitch",
  initialState,
  reducers: {
    blockAdded(state, action: PayloadAction<KillBlock>) {
      state.blocks.push(action.payload);
    },
    blockRemoved(state, action: PayloadAction<{ id: string }>) {
      state.blocks = state.blocks.filter((b) => b.id !== action.payload.id);
    },
    allBlocksCleared(state) {
      state.blocks = [];
    },
  },
});

export const { blockAdded, blockRemoved, allBlocksCleared } = killSwitchSlice.actions;

export function isOrderBlocked(
  blocks: KillBlock[],
  order: { asset?: string; strategy?: string; userId?: string }
): boolean {
  for (const block of blocks) {
    if (block.resumeAt && block.resumeAt <= Date.now()) continue;
    switch (block.scope) {
      case "all":
        return true;
      case "user":
        if (block.targetUserId ? order.userId === block.targetUserId : true) {
          return true;
        }
        break;
      case "algo":
        if (block.scopeValues.includes(order.strategy ?? "")) return true;
        break;
      case "symbol":
        if (block.scopeValues.includes(order.asset ?? "")) return true;
        break;
      case "market":
        if (block.scopeValues.some((v) => (order.asset ?? "").startsWith(v) || v === "*")) {
          return true;
        }
        break;
    }
  }
  return false;
}

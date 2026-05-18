import type { PanelId } from "@veta/frontend/components/DashboardLayout.tsx";
import type { ChannelNumber } from "@veta/frontend/store/channelsSlice.ts";
import { createContext, useContext } from "react";

export interface ChannelContextValue {
  instanceId: string;
  panelType: PanelId;
  outgoing: ChannelNumber | null;
  incoming: ChannelNumber | null;
}

const DEFAULT: ChannelContextValue = {
  instanceId: "unknown",
  panelType: "market-ladder",
  outgoing: null,
  incoming: null,
};

export const ChannelContext = createContext<ChannelContextValue>(DEFAULT);

export function useChannelContext(): ChannelContextValue {
  return useContext(ChannelContext);
}

import type { Decorator } from "@storybook/react";
import React from "react";
import { Provider } from "react-redux";
import { TradingProvider } from "../context/TradingContext.tsx";
import { ChannelContext } from "../contexts/ChannelContext.tsx";
import type { StoryPreloadedState } from "./storyStore.ts";
import { storyStore } from "./storyStore.ts";

interface StoryProvidersProps {
  preloaded?: StoryPreloadedState;
  children: React.ReactNode;
}

/** Default channel context value — no outgoing or incoming channel. */
const DEFAULT_CHANNEL = {
  instanceId: "story",
  panelType: "market-ladder" as const,
  outgoing: null as null,
  incoming: null as null,
};

/**
 * Wraps children with all required React providers for stories.
 */
export function StoryProviders({ preloaded, children }: StoryProvidersProps) {
  const store = React.useMemo(() => storyStore(preloaded ?? {}), [preloaded]);
  return (
    <Provider store={store}>
      <ChannelContext.Provider value={DEFAULT_CHANNEL}>
        <TradingProvider>{children}</TradingProvider>
      </ChannelContext.Provider>
    </Provider>
  );
}

/**
 * Returns a Storybook decorator that wraps each story with StoryProviders.
 */
export function withStoreDecorator(preloaded?: StoryPreloadedState): Decorator {
  return (Story) => (
    <StoryProviders preloaded={preloaded}>
      <Story />
    </StoryProviders>
  );
}

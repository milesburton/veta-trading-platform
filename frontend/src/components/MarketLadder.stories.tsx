import type { Meta, StoryObj } from "@storybook/react";
import {
  MOCK_ASSETS,
  MOCK_PRICE_HISTORY,
  MOCK_PRICES,
  MOCK_SESSION_OPEN,
} from "../stories/mockData.ts";
import { defaultHandlers } from "../stories/mswHandlers.ts";
import { withStoreDecorator } from "../stories/StoryProviders.tsx";
import { MarketLadder } from "./MarketLadder";

const meta: Meta<typeof MarketLadder> = {
  title: "Panels/MarketLadder",
  component: MarketLadder,
  parameters: {
    msw: { handlers: defaultHandlers },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof MarketLadder>;

const baseMarketState = {
  assets: MOCK_ASSETS,
  prices: MOCK_PRICES,
  priceHistory: MOCK_PRICE_HISTORY,
  sessionOpen: MOCK_SESSION_OPEN,
  candleHistory: {},
  candlesReady: {},
  connected: true,
  orderBook: {},
};

export const Default: Story = {
  decorators: [
    withStoreDecorator({
      market: baseMarketState,
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ height: "600px", width: "400px" }}>
        <MarketLadder />
      </div>
    </div>
  ),
};

export const WithSelectedAsset: Story = {
  decorators: [
    withStoreDecorator({
      market: {
        ...baseMarketState,
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ height: "600px", width: "400px" }}>
        <MarketLadder />
      </div>
    </div>
  ),
};

export const MultiAssetClass: Story = {
  decorators: [
    withStoreDecorator({
      market: {
        assets: MOCK_ASSETS,
        prices: MOCK_PRICES,
        priceHistory: MOCK_PRICE_HISTORY,
        sessionOpen: MOCK_SESSION_OPEN,
        candleHistory: {},
        candlesReady: {},
        connected: true,
        orderBook: {},
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ height: "700px", width: "420px" }}>
        <MarketLadder />
      </div>
    </div>
  ),
};

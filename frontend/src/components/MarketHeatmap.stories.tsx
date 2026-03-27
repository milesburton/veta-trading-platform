import type { Meta, StoryObj } from "@storybook/react";
import { MOCK_ASSETS, MOCK_PRICES, MOCK_SESSION_OPEN } from "../stories/mockData.ts";
import { defaultHandlers } from "../stories/mswHandlers.ts";
import { withStoreDecorator } from "../stories/StoryProviders.tsx";
import { MarketHeatmap } from "./MarketHeatmap";

const meta: Meta<typeof MarketHeatmap> = {
  title: "Panels/MarketHeatmap",
  component: MarketHeatmap,
  parameters: {
    msw: { handlers: defaultHandlers },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof MarketHeatmap>;

export const Default: Story = {
  decorators: [
    withStoreDecorator({
      market: {
        assets: MOCK_ASSETS,
        prices: MOCK_PRICES,
        priceHistory: {},
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
      <MarketHeatmap />
    </div>
  ),
};

export const AllFx: Story = {
  decorators: [
    withStoreDecorator({
      market: {
        assets: MOCK_ASSETS.filter((a) => a.assetClass === "fx"),
        prices: {
          "EUR/USD": 1.0862,
          "GBP/USD": 1.2705,
        },
        priceHistory: {},
        sessionOpen: {
          "EUR/USD": 1.085,
          "GBP/USD": 1.268,
        },
        candleHistory: {},
        candlesReady: {},
        connected: true,
        orderBook: {},
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <MarketHeatmap />
    </div>
  ),
};

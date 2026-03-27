import type { Meta, StoryObj } from "@storybook/react";
import {
  MOCK_ASSETS,
  MOCK_LIMITS,
  MOCK_LIMITS_FX,
  MOCK_LIMITS_TIGHT,
  MOCK_PRICE_HISTORY,
  MOCK_PRICES,
  MOCK_SESSION_OPEN,
} from "../stories/mockData.ts";
import { defaultHandlers } from "../stories/mswHandlers.ts";
import { withStoreDecorator } from "../stories/StoryProviders.tsx";
import { OrderTicket } from "./OrderTicket";

const meta: Meta<typeof OrderTicket> = {
  title: "Panels/OrderTicket",
  component: OrderTicket,
  parameters: {
    msw: { handlers: defaultHandlers },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof OrderTicket>;

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

export const EquityTrader: Story = {
  decorators: [
    withStoreDecorator({
      market: baseMarketState,
      auth: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader",
          avatar_emoji: "👩‍💼",
        },
        limits: MOCK_LIMITS,
        status: "authenticated",
      },
      ui: {
        activeStrategy: "LIMIT",
        activeSide: "BUY",
        showShortcuts: false,
        selectedAsset: "AAPL",
        updateAvailable: false,
        optionPrefill: null,
        orderTicketOpen: false,
      },
      killSwitch: { blocks: [] },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ width: "360px", height: "700px" }}>
        <OrderTicket />
      </div>
    </div>
  ),
};

export const FxTrader: Story = {
  decorators: [
    withStoreDecorator({
      market: baseMarketState,
      auth: {
        user: {
          id: "carol",
          name: "Carol Davis",
          role: "trader",
          avatar_emoji: "👩‍💻",
        },
        limits: MOCK_LIMITS_FX,
        status: "authenticated",
      },
      ui: {
        activeStrategy: "LIMIT",
        activeSide: "BUY",
        showShortcuts: false,
        selectedAsset: "EUR/USD",
        updateAvailable: false,
        optionPrefill: null,
        orderTicketOpen: false,
      },
      killSwitch: { blocks: [] },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ width: "360px", height: "700px" }}>
        <OrderTicket />
      </div>
    </div>
  ),
};

export const WithLimitWarning: Story = {
  decorators: [
    withStoreDecorator({
      market: baseMarketState,
      auth: {
        user: {
          id: "restricted",
          name: "Restricted User",
          role: "trader",
          avatar_emoji: "🧑",
        },
        limits: MOCK_LIMITS_TIGHT,
        status: "authenticated",
      },
      ui: {
        activeStrategy: "LIMIT",
        activeSide: "BUY",
        showShortcuts: false,
        selectedAsset: "AAPL",
        updateAvailable: false,
        optionPrefill: null,
        orderTicketOpen: false,
      },
      killSwitch: { blocks: [] },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <div style={{ width: "360px", height: "700px" }}>
        <OrderTicket />
      </div>
    </div>
  ),
};

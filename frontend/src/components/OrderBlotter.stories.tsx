import type { Meta, StoryObj } from "@storybook/react";
import { HttpResponse, http } from "msw";
import { MOCK_ORDERS } from "../stories/mockData.ts";
import { defaultHandlers } from "../stories/mswHandlers.ts";
import { withStoreDecorator } from "../stories/StoryProviders.tsx";
import type { OrderRecord } from "../types.ts";
import { OrderBlotter } from "./OrderBlotter";

const meta: Meta<typeof OrderBlotter> = {
  title: "Panels/OrderBlotter",
  component: OrderBlotter,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof OrderBlotter>;

function makeGridHandler(orders: OrderRecord[]) {
  return http.post("/api/gateway/grid/query", () => {
    return HttpResponse.json({ rows: orders, total: orders.length, evalMs: 1 });
  });
}

export const AllStatuses: Story = {
  parameters: {
    msw: { handlers: [makeGridHandler(MOCK_ORDERS), ...defaultHandlers] },
  },
  decorators: [
    withStoreDecorator({
      auth: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader",
          avatar_emoji: "👩‍💼",
        },
        status: "authenticated",
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <OrderBlotter />
    </div>
  ),
};

export const Empty: Story = {
  parameters: {
    msw: { handlers: [makeGridHandler([]), ...defaultHandlers] },
  },
  decorators: [
    withStoreDecorator({
      auth: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader",
          avatar_emoji: "👩‍💼",
        },
        status: "authenticated",
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <OrderBlotter />
    </div>
  ),
};

// Generate 25 orders for high-volume story
const MANY_ORDERS: OrderRecord[] = Array.from({ length: 25 }, (_, i) => {
  const statuses: OrderRecord["status"][] = [
    "pending",
    "working",
    "filled",
    "expired",
    "rejected",
    "cancelled",
  ];
  const assets = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "JPM"];
  const strategies = ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG"] as const;
  const now = Date.now();
  return {
    id: `ord-hv-${String(i).padStart(4, "0")}`,
    submittedAt: now - i * 15_000,
    asset: assets[i % assets.length],
    side: i % 2 === 0 ? "BUY" : "SELL",
    quantity: 100 + i * 50,
    limitPrice: 100 + i * 10,
    expiresAt: now + 3600_000,
    strategy: strategies[i % strategies.length],
    status: statuses[i % statuses.length],
    filled: i % 3 === 0 ? 100 + i * 50 : 0,
    algoParams: {
      strategy: strategies[i % strategies.length],
      limitPrice: 100 + i * 10,
      expiresAt: 3600,
    },
    children: [],
    userId: i % 3 === 0 ? "alice" : "bob",
  } as OrderRecord;
});

export const HighVolume: Story = {
  parameters: {
    msw: { handlers: [makeGridHandler(MANY_ORDERS), ...defaultHandlers] },
  },
  decorators: [
    withStoreDecorator({
      auth: {
        user: {
          id: "alice",
          name: "Alice Chen",
          role: "trader",
          avatar_emoji: "👩‍💼",
        },
        status: "authenticated",
      },
    }),
  ],
  render: () => (
    <div className="h-screen bg-gray-900">
      <OrderBlotter />
    </div>
  ),
};

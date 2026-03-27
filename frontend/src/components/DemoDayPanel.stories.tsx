import type { Meta, StoryObj } from "@storybook/react";
import { HttpResponse, http } from "msw";
import { defaultHandlers } from "../stories/mswHandlers.ts";
import { withStoreDecorator } from "../stories/StoryProviders.tsx";
import { DemoDayPanel } from "./DemoDayPanel";

const meta: Meta<typeof DemoDayPanel> = {
  title: "Panels/DemoDayPanel",
  component: DemoDayPanel,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof DemoDayPanel>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("/api/gateway/demo-day", () => {
          return HttpResponse.json({
            submitted: 42,
            scenario: "standard",
            elapsedMs: 350,
          });
        }),
        ...defaultHandlers,
      ],
    },
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
      <div style={{ width: "400px", height: "700px" }}>
        <DemoDayPanel />
      </div>
    </div>
  ),
};

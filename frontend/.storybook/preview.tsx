import type { Preview } from "@storybook/react";
import { initialize, mswLoader } from "msw-storybook-addon";
import "../src/index.css";

initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#03070e" }],
    },
    layout: "fullscreen",
  },
};

export default preview;

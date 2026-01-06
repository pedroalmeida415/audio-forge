import type { Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { sb } from "storybook/test";
import "../src/styles/globals.css";

sb.mock(import("../src/trpc/react.tsx"));

// Initialize MSW - no default handlers, stories define their own
initialize({ onUnhandledRequest: "bypass" });

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "off",
    },
  },
  loaders: [mswLoader],
};

export default preview;

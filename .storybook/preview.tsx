import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { sb } from "storybook/test";
import "../src/styles/globals.css";
import { procedureSpy, TRPCReactProvider } from "../src/trpc/react";

sb.mock(import("../src/trpc/react.tsx"));

// Initialize MSW - no default handlers, stories define their own
initialize({ onUnhandledRequest: "bypass" });

// Global decorator to provide tRPC context to all stories
const withTRPC: Decorator = (Story) => (
  <TRPCReactProvider>
    <Story />
  </TRPCReactProvider>
);

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
  decorators: [withTRPC],
  loaders: [mswLoader],
  beforeEach: () => {
    // Reset procedure spy before each story
    procedureSpy.reset();
  },
};

export default preview;

import type { Preview } from "@storybook/nextjs-vite";
import { withTRPC } from "../src/test/storybook/decorators";

// Import global CSS for Tailwind
import "../src/styles/globals.css";

// Set Storybook flag for mock context
if (typeof globalThis !== "undefined") {
  // @ts-expect-error - Setting flag for mock context detection
  globalThis.__STORYBOOK__ = true;
}
process.env.STORYBOOK = "true";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },

  // Apply TRPC provider to all stories
  decorators: [withTRPC],
};

export default preview;

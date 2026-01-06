import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { IBM_Plex_Sans, Syne } from "next/font/google";
import { sb } from "storybook/test";
import "../src/styles/globals.css";
import { procedureSpy, TRPCReactProvider } from "../src/trpc/react";

sb.mock(import("../src/trpc/react.tsx"));

// Initialize MSW - no default handlers, stories define their own
initialize({ onUnhandledRequest: "bypass" });

// Load fonts (same as app layout)
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

// Global decorator to provide tRPC context and app styling to all stories
const withAppShell: Decorator = (Story) => (
  <TRPCReactProvider>
    <div className={`${syne.variable} ${ibmPlexSans.variable} min-h-screen bg-background bg-studio-grid`}>
      <div className="pointer-events-none fixed inset-0 bg-gradient-mesh" />
      <Story />
    </div>
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
  decorators: [withAppShell],
  loaders: [mswLoader],
  beforeEach: () => {
    // Reset procedure spy before each story
    procedureSpy.reset();
  },
};

export default preview;

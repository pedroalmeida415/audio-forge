/**
 * Storybook decorators for providing context to stories.
 */
import type { Decorator } from "@storybook/nextjs-vite";
import { TRPCReactProvider } from "~/trpc/react";

/**
 * Provides the TRPC React context to stories.
 * This enables tRPC hooks to work within stories.
 */
export const withTRPC: Decorator = (Story) => (
  <TRPCReactProvider>
    <Story />
  </TRPCReactProvider>
);

/**
 * Provides a basic page layout wrapper.
 * Useful for component stories that need some layout context.
 */
export const withPageLayout: Decorator = (Story) => (
  <div className="min-h-screen bg-background text-foreground">
    <Story />
  </div>
);

/**
 * Combined decorator for full app context.
 */
export const withAppProviders: Decorator = (Story) => (
  <TRPCReactProvider>
    <div className="min-h-screen bg-background text-foreground">
      <Story />
    </div>
  </TRPCReactProvider>
);

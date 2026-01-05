import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockStorePath = resolve(
  __dirname,
  "../src/stories/timeline/store.context.tsx",
);

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    // Redirect clipping workspace imports to mocks
    config.plugins = config.plugins || [];
    config.plugins.unshift({
      name: "storybook-mock-imports",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer) return null;

        // Redirect store.context imports from clipping workspace
        if (
          source.endsWith("store.context") ||
          source.endsWith("store.context.tsx")
        ) {
          if (
            importer.includes("clipping") &&
            importer.includes("[sessionId]")
          ) {
            return mockStorePath;
          }
        }

        // Redirect ~/trpc/react to mock (exports `api`)
        if (source === "~/trpc/react") {
          return mockStorePath;
        }

        return null;
      },
    });

    // Pre-optimize dependencies to avoid test flakiness
    config.optimizeDeps = config.optimizeDeps || {};
    config.optimizeDeps.include = [
      ...(config.optimizeDeps.include || []),
      "@trpc/client",
      "superjson",
      "@legendapp/state",
      "@legendapp/state/react",
      "@tanstack/react-query",
    ];

    return config;
  },
};

export default config;

import type { Preview } from "@storybook/nextjs-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import { handlers } from "../src/test/msw/handlers";
import { withTRPC } from "../src/test/storybook/decorators";

// Import global CSS for Tailwind
import "../src/styles/globals.css";

// Initialize MSW with default handlers
initialize({
	onUnhandledRequest: "bypass", // Don't warn for unhandled requests (e.g., static assets)
});

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		// Default MSW handlers for all stories
		msw: {
			handlers,
		},
	},

	// Load MSW before each story
	loaders: [mswLoader],

	// Apply TRPC provider to all stories
	decorators: [withTRPC],
};

export default preview;

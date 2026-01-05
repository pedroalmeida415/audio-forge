import type { Preview } from "@storybook/nextjs-vite";
import "../src/styles/globals.css";

// ============================================================================
// Mock media-proxy endpoint for audio playback testing
// ============================================================================

let testAudioData: ArrayBuffer | null = null;

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  // Intercept media-proxy requests and return test audio
  if (url.includes("/api/media-proxy")) {
    // Lazy load test audio on first request
    if (!testAudioData) {
      const response = await originalFetch("/test-audio.m4a");
      testAudioData = await response.arrayBuffer();
    }
    return new Response(testAudioData, {
      status: 200,
      headers: { "Content-Type": "audio/mp4" },
    });
  }

  return originalFetch(input, init);
};

// ============================================================================
// Storybook Preview Config
// ============================================================================

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
};

export default preview;

import { createFileRoute } from "@tanstack/react-router";

// __BUILD_ID__ is injected at build time by Vite `define` (see vite.config.ts).
// It changes on every new build/deploy, so this endpoint returns a unique
// identifier for the currently deployed version.
const VERSION = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ version: VERSION }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            pragma: "no-cache",
          },
        });
      },
    },
  },
});

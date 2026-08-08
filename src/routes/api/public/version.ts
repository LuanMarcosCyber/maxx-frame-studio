import { createFileRoute } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/app-version";

// __BUILD_ID__ is injected at build time by Vite `define` (see vite.config.ts).
// It changes on every new build/deploy.
const BUILD = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ version: APP_VERSION, build: BUILD }), {
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

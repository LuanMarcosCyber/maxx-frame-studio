import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/operadores")({
  beforeLoad: () => {
    throw redirect({ to: "/usuarios", replace: true });
  },
});

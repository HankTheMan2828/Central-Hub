/* ------------------------------------------------------------------ */
/*  Global AI backend route: PI (OpenRouter) vs Grok Build CLI.       */
/*  Default is PI so existing installs behave unchanged.              */
/* ------------------------------------------------------------------ */

export type AiRoute = "pi" | "grok-build";

export const AI_ROUTE_KEY = "centralhub-ai-route";
export const AI_ROUTE_CHANGED_EVENT = "centralhub:ai-route-changed";

export function isAiRoute(value: unknown): value is AiRoute {
  return value === "pi" || value === "grok-build";
}

export function loadAiRoute(): AiRoute {
  if (typeof window === "undefined") return "pi";
  try {
    const raw = window.localStorage.getItem(AI_ROUTE_KEY);
    if (isAiRoute(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "pi";
}

export function saveAiRoute(route: AiRoute): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_ROUTE_KEY, route);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(AI_ROUTE_CHANGED_EVENT, { detail: { route } })
    );
  } catch {
    /* ignore */
  }
}

export function aiRouteLabel(route: AiRoute): string {
  switch (route) {
    case "grok-build":
      return "Grok Build (SuperGrok)";
    default:
      return "PI (OpenRouter)";
  }
}

"use client";

import { useEffect, useState } from "react";
import {
  AI_ROUTE_CHANGED_EVENT,
  loadAiRoute,
  type AiRoute,
} from "@/lib/aiRoute";
import { usePiChat, type UsePiChatOptions } from "@/hooks/usePiChat";
import { useGrokChat } from "@/hooks/useGrokChat";

export type UseAiChatOptions = UsePiChatOptions & {
  /** Working directory for Grok coding sessions (ignored on PI). */
  cwd?: string;
  /**
   * Force a route (tests / special panels). Default: live global route
   * from localStorage + `centralhub:ai-route-changed`.
   */
  route?: AiRoute;
};

function useLiveAiRoute(forced?: AiRoute): AiRoute {
  // Always start with the same default on server + first client paint.
  // Reading localStorage in useState() causes hydration mismatches
  // ("Connecting to PI…" vs "Connecting to Grok 4.5…").
  const [route, setRoute] = useState<AiRoute>(() => forced ?? "pi");

  useEffect(() => {
    if (forced) {
      setRoute(forced);
      return;
    }
    const sync = () => setRoute(loadAiRoute());
    sync();
    window.addEventListener(AI_ROUTE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AI_ROUTE_CHANGED_EVENT, sync);
  }, [forced]);

  return forced ?? route;
}

/**
 * Backend-switching chat hook. Both backends are mounted; the inactive
 * one is `disabled` so hooks stay unconditional (Rules of Hooks).
 */
export function useAiChat(options?: UseAiChatOptions) {
  const route = useLiveAiRoute(options?.route);
  const disabled = options?.disabled ?? false;

  const pi = usePiChat({
    existingSessionId: options?.existingSessionId,
    sessionType: options?.sessionType,
    disabled: disabled || route !== "pi",
  });

  const grok = useGrokChat({
    existingSessionId: options?.existingSessionId,
    sessionType: options?.sessionType,
    cwd: options?.cwd,
    disabled: disabled || route !== "grok-build",
  });

  return route === "grok-build" ? grok : pi;
}

export function useAiRouteValue(): AiRoute {
  return useLiveAiRoute();
}

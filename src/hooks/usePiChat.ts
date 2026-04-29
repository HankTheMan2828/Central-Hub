"use client";

import { useState, useCallback, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolResult?: string;
  isToolError?: boolean;
  timestamp: number;
  isStreaming?: boolean;
}

export interface PiModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
  input: string[];
}

export interface CurrentModel {
  id: string;
  name: string;
  provider: string;
}

export interface SessionStatsData {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

export interface ContextUsageData {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

/* ------------------------------------------------------------------ */
/*  IPC helper                                                        */
/* ------------------------------------------------------------------ */
function getIpc() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron");
    return {
      invoke: (channel: string, ...args: any[]) => electron.ipcRenderer.invoke(channel, ...args),
      on: (channel: string, fn: (...args: any[]) => void) => electron.ipcRenderer.on(channel, fn),
      removeAllListeners: (channel: string) => electron.ipcRenderer.removeAllListeners(channel),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Apply a snapshot returned by pi:init / pi:set-api-key / etc.      */
/* ------------------------------------------------------------------ */
interface Snapshot {
  models: PiModel[];
  currentModel: CurrentModel | null;
  providers: Record<string, boolean>;
}

function applySnapshot(
  snap: Snapshot,
  setModels: (v: PiModel[]) => void,
  setCurrentModel: (v: CurrentModel | null) => void,
  setAuthProviders: (v: Record<string, boolean>) => void,
) {
  setModels(snap.models ?? []);
  setCurrentModel(snap.currentModel ?? null);
  setAuthProviders(snap.providers ?? {});
}

/* ------------------------------------------------------------------ */
/*  localStorage model prefs helpers                                  */
/* ------------------------------------------------------------------ */
interface ModelPrefs {
  favorites: string[];
  blocked: string[];
}

const PREFS_KEY = "centralhub-model-prefs";

function loadPrefs(): ModelPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        favorites: parsed.favorites ?? [],
        blocked: parsed.blocked ?? [],
      };
    }
  } catch (_) {}
  return { favorites: [], blocked: [] };
}

function savePrefs(favorites: string[], blocked: string[]) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ favorites, blocked }));
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */
export function usePiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [models, setModels] = useState<PiModel[]>([]);
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null);
  const [authProviders, setAuthProviders] = useState<Record<string, boolean>>({});

  /* ---- model prefs ---- */
  const [favorites, setFavorites] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  /* ---- session stats (cost + context) ---- */
  const [sessionStats, setSessionStats] = useState<SessionStatsData | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageData | null>(null);

  /* ---- model key helper ---- */
  const modelKey = (m: { provider: string; id: string }) => `${m.provider}:${m.id}`;

  /* ---- initialise — single IPC call, no pre-fetching ---- */
  const init = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) {
      setInitError(
        "Not running inside Electron. IPC is unavailable — make sure the app was launched via `npm run app:dev` or the Electron wrapper."
      );
      return;
    }

    // Load persisted model prefs
    const prefs = loadPrefs();
    setFavorites(prefs.favorites);
    setBlocked(prefs.blocked);

    // Listen for streaming events from the main process
    ipc.on("pi:event", (_event: any, data: any) => {
      switch (data.type) {
        case "message_update": {
          const am = data.assistantMessageEvent;
          if (am.type === "text_delta") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant" && last.isStreaming) {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + am.delta,
                };
              }
              return next;
            });
          }
          break;
        }

        case "tool_execution_start": {
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: "tool",
              content: "",
              toolName: data.toolName,
              timestamp: Date.now(),
            },
          ]);
          break;
        }

        case "tool_execution_end": {
          const resultStr =
            typeof data.result === "string"
              ? data.result
              : JSON.stringify(data.result, null, 2);
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "tool" && !next[i].content) {
                next[i] = {
                  ...next[i],
                  content:
                    resultStr.length > 2000
                      ? resultStr.slice(0, 2000) + "\n… (truncated)"
                      : resultStr,
                  isToolError: data.isError ?? false,
                };
                break;
              }
            }
            return next;
          });
          break;
        }

        case "agent_start": {
          setMessages((prev) => [
            ...prev,
            {
              id: `asst-${Date.now()}`,
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              isStreaming: true,
            },
          ]);
          setIsStreaming(true);
          break;
        }

        case "agent_end": {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = { ...last, isStreaming: false };
            }
            return next;
          });
          setIsStreaming(false);
          // Fetch updated stats after agent finishes
          refreshSessionStats();
          break;
        }
      }
    });

    // Single IPC call — returns session ready + models + auth status
    try {
      const result = await ipc.invoke("pi:init");
      if (result.success) {
        setIsReady(true);
        setInitError(null);
        applySnapshot(result, setModels, setCurrentModel, setAuthProviders);
      } else {
        setInitError(
          result.error || "PI session could not start. Configure an API key in Settings → AI Provider."
        );
      }
    } catch (e: any) {
      setInitError(`PI init failed: ${e.message ?? String(e)}`);
    }
  }, []);

  /* ---- refresh models (used by the UI's refresh button) ---- */
  const refreshModels = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return;
    try {
      const result = await ipc.invoke("pi:get-models");
      applySnapshot(result, setModels, setCurrentModel, setAuthProviders);
    } catch (_) {}
  }, []);

  /* ---- toggle favorite ---- */
  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      savePrefs(next, blocked);
      return next;
    });
  }, [blocked]);

  /* ---- toggle block ---- */
  const toggleBlock = useCallback((key: string) => {
    setBlocked((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      // Remove from favorites if now blocked
      const newFavs = next.includes(key)
        ? favorites.filter((k) => k !== key)
        : favorites;
      savePrefs(newFavs, next);
      if (newFavs.length !== favorites.length) setFavorites(newFavs);
      return next;
    });
  }, [favorites]);

  /* ---- unblock (from settings) ---- */
  const unblockModel = useCallback((key: string) => {
    setBlocked((prev) => {
      const next = prev.filter((k) => k !== key);
      savePrefs(favorites, next);
      return next;
    });
  }, [favorites]);

  /* ---- derived: filtered + sorted models (favorites first, blocked hidden) ---- */
  const filteredModels = models
    .filter((m) => !blocked.includes(modelKey(m)))
    .sort((a, b) => {
      const aFav = favorites.includes(modelKey(a)) ? 1 : 0;
      const bFav = favorites.includes(modelKey(b)) ? 1 : 0;
      return bFav - aFav;
    });

  /* ---- refresh session stats (cost + context) ---- */
  const refreshSessionStats = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return;
    try {
      const result = await ipc.invoke("pi:get-session-stats");
      if (result.success) {
        setSessionStats(result.stats ?? null);
        setContextUsage(result.contextUsage ?? null);
      }
    } catch (_) {}
  }, []);

  /* ---- set API key (destroys + recreates session, returns full snapshot) ---- */
  const setApiKey = useCallback(async (provider: string, key: string) => {
    const ipc = getIpc();
    if (!ipc) throw new Error("IPC not available");
    const result = await ipc.invoke("pi:set-api-key", { provider, key });
    if (!result.success) throw new Error(result.error ?? "Failed to set API key");
    setIsReady(true);
    setInitError(null);
    applySnapshot(result, setModels, setCurrentModel, setAuthProviders);
    return result;
  }, []);

  /* ---- set model ---- */
  const setModel = useCallback(async (provider: string, modelId: string) => {
    const ipc = getIpc();
    if (!ipc) throw new Error("IPC not available");
    const result = await ipc.invoke("pi:set-model", { provider, modelId });
    if (!result.success) throw new Error(result.error ?? "Failed to set model");
    applySnapshot(result, setModels, setCurrentModel, setAuthProviders);
    return result;
  }, []);

  /* ---- reinitialize ---- */
  const reinit = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return false;
    try {
      const result = await ipc.invoke("pi:reinit");
      if (result.success) {
        setIsReady(true);
        setInitError(null);
        applySnapshot(result, setModels, setCurrentModel, setAuthProviders);
      } else {
        setInitError(result.error || "Re-init failed. Check your API key.");
      }
      return result.success;
    } catch (e: any) {
      setInitError(`Re-init failed: ${e.message ?? String(e)}`);
      return false;
    }
  }, []);

  /* ---- send message ---- */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!isReady) return;
      const ipc = getIpc();
      if (!ipc) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
        },
      ]);

      try {
        await ipc.invoke("pi:prompt", text);
      } catch (e: any) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            next[next.length - 1] = {
              ...last,
              content:
                last.content +
                `\n\n⚠️ Error: ${e.message ?? String(e)}`,
              isStreaming: false,
            };
          }
          return next;
        });
        setIsStreaming(false);
      }
    },
    [isReady]
  );

  /* ---- abort ---- */
  const abort = useCallback(async () => {
    const ipc = getIpc();
    if (ipc) await ipc.invoke("pi:abort");
  }, []);

  /* ---- clear ---- */
  const clear = useCallback(() => setMessages([]), []);

  /* ---- mount / unmount ---- */
  useEffect(() => {
    init();
    return () => {
      const ipc = getIpc();
      if (ipc) ipc.removeAllListeners("pi:event");
    };
  }, [init]);

  return {
    messages,
    isStreaming,
    isReady,
    initError,
    sendMessage,
    abort,
    clear,
    models,
    filteredModels,
    currentModel,
    authProviders,
    favorites,
    blocked,
    toggleFavorite,
    toggleBlock,
    unblockModel,
    sessionStats,
    contextUsage,
    setApiKey,
    setModel,
    refreshModels,
    refreshSessionStats,
    reinit,
  } as const;
}
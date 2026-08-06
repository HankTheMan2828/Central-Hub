"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type {
  AttachedDocument,
  AttachedFile,
  AttachedImage,
  ChatMessage,
  ContextUsageData,
  CurrentModel,
  PiModel,
  SessionStatsData,
  SlashCommand,
  UsePiChatOptions,
} from "@/hooks/usePiChat";

/* ------------------------------------------------------------------ */
/*  IPC helper (same pattern as usePiChat)                            */
/* ------------------------------------------------------------------ */
function getIpc() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron") as {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<any>;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (
          channel: string,
          listener: (...args: any[]) => void
        ) => void;
      };
    };
    return electron.ipcRenderer;
  } catch {
    return null;
  }
}

export type UseGrokChatOptions = UsePiChatOptions & {
  /** Working directory for Grok CLI --cwd (coding workspaces). */
  cwd?: string;
};

/** SuperGrok Grok Build currently exposes grok-4.5 only for all surfaces. */
function modelForSessionType(
  _sessionType: "chat" | "word" | "plain"
): { current: CurrentModel; models: PiModel[] } {
  const id = "grok-4.5";
  const name = "Grok 4.5";
  const current: CurrentModel = { id, name, provider: "xai" };
  const models: PiModel[] = [
    {
      id,
      name,
      provider: "xai",
      reasoning: true,
      contextWindow: 500000,
      input: ["text"],
    },
  ];
  return { current, models };
}

function usageToStats(usage: any): SessionStatsData | null {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0;
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0;
  const cacheRead =
    Number(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? 0) ||
    0;
  const cacheCreate =
    Number(
      usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens ?? 0
    ) || 0;
  const total =
    Number(usage.total_tokens ?? 0) ||
    input + output + cacheRead + cacheCreate;
  return {
    cost: 0,
    tokens: {
      input,
      output,
      cacheRead,
      cacheWrite: cacheCreate,
      total,
    },
  };
}

/**
 * Grok Build-backed chat hook. Mirrors the consumer-facing surface of
 * usePiChat so panels can swap via useAiChat without large rewrites.
 */
export function useGrokChat(options?: UseGrokChatOptions) {
  const existingSessionId = options?.existingSessionId;
  const disabled = options?.disabled ?? false;
  const sessionType: "chat" | "word" | "plain" = options?.sessionType ?? "chat";
  const cwd = options?.cwd;

  const sessionKind =
    sessionType === "plain"
      ? "plain"
      : sessionType === "word"
        ? "word"
        : "coding";

  const defaultModels = modelForSessionType(sessionType);

  const [sessionId, setSessionId] = useState<string | null>(
    existingSessionId ?? null
  );
  const sessionIdRef = useRef<string | null>(existingSessionId ?? null);
  const activeSessionRef = useRef<string | null>(null);
  const cwdRef = useRef<string | undefined>(cwd);
  cwdRef.current = cwd;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const [models, setModels] = useState<PiModel[]>(defaultModels.models);
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(
    defaultModels.current
  );
  const [authProviders, setAuthProviders] = useState<Record<string, boolean>>(
    {}
  );
  const [commands] = useState<SlashCommand[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStatsData | null>(
    null
  );
  const [contextUsage, setContextUsage] = useState<ContextUsageData | null>(
    null
  );
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedDocuments, setAttachedDocuments] = useState<
    AttachedDocument[]
  >([]);

  const pendingAssistantIdRef = useRef<string | null>(null);
  const deltaBufferRef = useRef<{
    type: "text" | "thinking";
    delta: string;
  } | null>(null);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const THROTTLE_MS = 32;

  const flushDelta = useCallback(() => {
    const buf = deltaBufferRef.current;
    const asstId = pendingAssistantIdRef.current;
    deltaBufferRef.current = null;
    deltaTimerRef.current = null;
    if (!buf || !asstId) return;

    startTransition(() => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === asstId);
        if (idx < 0) return prev;
        const next = [...prev];
        const msg = next[idx];
        if (buf.type === "text") {
          next[idx] = { ...msg, content: (msg.content || "") + buf.delta };
        } else {
          next[idx] = {
            ...msg,
            thinking: (msg.thinking || "") + buf.delta,
          };
        }
        return next;
      });
    });
  }, [startTransition]);

  const queueDelta = useCallback(
    (type: "text" | "thinking", delta: string) => {
      if (!delta) return;
      const buf = deltaBufferRef.current;
      if (buf && buf.type === type) {
        buf.delta += delta;
      } else {
        if (buf) flushDelta();
        deltaBufferRef.current = { type, delta };
      }
      if (!deltaTimerRef.current) {
        deltaTimerRef.current = setTimeout(flushDelta, THROTTLE_MS);
      }
    },
    [flushDelta]
  );

  const ensureAssistantBubble = useCallback(() => {
    if (pendingAssistantIdRef.current) return pendingAssistantIdRef.current;
    const id = `asst-grok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    pendingAssistantIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      },
    ]);
    return id;
  }, []);

  const buildEventHandler = useCallback(() => {
    return (_event: unknown, data: any) => {
      if (!data || data.sessionId !== sessionIdRef.current) return;
      const ev = data.event;
      if (!ev) return;

      switch (ev.type) {
        case "turn_start": {
          setIsStreaming(true);
          ensureAssistantBubble();
          break;
        }
        case "text": {
          ensureAssistantBubble();
          queueDelta("text", String(ev.data ?? ""));
          break;
        }
        case "thought": {
          ensureAssistantBubble();
          queueDelta("thinking", String(ev.data ?? ""));
          break;
        }
        case "tool_call": {
          if (deltaBufferRef.current) flushDelta();
          const toolId = `tool-${ev.id || Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: toolId,
              role: "tool",
              content: "",
              toolName: ev.name || "tool",
              toolResult: "",
              timestamp: Date.now(),
              isStreaming: true,
            },
          ]);
          break;
        }
        case "tool_call_update": {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i -= 1) {
              const m = next[i];
              if (m.role === "tool" && m.isStreaming) {
                next[i] = {
                  ...m,
                  toolResult: String(ev.output ?? m.toolResult ?? ""),
                  isToolError: ev.status === "failed" || ev.status === "error",
                  isStreaming: false,
                };
                break;
              }
            }
            return next;
          });
          break;
        }
        case "usage": {
          const stats = usageToStats(ev.usage);
          if (stats) {
            setSessionStats((prev) => {
              if (!prev) return stats;
              return {
                cost: prev.cost + stats.cost,
                tokens: {
                  input: prev.tokens.input + stats.tokens.input,
                  output: prev.tokens.output + stats.tokens.output,
                  cacheRead:
                    (prev.tokens.cacheRead ?? 0) +
                    (stats.tokens.cacheRead ?? 0),
                  cacheWrite:
                    (prev.tokens.cacheWrite ?? 0) +
                    (stats.tokens.cacheWrite ?? 0),
                  total: prev.tokens.total + stats.tokens.total,
                },
              };
            });
          }
          break;
        }
        case "end": {
          if (deltaBufferRef.current) flushDelta();
          const stats = usageToStats(ev.usage);
          if (stats) {
            setSessionStats((prev) => {
              if (!prev) return stats;
              return {
                cost: prev.cost + stats.cost,
                tokens: {
                  input: prev.tokens.input + stats.tokens.input,
                  output: prev.tokens.output + stats.tokens.output,
                  cacheRead:
                    (prev.tokens.cacheRead ?? 0) +
                    (stats.tokens.cacheRead ?? 0),
                  cacheWrite:
                    (prev.tokens.cacheWrite ?? 0) +
                    (stats.tokens.cacheWrite ?? 0),
                  total: prev.tokens.total + stats.tokens.total,
                },
              };
            });
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            )
          );
          pendingAssistantIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        case "error": {
          if (deltaBufferRef.current) flushDelta();
          const msg = String(ev.message || "Grok error");
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content:
                  (last.content || "") +
                  (last.content ? "\n\n" : "") +
                  `⚠️ ${msg}`,
                isStreaming: false,
              };
            } else {
              next.push({
                id: `err-${Date.now()}`,
                role: "assistant",
                content: `⚠️ ${msg}`,
                timestamp: Date.now(),
                isStreaming: false,
              });
            }
            return next;
          });
          pendingAssistantIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        case "aborted": {
          if (deltaBufferRef.current) flushDelta();
          setMessages((prev) =>
            prev.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            )
          );
          pendingAssistantIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        case "turn_end": {
          // Safety net if `end` was never emitted.
          if (deltaBufferRef.current) flushDelta();
          setMessages((prev) =>
            prev.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            )
          );
          pendingAssistantIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        default:
          break;
      }
    };
  }, [ensureAssistantBubble, flushDelta, queueDelta]);

  const filteredModels = models.filter(
    (m) => !blocked.includes(`${m.provider}:${m.id}`)
  );

  const sendMessage = useCallback(
    async (text: string, attachments?: AttachedFile[], hiddenContext?: string) => {
      const sid = sessionIdRef.current;
      if (!isReady || !sid) return;
      const ipc = getIpc();
      if (!ipc) return;

      let fullPrompt = hiddenContext?.trim()
        ? `${hiddenContext.trim()}\n\n${text}`
        : text;
      if (attachments && attachments.length > 0) {
        const parts: string[] = [];
        for (const a of attachments) {
          if (a.type === "text") {
            if (a.content.trim() && !a.content.startsWith("📎 File:")) {
              parts.push(
                `--- Context: ${a.title}.md ---\n${a.content.trim()}\n--- End Context ---`
              );
            } else if (a.content.startsWith("📎 File:")) {
              parts.push(a.content.trim());
            }
          }
        }
        if (parts.length > 0) {
          fullPrompt = hiddenContext?.trim()
            ? `${hiddenContext.trim()}\n\n${parts.join("\n\n")}\n\n${text}`
            : `${parts.join("\n\n")}\n\n${text}`;
        }
      }

      const now = Date.now();
      const pendingAssistantId = `asst-pending-${now}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      pendingAssistantIdRef.current = pendingAssistantId;
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${now}`,
          role: "user",
          content: text,
          timestamp: now,
          attachments,
        },
        {
          id: pendingAssistantId,
          role: "assistant",
          content: "",
          timestamp: now,
          isStreaming: true,
        },
      ]);

      try {
        const result = await ipc.invoke("grok:prompt", {
          sessionId: sid,
          text: fullPrompt,
          cwd: cwdRef.current,
        });
        if (result && result.success === false) {
          throw new Error(result.error || "Grok prompt failed");
        }
      } catch (e: any) {
        pendingAssistantIdRef.current = null;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            next[next.length - 1] = {
              ...last,
              content:
                last.content + `\n\n⚠️ Error: ${e.message ?? String(e)}`,
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

  const abort = useCallback(async () => {
    const ipc = getIpc();
    const sid = sessionIdRef.current;
    if (ipc && sid) await ipc.invoke("grok:abort", { sessionId: sid });
  }, []);

  const clear = useCallback(() => {
    pendingAssistantIdRef.current = null;
    setIsStreaming(false);
    setMessages([]);
  }, []);

  const restoreMessages = useCallback((nextMessages: ChatMessage[]) => {
    pendingAssistantIdRef.current = null;
    setIsStreaming(false);
    setMessages(nextMessages.map((m) => ({ ...m, isStreaming: false })));
  }, []);

  const setApiKey = useCallback(async () => {
    throw new Error(
      "Grok Build uses SuperGrok login (run `grok login`). OpenRouter keys are for the PI route."
    );
  }, []);

  const setModel = useCallback(async () => {
    // Model is fixed to grok-4.5 on the SuperGrok / Grok Build route.
    setCurrentModel(defaultModels.current);
    return { success: true };
  }, [defaultModels.current]);

  const reinit = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return false;
    const owned = activeSessionRef.current;
    if (owned) {
      try {
        await ipc.invoke("grok:abort", { sessionId: owned });
      } catch (_) {}
      try {
        await ipc.invoke("grok:session-destroy", { sessionId: owned });
      } catch (_) {}
      activeSessionRef.current = null;
    }
    try {
      const result = await ipc.invoke("grok:session-create", {
        sessionKind,
        cwd: cwdRef.current,
      });
      if (!result.success) {
        setInitError(result.error || "Grok re-init failed");
        setIsReady(false);
        return false;
      }
      sessionIdRef.current = result.sessionId;
      activeSessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setCurrentModel(result.currentModel || defaultModels.current);
      if (Array.isArray(result.models) && result.models.length) {
        setModels(result.models);
      }
      setAuthProviders(result.providers || { xai: true });
      setIsReady(true);
      setInitError(null);
      return true;
    } catch (e: any) {
      setInitError(e?.message ?? String(e));
      return false;
    }
  }, [defaultModels.current, sessionKind]);

  const restart = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return false;
    const ownedSid = activeSessionRef.current;
    if (ownedSid) {
      try {
        await ipc.invoke("grok:abort", { sessionId: ownedSid });
      } catch (_) {}
      try {
        await ipc.invoke("grok:session-destroy", { sessionId: ownedSid });
      } catch (_) {}
      activeSessionRef.current = null;
    }
    try {
      const result = await ipc.invoke("grok:session-create", {
        sessionKind,
        cwd: cwdRef.current,
      });
      if (!result.success) {
        setInitError(result.error || "Failed to start a new Grok session.");
        return false;
      }
      sessionIdRef.current = result.sessionId;
      activeSessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      pendingAssistantIdRef.current = null;
      setMessages([]);
      setIsStreaming(false);
      setSessionStats(null);
      setContextUsage(null);
      setCurrentModel(result.currentModel || defaultModels.current);
      if (Array.isArray(result.models) && result.models.length) {
        setModels(result.models);
      }
      if (result.providers) setAuthProviders(result.providers);
      setIsReady(true);
      setInitError(null);
      return true;
    } catch (e: any) {
      setInitError(`Restart failed: ${e?.message ?? String(e)}`);
      return false;
    }
  }, [defaultModels.current, sessionKind]);

  const refreshModels = useCallback(async () => {
    setCurrentModel(defaultModels.current);
    setModels(defaultModels.models);
  }, [defaultModels.current, defaultModels.models]);

  const refreshSessionStats = useCallback(async () => {}, []);
  const refreshCommands = useCallback(async () => {}, []);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const toggleBlock = useCallback((key: string) => {
    setBlocked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const unblockModel = useCallback((key: string) => {
    setBlocked((prev) => prev.filter((k) => k !== key));
  }, []);

  const attachImages = useCallback(async (files: FileList) => {
    // Grok headless v1: images not forwarded to CLI; no-op with warn.
    console.warn(
      "[useGrokChat] Image attachments are not supported on the Grok Build route yet."
    );
    void files;
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => setAttachedImages([]), []);

  const attachDocument = useCallback(async () => {
    console.warn(
      "[useGrokChat] Document picker is not wired on the Grok Build route yet. Paste context into the message."
    );
    return [] as AttachedDocument[];
  }, []);

  const removeDocument = useCallback((id: string) => {
    setAttachedDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }, []);

  const clearDocuments = useCallback(() => setAttachedDocuments([]), []);

  const writePasteFiles = useCallback(async () => {
    return { success: true, paths: [] as string[] };
  }, []);

  // Keep cwd in sync on the main-process session when it changes.
  useEffect(() => {
    const sid = sessionIdRef.current;
    const ipc = getIpc();
    if (!sid || !ipc || !cwd) return;
    ipc.invoke("grok:set-cwd", { sessionId: sid, cwd }).catch(() => {});
  }, [cwd]);

  /* lifecycle */
  useEffect(() => {
    let cancelled = false;
    let localHandler: ((...args: any[]) => void) | null = null;

    if (disabled) {
      pendingAssistantIdRef.current = null;
      sessionIdRef.current = null;
      activeSessionRef.current = null;
      setSessionId(null);
      setIsReady(false);
      setIsStreaming(false);
      setInitError(null);
      setAuthProviders({});
      setSessionStats(null);
      setContextUsage(null);
      return () => {
        cancelled = true;
      };
    }

    const ipc = getIpc();

    const init = async () => {
      if (!ipc) {
        if (!cancelled) {
          setInitError(
            "Not running inside Electron. Launch via `npm run app:dev`."
          );
        }
        return;
      }

      try {
        let snap: any;
        let sid: string | null = null;
        let createdNew = false;

        if (existingSessionId) {
          sid = existingSessionId;
          snap = {
            success: true,
            sessionId: sid,
            currentModel: defaultModels.current,
            models: defaultModels.models,
            providers: { xai: true },
          };
        } else {
          snap = await ipc.invoke("grok:session-create", {
            sessionKind,
            cwd: cwdRef.current,
          });
          sid = snap.sessionId;
          createdNew = true;
        }

        if (cancelled) {
          if (sid && createdNew) {
            ipc
              .invoke("grok:session-destroy", { sessionId: sid })
              .catch(() => {});
          }
          return;
        }

        sessionIdRef.current = sid;
        setSessionId(sid);
        if (createdNew) activeSessionRef.current = sid;

        if (!snap.success) {
          setInitError(
            snap.error ||
              "Grok session could not start. Check Menu → Routing and run `grok login`."
          );
          setIsReady(false);
          return;
        }

        setIsReady(true);
        setInitError(null);
        setCurrentModel(snap.currentModel || defaultModels.current);
        if (Array.isArray(snap.models) && snap.models.length) {
          setModels(snap.models);
        } else {
          setModels(defaultModels.models);
        }
        setAuthProviders(snap.providers || { xai: true });
      } catch (e: any) {
        if (!cancelled) {
          setInitError(`Grok init failed: ${e.message ?? String(e)}`);
        }
        return;
      }

      if (cancelled) return;

      const handler = buildEventHandler();
      localHandler = handler;
      ipc.on("grok:event", handler);
    };

    init();

    return () => {
      cancelled = true;
      if (deltaTimerRef.current) {
        clearTimeout(deltaTimerRef.current);
        deltaTimerRef.current = null;
      }
      const ipc2 = getIpc();
      if (ipc2 && localHandler) {
        ipc2.removeListener("grok:event", localHandler);
      }
      const owned = activeSessionRef.current;
      if (owned && ipc2) {
        ipc2.invoke("grok:abort", { sessionId: owned }).catch(() => {});
        ipc2
          .invoke("grok:session-destroy", { sessionId: owned })
          .catch(() => {});
        activeSessionRef.current = null;
      }
    };
  }, [buildEventHandler, disabled, existingSessionId, sessionKind]);

  return {
    sessionId,
    messages,
    isStreaming,
    isReady,
    initError,
    sendMessage,
    attachedImages,
    attachImages,
    removeImage,
    clearImages,
    attachedDocuments,
    attachDocument,
    removeDocument,
    clearDocuments,
    abort,
    clear,
    restoreMessages,
    setMessages: restoreMessages,
    restart,
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
    writePasteFiles,
    refreshSessionStats,
    reinit,
    commands,
    refreshCommands,
  } as const;
}

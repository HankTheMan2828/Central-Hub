"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
export interface AttachedFile {
  type: "text" | "image";
  title: string;
  content: string;
  mimeType?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
  toolName?: string;
  toolResult?: string;
  isToolError?: boolean;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: AttachedFile[];
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

export type StoredModelPreference = {
  provider: string;
  id: string;
};

export const SELECTED_MODEL_KEY = "centralhub-selected-model";
export const DEFAULT_MODEL_KEY = "centralhub-default-model";

const MODEL_NAME_PREFIXES = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "meta",
  "mistral",
  "deepseek",
  "qwen",
  "alibaba",
  "xai",
  "x.ai",
  "moonshot ai",
  "z.ai",
  "zai",
  "cohere",
  "perplexity",
  "nous",
  "nvidia",
  "microsoft",
  "amazon",
  "ai21",
  "liquid",
  "minimax",
  "reka",
  "morph",
  "inception",
  "inflection",
  "01.ai",
  "01ai",
];

const MODEL_WORDS: Record<string, string> = {
  ai: "AI",
  gpt: "GPT",
  glm: "GLM",
  tts: "TTS",
  stt: "STT",
  gte: "GTE",
  gteb: "GTEB",
  ocr: "OCR",
  r1: "R1",
  v3: "V3",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimModelPrefixes(value: string, provider?: string) {
  let name = value.trim();
  const prefixes = [
    provider,
    ...MODEL_NAME_PREFIXES,
  ].filter((prefix): prefix is string => !!prefix?.trim());

  for (let i = 0; i < 4; i += 1) {
    const before = name;
    for (const prefix of prefixes) {
      const pattern = new RegExp(
        `^${escapeRegExp(prefix)}\\s*(?::|/|-\\s+)\\s*`,
        "i"
      );
      name = name.replace(pattern, "").trim();
    }
    if (name === before) break;
  }

  return name;
}

function titleModelWord(word: string) {
  const key = word.toLowerCase();
  if (MODEL_WORDS[key]) return MODEL_WORDS[key];
  if (/[A-Z]/.test(word.slice(1))) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function prettifyModelSlug(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.includes("-") && !trimmed.includes("_"))) {
    return trimmed;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(titleModelWord)
    .join(" ");
}

function cleanModelName(model: { id: string; name?: string; provider?: string }) {
  const raw = (model.name || model.id || "").trim();
  const source = raw || model.id;
  let name = trimModelPrefixes(source, model.provider);

  if (name.includes("/") && !name.includes(" / ")) {
    name = trimModelPrefixes(name.split("/").pop() || name, model.provider);
  }

  name = name.replace(
    new RegExp(
      `\\s*\\((?:${MODEL_NAME_PREFIXES.map(escapeRegExp).join("|")})\\)\\s*$`,
      "i"
    ),
    ""
  );

  return prettifyModelSlug(name) || source;
}

function normalizeModel(model: PiModel): PiModel {
  return { ...model, name: cleanModelName(model) };
}

function normalizeCurrentModel(model: CurrentModel | null | undefined) {
  return model ? { ...model, name: cleanModelName(model) } : null;
}

function normalizeModels(models: PiModel[] | null | undefined) {
  return (models ?? []).map(normalizeModel);
}

function splitModelPreference(value: string): StoredModelPreference | null {
  const [provider, ...idParts] = value.split(":");
  const id = idParts.join(":");
  if (!provider || !id) return null;
  return { provider, id };
}

function parseModelPreference(raw: string | null): StoredModelPreference | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.provider === "string" &&
      typeof parsed?.id === "string"
    ) {
      return { provider: parsed.provider, id: parsed.id };
    }
  } catch {}
  return splitModelPreference(raw);
}

export function loadSelectedModelPreference() {
  try {
    return parseModelPreference(localStorage.getItem(SELECTED_MODEL_KEY));
  } catch {
    return null;
  }
}

export function saveSelectedModelPreference(model: StoredModelPreference) {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
  } catch {}
}

export function loadDefaultModelPreference() {
  try {
    return parseModelPreference(localStorage.getItem(DEFAULT_MODEL_KEY));
  } catch {
    return null;
  }
}

export function saveDefaultModelPreference(model: StoredModelPreference | null) {
  try {
    if (model) {
      localStorage.setItem(DEFAULT_MODEL_KEY, JSON.stringify(model));
    } else {
      localStorage.removeItem(DEFAULT_MODEL_KEY);
    }
  } catch {}
}

function loadPreferredModelPreference() {
  return loadDefaultModelPreference() ?? loadSelectedModelPreference();
}

export interface SlashCommand {
  name: string;
  description: string;
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

export interface AttachedImage {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  preview: string;
}

export interface AttachedDocument {
  id: string;
  name: string;
  path: string;
  textContent?: string;
}

/* ------------------------------------------------------------------ */
/*  IPC helper                                                        */
/* ------------------------------------------------------------------ */
function getIpc() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron");
    return {
      invoke: (channel: string, ...args: any[]) =>
        electron.ipcRenderer.invoke(channel, ...args),
      on: (channel: string, fn: (...args: any[]) => void) =>
        electron.ipcRenderer.on(channel, fn),
      removeListener: (channel: string, fn: (...args: any[]) => void) =>
        electron.ipcRenderer.removeListener(channel, fn),
    };
  } catch {
    return null;
  }
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
export type UsePiChatOptions = {
  existingSessionId?: string;
  disabled?: boolean;
  /**
   * "chat" (default) creates a normal coding-agent session via
   * `pi:session-create`. "word" creates a WordTab session via
   * `pi:word-session-create`, which registers the `word_read` tool and
   * disables built-in fs/bash tools. "plain" creates a Plain Chat
   * session via `pi:plain-session-create` — built-in coding tools off,
   * `web_search` and `weather` registered.
   */
  sessionType?: "chat" | "word" | "plain";
};

function sessionCreateChannelFor(type: "chat" | "word" | "plain") {
  switch (type) {
    case "word":
      return "pi:word-session-create";
    case "plain":
      return "pi:plain-session-create";
    default:
      return "pi:session-create";
  }
}

type PiSnapshotResult = {
  success?: boolean;
  error?: string;
  sessionId?: string;
  models?: PiModel[];
  currentModel?: CurrentModel | null;
  providers?: Record<string, boolean>;
};

type AuthChangedPayload = Pick<
  PiSnapshotResult,
  "models" | "currentModel" | "providers"
> & {
  provider?: string;
};

export function usePiChat(options?: UsePiChatOptions) {
  const existingSessionId = options?.existingSessionId;
  const disabled = options?.disabled ?? false;
  const sessionType: "chat" | "word" | "plain" = options?.sessionType ?? "chat";

  /* ---- session identity ---- */
  const [sessionId, setSessionId] = useState<string | null>(
    existingSessionId ?? null
  );
  // Ref avoids stale closures inside the event handler
  const sessionIdRef = useRef<string | null>(existingSessionId ?? null);
  // Tracks the session this hook currently *owns* (i.e. created and is
  // responsible for destroying). Separate from sessionIdRef because it
  // stays null when a session was borrowed via existingSessionId, and
  // it's updated by both the lifecycle init AND restart().
  const activeSessionRef = useRef<string | null>(null);

  /* ---- chat state ---- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  /* ---- transition for low-priority streaming updates ---- */
  const [isPending, startTransition] = useTransition();

  /* ---- delta throttle ---- */
  const deltaBufferRef = useRef<{ type: "text" | "thinking"; delta: string } | null>(null);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const THROTTLE_MS = 32; // ~30 fps

  /* ---- models ---- */
  const [models, setModels] = useState<PiModel[]>([]);
  const [currentModel, setCurrentModel] = useState<CurrentModel | null>(null);
  const [authProviders, setAuthProviders] = useState<Record<string, boolean>>({});
  const [commands, setCommands] = useState<SlashCommand[]>([]);

  /* ---- prefs ---- */
  const [favorites, setFavorites] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  /* ---- session stats ---- */
  const [sessionStats, setSessionStats] = useState<SessionStatsData | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageData | null>(null);

  /* ---- attachments ---- */
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>([]);

  /* ---- helpers ---- */
  const modelKey = (m: { provider: string; id: string }) =>
    `${m.provider}:${m.id}`;

  /* ================================================================ */
  /*  Event handler factory (used by lifecycle effect below)          */
  /*                                                                  */
  /*  Returned closure is registered on `pi:event` after a session    */
  /*  has been created. It filters events by sessionIdRef so only     */
  /*  this hook's session is processed.                               */
  /* ================================================================ */
  const buildEventHandler = useCallback(() => {
    return (_event: any, data: any) => {
      // Filter by session — use ref to avoid stale closures
      if (!data || data.sessionId !== sessionIdRef.current) return;
      const ev = data.event;
      if (!ev) return;

      switch (ev.type) {
        case "message_update": {
          const am = ev.assistantMessageEvent;
          if (am.type === "text_delta" || am.type === "thinking_delta") {
            const deltaType: "text" | "thinking" =
              am.type === "text_delta" ? "text" : "thinking";
            const newDelta = am.delta ?? "";

            // If the delta type switches (thinking→text or text→thinking),
            // flush the old buffer immediately so nothing is lost.
            const flushBuffer = () => {
              if (deltaTimerRef.current) {
                clearTimeout(deltaTimerRef.current);
                deltaTimerRef.current = null;
              }
              const buf = deltaBufferRef.current;
              if (!buf) return;
              deltaBufferRef.current = null;
              setMessages((prev) => {
                let idx = prev.length - 1;
                while (idx >= 0 && !(prev[idx].role === "assistant" && prev[idx].isStreaming)) idx--;
                if (idx < 0) return prev;
                const next = prev.slice();
                const target = next[idx];
                next[idx] = buf.type === "text"
                  ? { ...target, content: target.content + buf.delta }
                  : { ...target, thinking: (target.thinking || "") + buf.delta };
                return next;
              });
            };

            if (deltaBufferRef.current && deltaBufferRef.current.type !== deltaType) {
              flushBuffer();
              deltaBufferRef.current = { type: deltaType, delta: newDelta };
            } else if (deltaBufferRef.current) {
              deltaBufferRef.current = {
                type: deltaBufferRef.current.type,
                delta: deltaBufferRef.current.delta + newDelta,
              };
            } else {
              deltaBufferRef.current = { type: deltaType, delta: newDelta };
            }

            if (!deltaTimerRef.current) {
              deltaTimerRef.current = setTimeout(() => {
                deltaTimerRef.current = null;
                const buf = deltaBufferRef.current;
                if (!buf) return;
                deltaBufferRef.current = null;

                startTransition(() => {
                  setMessages((prev) => {
                    let idx = prev.length - 1;
                    while (
                      idx >= 0 &&
                      !(prev[idx].role === "assistant" && prev[idx].isStreaming)
                    ) {
                      idx--;
                    }
                    if (idx < 0) return prev;

                    const next = prev.slice();
                    const target = next[idx];
                    if (buf.type === "text") {
                      next[idx] = {
                        ...target,
                        content: target.content + buf.delta,
                      };
                    } else {
                      next[idx] = {
                        ...target,
                        thinking: (target.thinking || "") + buf.delta,
                      };
                    }
                    return next;
                  });
                });
              }, THROTTLE_MS);
            }
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
              toolName: ev.toolName,
              timestamp: Date.now(),
            },
          ]);
          break;
        }

        case "tool_execution_end": {
          const resultStr =
            typeof ev.result === "string"
              ? ev.result
              : JSON.stringify(ev.result, null, 2);
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
                  isToolError: ev.isError ?? false,
                };
                break;
              }
            }
            return next;
          });
          break;
        }

        case "agent_start": {
          // Flush any pending text delta from a prior turn (defensive).
          if (deltaBufferRef.current) {
            const buf = deltaBufferRef.current;
            deltaBufferRef.current = null;
            if (deltaTimerRef.current) {
              clearTimeout(deltaTimerRef.current);
              deltaTimerRef.current = null;
            }
            setMessages((prev) => {
              let idx = prev.length - 1;
              while (
                idx >= 0 &&
                !(prev[idx].role === "assistant" && prev[idx].isStreaming)
              ) {
                idx--;
              }
              if (idx < 0) return prev;
              const next = prev.slice();
              const target = next[idx];
              if (buf.type === "text") {
                next[idx] = { ...target, content: target.content + buf.delta };
              } else {
                next[idx] = { ...target, thinking: (target.thinking || "") + buf.delta };
              }
              return next;
            });
          }
          // Open ONE assistant bubble for the entire agent turn. message_start
          // events from each LLM turn (inc. post-tool turns) all stream into
          // this single bubble so we never split thinking across N bubbles.
          //
          // If send() already queued a placeholder bubble (pendingAssistantIdRef
          // is set synchronously, before any await), trust the ref and skip —
          // the placeholder may not have committed to messages state yet when
          // this event fires, so a `prev`-based identity check would race.
          if (pendingAssistantIdRef.current) {
            pendingAssistantIdRef.current = null;
            setIsStreaming(true);
            break;
          }

          // No pending placeholder (e.g., resumed session, external trigger).
          // Avoid a duplicate if a streaming assistant bubble is already open.
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.isStreaming) {
              return prev;
            }
            return [
              ...prev,
              {
                id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                isStreaming: true,
              },
            ];
          });
          setIsStreaming(true);
          break;
        }

        case "message_start": {
          // Intentionally a no-op for assistant messages: agent_start already
          // opened the single bubble. Each LLM turn between tool calls would
          // otherwise create its own bubble (and its own THINKING header).
          break;
        }

        case "message_end": {
          // Flush any remaining buffered deltas, but leave isStreaming=true
          // on the bubble — the agent may still run more LLM turns after a
          // tool call before agent_end finally marks it complete.
          if (deltaBufferRef.current) {
            const buf = deltaBufferRef.current;
            deltaBufferRef.current = null;
            if (deltaTimerRef.current) {
              clearTimeout(deltaTimerRef.current);
              deltaTimerRef.current = null;
            }
            setMessages((prev) => {
              let idx = prev.length - 1;
              while (idx >= 0 && !(prev[idx].role === "assistant")) idx--;
              if (idx < 0) return prev;
              const next = prev.slice();
              next[idx] = buf.type === "text"
                ? { ...next[idx], content: next[idx].content + buf.delta }
                : { ...next[idx], thinking: (next[idx].thinking || "") + buf.delta };
              return next;
            });
          }
          break;
        }

        case "agent_end": {
          // Flush any pending buffered deltas before finalizing
          // (agent_end may fire without message_end having run yet, or
          //  message_end may have already cleared isStreaming).
          if (deltaBufferRef.current) {
            const buf = deltaBufferRef.current;
            deltaBufferRef.current = null;
            if (deltaTimerRef.current) {
              clearTimeout(deltaTimerRef.current);
              deltaTimerRef.current = null;
            }
            setMessages((prev) => {
              let idx = prev.length - 1;
              while (idx >= 0 && !(prev[idx].role === "assistant")) idx--;
              if (idx < 0) return prev;
              const next = prev.slice();
              if (buf.type === "text") {
                next[idx] = { ...next[idx], content: next[idx].content + buf.delta };
              } else {
                next[idx] = { ...next[idx], thinking: (next[idx].thinking || "") + buf.delta };
              }
              return next;
            });
          }
          // Close the single per-agent-turn assistant bubble. message_end
          // intentionally leaves isStreaming=true so the bubble stays open
          // through inter-turn tool calls; agent_end is the real end.
          setMessages((prev) => {
            let idx = prev.length - 1;
            while (idx >= 0 && !(prev[idx].role === "assistant")) idx--;
            if (idx < 0) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], isStreaming: false };
            return next;
          });
          setIsStreaming(false);
          refreshSessionStats();
          break;
        }
      }
    };
  }, []);

  /* ================================================================ */
  /*  Refresh helpers                                                 */
  /* ================================================================ */
  const refreshCommands = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return;
    try {
      const result = await ipc.invoke("pi:get-commands");
      setCommands(result ?? []);
    } catch (_) {}
  }, []);

  const refreshModels = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return;
    try {
      const result = await ipc.invoke("pi:get-models");
      setModels(normalizeModels(result.models));
      setCurrentModel(normalizeCurrentModel(result.currentModel));
      setAuthProviders(result.providers ?? {});
    } catch (_) {}
  }, []);

  const applyPreferredModel = useCallback(
    async (
      ipc: NonNullable<ReturnType<typeof getIpc>>,
      sid: string,
      snap: PiSnapshotResult
    ): Promise<PiSnapshotResult> => {
      const preferred = loadPreferredModelPreference();
      if (!preferred) return snap;

      try {
        const result = await ipc.invoke("pi:set-model", {
          sessionId: sid,
          provider: preferred.provider,
          modelId: preferred.id,
        });
        if (result.success) return result;
        console.warn(
          "[usePiChat] preferred model could not be applied:",
          result.error
        );
      } catch (e) {
        console.warn("[usePiChat] preferred model could not be applied:", e);
      }

      return snap;
    },
    []
  );

  const refreshSessionStats = useCallback(async () => {
    const ipc = getIpc();
    const sid = sessionIdRef.current;
    if (!ipc || !sid) return;
    try {
      const result = await ipc.invoke("pi:get-session-stats", {
        sessionId: sid,
      });
      if (result.success) {
        setSessionStats(result.stats ?? null);
        setContextUsage(result.contextUsage ?? null);
      }
    } catch (_) {}
  }, []);

  /* ================================================================ */
  /*  Model prefs                                                     */
  /* ================================================================ */
  const toggleFavorite = useCallback(
    (key: string) => {
      setFavorites((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        savePrefs(next, blocked);
        return next;
      });
    },
    [blocked]
  );

  const toggleBlock = useCallback(
    (key: string) => {
      setBlocked((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        const newFavs = next.includes(key)
          ? favorites.filter((k) => k !== key)
          : favorites;
        savePrefs(newFavs, next);
        if (newFavs.length !== favorites.length) setFavorites(newFavs);
        return next;
      });
    },
    [favorites]
  );

  const unblockModel = useCallback(
    (key: string) => {
      setBlocked((prev) => {
        const next = prev.filter((k) => k !== key);
        savePrefs(favorites, next);
        return next;
      });
    },
    [favorites]
  );

  /* ---- derived: filtered + sorted models ---- */
  const filteredModels = models
    .filter((m) => !blocked.includes(modelKey(m)))
    .sort((a, b) => {
      const aFav = favorites.includes(modelKey(a)) ? 1 : 0;
      const bFav = favorites.includes(modelKey(b)) ? 1 : 0;
      return bFav - aFav;
    });

  /* ================================================================ */
  /*  Core actions                                                    */
  /* ================================================================ */
  const sendMessage = useCallback(
    async (text: string, attachments?: AttachedFile[], hiddenContext?: string) => {
      const sid = sessionIdRef.current;
      if (!isReady || !sid) return;
      const ipc = getIpc();
      if (!ipc) return;

      // Build full prompt with context
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
      const pendingAssistantId = `asst-pending-${now}-${Math.random().toString(36).slice(2, 6)}`;
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
        const imageAttachments =
          attachments?.filter((a) => a.type === "image") ?? [];
        if (imageAttachments.length > 0) {
          const formattedImages = imageAttachments.map((img) => ({
            data: img.content,
            mimeType: img.mimeType || "image/png",
          }));
          await ipc.invoke("pi:send-image", {
            sessionId: sid,
            text: fullPrompt,
            images: formattedImages,
          });
        } else {
          await ipc.invoke("pi:prompt", {
            sessionId: sid,
            text: fullPrompt,
          });
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

  const abort = useCallback(async () => {
    const ipc = getIpc();
    const sid = sessionIdRef.current;
    if (ipc && sid) await ipc.invoke("pi:abort", { sessionId: sid });
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

  /* ---- set API key (main destroys sessions; pi:auth-changed recreates them) ---- */
  const setApiKey = useCallback(async (provider: string, key: string) => {
    const ipc = getIpc();
    if (!ipc) throw new Error("IPC not available");
    const result = await ipc.invoke("pi:set-api-key", { provider, key });
    if (!result.success)
      throw new Error(result.error ?? "Failed to set API key");
    setInitError(null);
    setModels(normalizeModels(result.models));
    setCurrentModel(normalizeCurrentModel(result.currentModel));
    setAuthProviders(result.providers ?? {});
    return result;
  }, []);

  /* ---- set model (broadcasts to all sessions) ---- */
  const setModel = useCallback(async (provider: string, modelId: string) => {
    const ipc = getIpc();
    if (!ipc) throw new Error("IPC not available");
    const result = await ipc.invoke("pi:broadcast-model", {
      provider,
      modelId,
    });
    if (!result.success)
      throw new Error(result.error ?? "Failed to set model");
    saveSelectedModelPreference({ provider, id: modelId });
    await refreshModels();
    return result;
  }, []);

  /* ---- reinitialize ---- */
  const reinit = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return false;
    try {
      const result = await ipc.invoke("pi:reinit");
      if (result.success) {
        const snap = result.sessionId
          ? await applyPreferredModel(ipc, result.sessionId, result)
          : result;
        setIsReady(true);
        setInitError(null);
        sessionIdRef.current = snap.sessionId ?? result.sessionId;
        setSessionId(snap.sessionId ?? result.sessionId);
        setModels(normalizeModels(snap.models));
        setCurrentModel(normalizeCurrentModel(snap.currentModel));
        setAuthProviders(snap.providers ?? {});
      } else {
        setInitError(result.error || "Re-init failed. Check your API key.");
      }
      return result.success;
    } catch (e: any) {
      setInitError(`Re-init failed: ${e.message ?? String(e)}`);
      return false;
    }
  }, [applyPreferredModel]);

  /* ---- restart: destroy the owned session and create a fresh one of
   *      the same type. Used by the "New" button so the AI doesn't see
   *      any prior conversation history.                              */
  const restart = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return false;

    const ownedSid = activeSessionRef.current;
    if (ownedSid) {
      try { await ipc.invoke("pi:abort", { sessionId: ownedSid }); } catch (_) {}
      try { await ipc.invoke("pi:session-destroy", { sessionId: ownedSid }); } catch (_) {}
      activeSessionRef.current = null;
    }

    const channel = sessionCreateChannelFor(sessionType);

    try {
      const result: any = await ipc.invoke(channel);
      if (!result.success) {
        const msg = result.error || "Failed to start a new session.";
        setInitError(msg);
        return false;
      }

      const snap = await applyPreferredModel(ipc, result.sessionId, result);

      sessionIdRef.current = snap.sessionId ?? result.sessionId;
      activeSessionRef.current = snap.sessionId ?? result.sessionId;
      setSessionId(snap.sessionId ?? result.sessionId);
      pendingAssistantIdRef.current = null;
      setMessages([]);
      setIsStreaming(false);
      setSessionStats(null);
      setContextUsage(null);
      if (Array.isArray(snap.models)) setModels(normalizeModels(snap.models));
      setCurrentModel(normalizeCurrentModel(snap.currentModel));
      if (snap.providers) setAuthProviders(snap.providers);
      setIsReady(true);
      setInitError(null);
      return true;
    } catch (e: any) {
      console.warn("[usePiChat] restart failed:", e?.message ?? e);
      setInitError(`Restart failed: ${e?.message ?? String(e)}`);
      return false;
    }
  }, [applyPreferredModel, sessionType]);

  /* ================================================================ */
  /*  Attachments                                                     */
  /* ================================================================ */
  const attachImages = useCallback(async (files: FileList) => {
    const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const newImages: AttachedImage[] = [];
    let totalBytes = 0;
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) {
        console.warn("[usePiChat] Skipping unsupported image:", file.name, file.type);
        continue;
      }
      if (totalBytes + file.size > 20 * 1024 * 1024) {
        console.warn("[usePiChat] Skipping image, exceeds 20MB total:", file.name);
        continue;
      }
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const commaIdx = result.indexOf(",");
      const base64 = result.slice(commaIdx + 1);
      newImages.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mimeType: file.type,
        data: base64,
        preview: result,
      });
      totalBytes += file.size;
    }
    setAttachedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => setAttachedImages([]), []);

  const attachDocument = useCallback(async () => {
    const ipc = getIpc();
    if (!ipc) return [];
    try {
      const result = await ipc.invoke("pi:select-file");
      if (result.canceled || !result.filePaths?.length) return [];

      const newDocs: AttachedDocument[] = [];
      for (const filePath of result.filePaths) {
        const lower = filePath.toLowerCase();
        const name =
          filePath.replace(/\\/g, "/").split("/").pop() || filePath;

        const isTextFormat =
          lower.endsWith(".md") ||
          lower.endsWith(".txt") ||
          lower.endsWith(".log") ||
          lower.endsWith(".json") ||
          lower.endsWith(".yaml") ||
          lower.endsWith(".yml") ||
          lower.endsWith(".xml") ||
          lower.endsWith(".html") ||
          lower.endsWith(".css") ||
          lower.endsWith(".js") ||
          lower.endsWith(".ts") ||
          lower.endsWith(".tsx") ||
          lower.endsWith(".jsx");

        let textContent: string | undefined;
        if (isTextFormat) {
          try {
            const readResult = await ipc.invoke("pi:read-file-text", {
              filePath,
            });
            if (readResult.success) {
              textContent = readResult.content;
            }
          } catch (_) {}
        }

        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          path: filePath,
          textContent,
        });
      }

      setAttachedDocuments((prev) => [...prev, ...newDocs]);
      return newDocs;
    } catch (e) {
      console.error("Failed to attach document:", e);
      return [];
    }
  }, []);

  const removeDocument = useCallback((id: string) => {
    setAttachedDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearDocuments = useCallback(() => setAttachedDocuments([]), []);

  const writePasteFiles = useCallback(
    async (boxes: { title: string; content: string }[]) => {
      const ipc = getIpc();
      if (!ipc) return null;
      try {
        const result = await ipc.invoke("pi:write-paste-files", {
          pasteBoxes: boxes,
        });
        if (result.success) return result.files ?? [];
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  /* ================================================================ */
  /*  Lifecycle                                                       */
  /*                                                                  */
  /*  Each effect run owns its own handler + session via local        */
  /*  closure variables. This survives React StrictMode's intentional */
  /*  mount → cleanup → mount sequence: the cleanup deterministically */
  /*  removes only this run's listener and only destroys the session  */
  /*  this run created — even if init() is still mid-flight when      */
  /*  cleanup fires (in which case `cancelled` causes init to bail    */
  /*  before registering anything).                                   */
  /* ================================================================ */
  useEffect(() => {
    let cancelled = false;
    let localHandler: ((...args: any[]) => void) | null = null;
    let localModelsHandler: ((...args: any[]) => void) | null = null;
    let localAuthHandler:
      | ((_event: unknown, payload?: AuthChangedPayload) => void)
      | null = null;

    if (disabled) {
      pendingAssistantIdRef.current = null;
      sessionIdRef.current = null;
      activeSessionRef.current = null;
      setSessionId(null);
      setIsReady(false);
      setIsStreaming(false);
      setInitError(null);
      setModels([]);
      setCurrentModel(null);
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
            "Not running inside Electron. IPC is unavailable — make sure the app was launched via `npm run app:dev` or the Electron wrapper."
          );
        }
        return;
      }

      const prefs = loadPrefs();
      if (cancelled) return;
      setFavorites(prefs.favorites);
      setBlocked(prefs.blocked);

      // 1. Create the PI session FIRST so we have a valid sessionId
      let sid: string | null = null;
      let createdNew = false;
      try {
        let snap: any;

        if (existingSessionId) {
          sid = existingSessionId;
          snap = { success: true, sessionId: sid, models: [], currentModel: null, providers: {} };
        } else {
          const channel = sessionCreateChannelFor(sessionType);
          snap = await ipc.invoke(channel);
          sid = snap.sessionId;
          createdNew = true;
        }

        // If unmounted while awaiting session-create, dispose what we just made.
        if (cancelled) {
          if (sid && createdNew) {
            ipc.invoke("pi:session-destroy", { sessionId: sid }).catch(() => {});
          }
          return;
        }

        sessionIdRef.current = sid;
        setSessionId(sid);
        // Only own (and therefore destroy on unmount) sessions we created.
        if (createdNew) activeSessionRef.current = sid;

        if (!snap.success) {
          setInitError(
            snap.error || "PI session could not start. Configure an API key in Settings → AI Provider."
          );
          return;
        }

        if (createdNew && sid) {
          snap = await applyPreferredModel(ipc, sid, snap);
        }

        setIsReady(true);
        setInitError(null);
        setModels(normalizeModels(snap.models));
        setCurrentModel(normalizeCurrentModel(snap.currentModel));
        setAuthProviders(snap.providers ?? {});
      } catch (e: any) {
        if (!cancelled) setInitError(`PI init failed: ${e.message ?? String(e)}`);
        return;
      }

      // 2. Wire up the event listener — but only if we're still alive.
      if (cancelled) return;

      const handler = buildEventHandler();
      localHandler = handler;
      ipc.on("pi:event", handler);

      // Cross-instance model sync: when any panel broadcasts a model
      // change, the main process emits 'pi:models-changed'. Every hook
      // instance refreshes so currentModel stays consistent everywhere.
      const modelsHandler = () => {
        if (cancelled) return;
        refreshModels();
      };
      localModelsHandler = modelsHandler;
      ipc.on("pi:models-changed", modelsHandler);

      // API-key changes invalidate every existing PI session. The main
      // process destroys them, then each mounted hook recreates the session
      // type it owns so visible chat/Docs Area panels do not keep stale IDs.
      const authHandler = async (_event: unknown, payload?: AuthChangedPayload) => {
        if (cancelled || !ipc) return;

        if (deltaTimerRef.current) {
          clearTimeout(deltaTimerRef.current);
          deltaTimerRef.current = null;
        }
        deltaBufferRef.current = null;

        activeSessionRef.current = null;
        sessionIdRef.current = null;
        pendingAssistantIdRef.current = null;
        setSessionId(null);
        setIsReady(false);
        setIsStreaming(false);
        setSessionStats(null);
        setContextUsage(null);
        setModels(normalizeModels(payload?.models));
        setCurrentModel(normalizeCurrentModel(payload?.currentModel));
        setAuthProviders(payload?.providers ?? {});

        const channel = sessionCreateChannelFor(sessionType);

        try {
          let snap = (await ipc.invoke(channel)) as PiSnapshotResult;
          const newSid = snap.sessionId;

          if (cancelled) {
            if (newSid) {
              ipc.invoke("pi:session-destroy", { sessionId: newSid }).catch(() => {});
            }
            return;
          }

          if (!snap.success || !newSid) {
            setInitError(
              snap.error || "PI session could not restart after the API key changed."
            );
            return;
          }

          snap = await applyPreferredModel(ipc, newSid, snap);

          sessionIdRef.current = snap.sessionId ?? newSid;
          activeSessionRef.current = snap.sessionId ?? newSid;
          setSessionId(snap.sessionId ?? newSid);
          setIsReady(true);
          setInitError(null);
          setModels(normalizeModels(snap.models ?? payload?.models));
          setCurrentModel(
            normalizeCurrentModel(snap.currentModel ?? payload?.currentModel)
          );
          setAuthProviders(snap.providers ?? payload?.providers ?? {});
        } catch (e: unknown) {
          if (!cancelled) {
            const message = e instanceof Error ? e.message : String(e);
            setInitError(`PI restart failed after API key change: ${message}`);
          }
        }
      };
      localAuthHandler = authHandler;
      ipc.on("pi:auth-changed", authHandler);

      try {
        await refreshCommands();
      } catch (_) {}
    };

    init();

    return () => {
      cancelled = true;

      if (deltaTimerRef.current) {
        clearTimeout(deltaTimerRef.current);
        deltaTimerRef.current = null;
      }
      deltaBufferRef.current = null;
      pendingAssistantIdRef.current = null;

      // Remove THIS run's listeners (and only these — sibling hook
      // instances have their own handlers registered separately).
      if (ipc && localHandler) {
        ipc.removeListener("pi:event", localHandler);
      }
      if (ipc && localModelsHandler) {
        ipc.removeListener("pi:models-changed", localModelsHandler);
      }
      if (ipc && localAuthHandler) {
        ipc.removeListener("pi:auth-changed", localAuthHandler);
      }
      // Destroy whatever session this hook currently owns (init's
      // creation, or a later restart()'s replacement).
      const ownedSid = activeSessionRef.current;
      if (ipc && ownedSid) {
        ipc.invoke("pi:session-destroy", { sessionId: ownedSid }).catch(() => {});
        activeSessionRef.current = null;
      }
    };
  }, [
    disabled,
    existingSessionId,
    sessionType,
    applyPreferredModel,
    buildEventHandler,
    refreshCommands,
    refreshModels,
  ]);

  /* ================================================================ */
  /*  Return                                                          */
  /* ================================================================ */
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

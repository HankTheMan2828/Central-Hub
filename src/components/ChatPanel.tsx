"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { MarkdownContent } from "@/lib/markdown";
import {
  MessageSquare,
  FileText,
  Image as ImageIcon,
  FileUp,
  Clipboard,
  Mic,
  Send,
  X,
  Square,
  Terminal,
  FileCode,
  AlertTriangle,
  Loader2,
  Cpu,
  Check,
  RefreshCw,
  ChevronDown,
  Search,
  Star,
  Ban,
  FolderOpen,
  Eye,
  EyeOff,
  Key,
  Maximize2,
} from "lucide-react";
import {
  usePiChat,
  type ChatMessage,
  type SessionStatsData,
  type ContextUsageData,
  type CurrentModel,
  type PiModel,
} from "@/hooks/usePiChat";
import { useSTT } from "@/hooks/useSTT";
import type { ChatHistoryEntry } from "@/hooks/useChatHistory";

/* ------------------------------------------------------------------ */
/*  Data types                                                        */
/* ------------------------------------------------------------------ */
interface PasteBox {
  id: string;
  title: string;
  content: string;
}

interface SentContextItem {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  charCount: number;
}

interface ClipboardItem {
  id: string;
  text: string;
  timestamp: number;
}

interface DocumentItem {
  id: string;
  name: string;
  path: string;
  timestamp: number;
}

interface VoiceItem {
  id: string;
  name: string;
  path: string;
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
let nextId = 1;
const uid = () => String(nextId++);

function modelKey(m: { provider: string; id: string }) {
  return `${m.provider}:${m.id}`;
}

function titleFromPrompt(text: string) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^\/\S+\s*/, "")
    .trim();
  if (!cleaned) return "New chat";
  const words = cleaned.split(" ").slice(0, 5);
  const title = words.join(" ").replace(/[.,!?;:]+$/g, "");
  return title.slice(0, 40) || "New chat";
}

/* ------------------------------------------------------------------ */
/*  ChatPanel — one per tab, owns its own usePiChat + PI session      */
/* ------------------------------------------------------------------ */
export interface ChatPanelMetrics {
  sessionStats: SessionStatsData | null;
  contextUsage: ContextUsageData | null;
  currentModel: CurrentModel | null;
  models: PiModel[];
  isReady: boolean;
  hasMessages: boolean;
}

interface ChatPanelProps {
  tabId: string;
  isActive: boolean;
  onStartNew: () => void;
  onMetricsChange?: (tabId: string, metrics: ChatPanelMetrics) => void;
  onSaveHistory?: (entryId: string, messages: ChatMessage[]) => string;
  resumeEntry?: ChatHistoryEntry | null;
  onResumeHandled?: () => void;
  onTitleChange?: (tabId: string, title: string) => void;
  onHistoryTitleChange?: (entryId: string, title: string) => void;
}

export function ChatPanel({
  tabId,
  isActive,
  onStartNew,
  onMetricsChange,
  onSaveHistory,
  resumeEntry,
  onResumeHandled,
  onTitleChange,
  onHistoryTitleChange,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chat = usePiChat({ sessionType: "plain" });

  /* For Plain Chat: a single user question can produce multiple tool
   * messages (e.g. the model loops `weather` 5x before answering). The
   * desired UX is one tiny "Used <tool>" line ABOVE the assistant bubble
   * for that turn, deduplicated by tool name. We reorder + dedupe at
   * render time so the underlying message log stays accurate. */
  const renderMessages = useMemo(() => {
    const out: ChatMessage[] = [];
    for (let i = 0; i < chat.messages.length; i++) {
      const msg = chat.messages[i];
      if (msg.role !== "assistant") {
        out.push(msg);
        continue;
      }
      // Collect any tool messages following this assistant bubble until we
      // hit the next user/assistant message (or run out). Those tools all
      // belong to this assistant turn — render them above the bubble,
      // deduped by toolName, with isToolError sticky.
      const tools: ChatMessage[] = [];
      let j = i + 1;
      while (j < chat.messages.length && chat.messages[j].role === "tool") {
        tools.push(chat.messages[j]);
        j++;
      }
      const seen = new Map<string, ChatMessage>();
      for (const t of tools) {
        const key = t.toolName ?? "_";
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, t);
        } else if (!existing.isToolError && t.isToolError) {
          // Promote to error variant if any call of the same tool errored.
          seen.set(key, { ...existing, isToolError: true });
        }
      }
      for (const dedup of seen.values()) out.push(dedup);
      out.push(msg);
      i = j - 1;
    }
    return out;
  }, [chat.messages]);

  /* ---- paste boxes ---- */
  const [pasteBoxes, setPasteBoxes] = useState<PasteBox[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  /* ---- sent context history ---- */
  const [sentContextItems, setSentContextItems] = useState<SentContextItem[]>([]);
  const historyEntryIdRef = useRef("");
  const lastHistorySignatureRef = useRef("");
  const resumeContextRef = useRef<string | null>(null);
  const resumedEntryIdRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);
  const wasStreamingForTitleRef = useRef(false);
  const titleGeneratedRef = useRef(false);
  const provisionalTitleRef = useRef(false);

  /* ---- autocomplete ---- */
  const [acOpen, setAcOpen] = useState(false);
  const [acIndex, setAcIndex] = useState(0);
  const [acMatches, setAcMatches] = useState<typeof chat.commands>([]);
  const [acBase, setAcBase] = useState("");

  /* ---- model dropdown ---- */
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  /* ---- STT ---- */
  const [audioLevels, setAudioLevels] = useState<number[]>(
    new Array(32).fill(0.05)
  );
  const [draftText, setDraftText] = useState("");

  /* ---- confirm start-new ---- */
  const [confirmNewChat, setConfirmNewChat] = useState(false);

  /* ---- Brave key state (keep local for now, could be lifted) ---- */
  const [braveKey, setBraveKey] = useState("");
  const [showBraveKey, setShowBraveKey] = useState(false);
  const [braveSaving, setBraveSaving] = useState(false);
  const [braveSaved, setBraveSaved] = useState(false);
  const [braveConfigured, setBraveConfigured] = useState(false);
  const [braveError, setBraveError] = useState<string | null>(null);

  /* ---- API key ---- */
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  /* ================================================================ */
  /*  Scroll anchor                                                   */
  /* ================================================================ */
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastScrollRef.current < 150) return;
    lastScrollRef.current = now;
    const el = scrollAnchorRef.current;
    if (el) {
      el.scrollIntoView({
        behavior: chat.isStreaming ? "auto" : "smooth",
      });
    }
  }, [chat.messages, chat.isStreaming, isActive]);

  /* ================================================================ */
  /*  Report metrics to parent so right column can display them       */
  /* ================================================================ */
  useEffect(() => {
    if (!onMetricsChange) return;
    onMetricsChange(tabId, {
      sessionStats: chat.sessionStats,
      contextUsage: chat.contextUsage,
      currentModel: chat.currentModel,
      models: chat.models,
      isReady: chat.isReady,
      hasMessages: chat.messages.length > 0,
    });
  }, [
    tabId,
    onMetricsChange,
    chat.sessionStats,
    chat.contextUsage,
    chat.currentModel,
    chat.models,
    chat.isReady,
    chat.messages.length,
  ]);

  useEffect(() => {
    if (!resumeEntry) return;
    if (resumeEntry.id === resumedEntryIdRef.current) return;
    resumedEntryIdRef.current = resumeEntry.id;
    const transcript = resumeEntry.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
      )
      .join("\n\n");
    resumeContextRef.current = `--- Prior conversation (resume context) ---\n${transcript}\n--- End prior conversation ---\n\nContinue from where we left off. The user's next message follows.`;
    historyEntryIdRef.current = resumeEntry.id;
    lastHistorySignatureRef.current = "";
    titleGeneratedRef.current = false;
    provisionalTitleRef.current = true;
    chat.restart().then(() => {
      chat.restoreMessages(resumeEntry.messages);
      onResumeHandled?.();
    });
  }, [resumeEntry, chat, onResumeHandled]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = chat.isStreaming;
    if (!wasStreaming || chat.isStreaming) return;
    if (!onSaveHistory || chat.messages.length === 0) return;
    if (!chat.messages.some((m) => m.role === "user")) return;

    const signature = JSON.stringify(
      chat.messages.map((m) => [m.id, m.role, m.content, m.isStreaming])
    );
    if (signature === lastHistorySignatureRef.current) return;
    lastHistorySignatureRef.current = signature;

    const savedId = onSaveHistory(historyEntryIdRef.current, chat.messages);
    if (savedId && savedId !== historyEntryIdRef.current) {
      historyEntryIdRef.current = savedId;
    }
  }, [chat.isStreaming, chat.messages, onSaveHistory]);

  useEffect(() => {
    const wasStreaming = wasStreamingForTitleRef.current;
    wasStreamingForTitleRef.current = chat.isStreaming;
    if (titleGeneratedRef.current || !onTitleChange || !wasStreaming || chat.isStreaming) {
      return;
    }

    const userMessage = chat.messages.find((m) => m.role === "user");
    const assistantMessage = chat.messages.find(
      (m) => m.role === "assistant" && !m.isStreaming
    );
    if (!userMessage || !assistantMessage) return;

    titleGeneratedRef.current = true;
    let ipc: { invoke: (channel: string, args: unknown) => Promise<unknown> } | null =
      null;
    try {
      ipc = (0, eval)("require")("electron").ipcRenderer;
    } catch {}
    ipc
      ?.invoke("pi:generate-title", {
        userMessage: userMessage.content,
        assistantMessage: assistantMessage.content,
      })
      .then((result) => {
        if (
          typeof result !== "object" ||
          result === null ||
          !("success" in result) ||
          !("title" in result) ||
          result.success !== true ||
          typeof result.title !== "string"
        ) {
          return;
        }
        onTitleChange(tabId, result.title);
        if (historyEntryIdRef.current) {
          onHistoryTitleChange?.(historyEntryIdRef.current, result.title);
        }
      })
      .catch(() => {});
  }, [
    chat.isStreaming,
    chat.messages,
    onHistoryTitleChange,
    onTitleChange,
    tabId,
  ]);

  /* ================================================================ */
  /*  Handlers                                                        */
  /* ================================================================ */
  const insertAtCursor = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const ta = textareaRef.current;
    const domValue = ta?.value ?? "";
    const start = ta?.selectionStart ?? domValue.length;
    const end = ta?.selectionEnd ?? domValue.length;

    setDraftText((current) => {
      const value = domValue || current;
      const safeStart = Math.min(start, value.length);
      const safeEnd = Math.min(end, value.length);
      const before = value.slice(0, safeStart);
      const after = value.slice(safeEnd);
      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
      const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
      const insertion =
        (needsLeadingSpace ? " " : "") +
        cleanText +
        (needsTrailingSpace || after.length === 0 ? " " : "");
      const next = before + insertion + after;
      const nextCursor = before.length + insertion.length;

      requestAnimationFrame(() => {
        const input = textareaRef.current;
        if (!input) return;
        input.focus();
        input.selectionStart = input.selectionEnd = nextCursor;
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 400) + "px";
      });

      return next;
    });
  }, []);

  const stt = useSTT({
    onPartial: insertAtCursor,
    onLevels: setAudioLevels,
  });

  const sttTitle =
    stt.status === "transcribing"
      ? "Transcribing"
      : stt.status === "loading" || stt.status === "downloading"
      ? "Preparing local fallback"
      : stt.status === "error"
      ? "Speech error"
      : "Listening";

  const sttBackendLabel =
    stt.backend === "cloud"
      ? "OpenRouter"
      : stt.backend === "fallback"
      ? "OpenRouter -> local"
      : stt.backend === "local"
      ? "Local Whisper"
      : "Speech";

  const sttDetail =
    stt.status === "downloading"
      ? `${stt.downloadFile ?? "local model"} (${stt.progress}%)`
      : stt.status === "loading"
      ? "Loading local Whisper fallback"
      : stt.status === "error"
      ? stt.errorMessage ?? "Unknown speech error"
      : stt.lastTranscript
      ? `Last: ${stt.lastTranscript}`
      : stt.lastMessage ?? "Speak naturally; text will appear in the input below.";

  const sttBars = audioLevels.map((_, i, arr) => {
    const half = Math.ceil(arr.length / 2);
    const sourceIndex = i < half ? half - 1 - i : i - half;
    const mirroredLevel = arr[sourceIndex] ?? 0.05;
    const center = (arr.length - 1) / 2;
    const distanceFromCenter = Math.abs(i - center) / center;
    const centerWeight = 0.18 + Math.pow(1 - distanceFromCenter, 1.8) * 0.95;
    return Math.max(0.04, mirroredLevel * centerWeight);
  });

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    setDraftText(e.currentTarget.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 400) + "px";
      updateAutocomplete();
    }
  };

  const updateAutocomplete = () => {
    const el = textareaRef.current;
    if (!el) return;
    const val = el.value;
    const pos = el.selectionStart;
    let start = pos;
    while (
      start > 0 &&
      val[start - 1] !== "/" &&
      val[start - 1] !== " " &&
      val[start - 1] !== "\n"
    ) {
      start--;
    }
    if (start > 0 && val[start - 1] === "/") {
      start--;
      const query = val.slice(start, pos).toLowerCase();
      const matches = chat.commands.filter((c) =>
        c.name.toLowerCase().includes(query.slice(1))
      );
      if (matches.length > 0) {
        setAcMatches(matches);
        setAcBase(val.slice(0, start));
        setAcIndex(0);
        setAcOpen(true);
        return;
      }
    }
    setAcOpen(false);
  };

  const selectAutocomplete = (index: number) => {
    const el = textareaRef.current;
    if (!el || index < 0 || index >= acMatches.length) return;
    const cmd = "/" + acMatches[index].name;
    const pos = el.selectionStart;
    const val = el.value;
    let start = pos;
    while (
      start > 0 &&
      val[start - 1] !== "/" &&
      val[start - 1] !== " " &&
      val[start - 1] !== "\n"
    ) {
      start--;
    }
    if (start > 0 && val[start - 1] === "/") start--;
    const before = val.slice(0, start);
    const after = val.slice(pos);
    const next = before + cmd + " " + after;
    const newPos = before.length + cmd.length + 1;
    setDraftText(next);
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.selectionStart = input.selectionEnd = newPos;
      input.focus();
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 400) + "px";
    });
    setAcOpen(false);
  };

  const addPasteBox = () => {
    setPasteBoxes((prev) => [...prev, { id: uid(), title: "", content: "" }]);
  };

  const updatePasteBox = (
    id: string,
    field: "title" | "content",
    value: string
  ) =>
    setPasteBoxes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );

  const requestRemovePasteBox = (id: string) => setConfirmRemoveId(id);
  const cancelRemovePasteBox = () => setConfirmRemoveId(null);

  const confirmRemovePasteBox = (id: string) => {
    setPasteBoxes((prev) => prev.filter((p) => p.id !== id));
    setConfirmRemoveId(null);
  };

  const handleImageClick = () => imageInputRef.current?.click();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      chat.attachImages(e.target.files);
      e.target.value = "";
    }
  };

  /* ---- API key handlers ---- */
  const handleSaveApiKey = useCallback(async () => {
    if (!openRouterKey.trim()) return;
    setSavingKey(true);
    setKeySaved(false);
    try {
      await chat.setApiKey("openrouter", openRouterKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 3000);
    } catch (e: unknown) {
      console.error("Failed to save API key:", e);
    } finally {
      setSavingKey(false);
    }
  }, [openRouterKey, chat.setApiKey]);

  const handleSelectModel = useCallback(
    async (model: { provider: string; id: string }) => {
      setModelDropdownOpen(false);
      setModelSearch("");
      try {
        await chat.setModel(model.provider, model.id);
      } catch (e: unknown) {
        console.error("Failed to set model:", e);
      }
    },
    [chat.setModel]
  );

  /* ---- Brave key ---- */
  const braveInvoke = useCallback(
    async (channel: string, ...args: unknown[]) => {
      if (typeof window === "undefined")
        return { success: false, error: "Not running in Electron" };
      try {
        const electron = (0, eval)("require")("electron") as {
          ipcRenderer: {
            invoke: (
              c: string,
              ...a: unknown[]
            ) => Promise<{ success?: boolean; configured?: boolean; error?: string }>;
          };
        };
        return await electron.ipcRenderer.invoke(channel, ...args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: msg };
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem("brave-api-key") ?? ""
          : "";
      if (saved) {
        if (cancelled) return;
        setBraveKey(saved);
        const res = await braveInvoke("brave:set-key", saved);
        if (!cancelled && res?.configured) setBraveConfigured(true);
      } else {
        const res = await braveInvoke("brave:get-status");
        if (!cancelled && res?.configured) setBraveConfigured(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [braveInvoke]);

  const handleSaveBraveKey = useCallback(async () => {
    const trimmed = braveKey.trim();
    if (!trimmed) return;
    setBraveSaving(true);
    setBraveSaved(false);
    setBraveError(null);
    try {
      const res = await braveInvoke("brave:set-key", trimmed);
      if (res?.success) {
        try {
          window.localStorage.setItem("brave-api-key", trimmed);
        } catch {}
        setBraveSaved(true);
        setBraveConfigured(!!res.configured);
        setTimeout(() => setBraveSaved(false), 3000);
      } else {
        setBraveError(res?.error ?? "Unknown error");
      }
    } finally {
      setBraveSaving(false);
    }
  }, [braveKey, braveInvoke]);

  /* ================================================================ */
  /*  doSend                                                          */
  /* ================================================================ */
  const doSend = useCallback(async () => {
    const mainText = draftText.trim();
    const boxesWithContent = pasteBoxes.filter((b) => b.content.trim());
    if (!mainText && boxesWithContent.length === 0) return;
    if (!chat.isReady) return;

    const textAttachments = boxesWithContent.map((b) => ({
      type: "text" as const,
      title: b.title.trim() || "pasted-content",
      content: b.content.trim(),
    }));

    const imageAttachments = (chat.attachedImages ?? []).map((img) => ({
      type: "image" as const,
      title: img.name,
      content: img.data,
      mimeType: img.mimeType,
    }));

    const docAttachments = (chat.attachedDocuments ?? []).map((doc) => ({
      type: "text" as const,
      title: doc.name,
      content: doc.textContent ?? `\u{1F4CE} File: ${doc.path}`,
    }));

    const attachments = [
      ...textAttachments,
      ...imageAttachments,
      ...docAttachments,
    ];

    const newSentItems: SentContextItem[] = boxesWithContent.map((b) => ({
      id: uid(),
      title: b.title.trim() || "untitled",
      content: b.content.trim(),
      timestamp: Date.now(),
      charCount: b.content.trim().length,
    }));
    if (newSentItems.length > 0) {
      setSentContextItems((prev) => [...newSentItems, ...prev]);
    }

    if (boxesWithContent.length > 0) {
      chat.writePasteFiles(boxesWithContent).catch(() => {});
    }

    const hiddenContext = resumeContextRef.current;
    resumeContextRef.current = null;
    if (
      onTitleChange &&
      !provisionalTitleRef.current &&
      !chat.messages.some((message) => message.role === "user")
    ) {
      provisionalTitleRef.current = true;
      onTitleChange(tabId, titleFromPrompt(mainText));
    }
    chat.sendMessage(mainText, attachments, hiddenContext ?? undefined);

    setDraftText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPasteBoxes([]);
    setConfirmRemoveId(null);
    chat.clearImages();
    chat.clearDocuments();
  }, [draftText, pasteBoxes, chat, onTitleChange, tabId]);

  /* ================================================================ */
  /*  startNew for this tab                                           */
  /* ================================================================ */
  const handleStartNew = useCallback(() => {
    chat.restart().catch(() => {});
    titleGeneratedRef.current = false;
    provisionalTitleRef.current = false;
    historyEntryIdRef.current = "";
    lastHistorySignatureRef.current = "";
    setPasteBoxes([]);
    setSentContextItems([]);
    onStartNew();
  }, [chat, onStartNew]);

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <div
      className="h-full min-h-0 flex flex-col gap-2"
      style={{ display: isActive ? undefined : "none" }}
    >
      {/* ---- Messages area ---- */}
      <div className="clouds-chat-messages-panel flex-1 min-h-0 border border-[var(--ch-border)] rounded-sm overflow-hidden flex flex-col">
        {/* ---- Messages header bar ---- */}
        <div className="clouds-chat-header shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)]">
          <span className="clouds-section-title text-[10px] font-bold uppercase tracking-[0.15em] opacity-35">
            Conversation
          </span>
          {chat.messages.length > 0 && !confirmNewChat && (
            <button
              className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] hover:text-[var(--ch-text)] transition-colors rounded-sm text-[10px] uppercase tracking-wider flex items-center gap-1"
              onClick={() => setConfirmNewChat(true)}
              title="Start a new conversation in this tab"
            >
              <RefreshCw className="w-3 h-3" />
              New
            </button>
          )}
          {confirmNewChat && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--ch-error-text)]">Confirm?</span>
              <button
                className="px-2 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={() => {
                  handleStartNew();
                  setConfirmNewChat(false);
                }}
              >
                Yes
              </button>
              <button
                className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={() => setConfirmNewChat(false)}
              >
                No
              </button>
            </div>
          )}
        </div>
        <div className="clouds-chat-scroll flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Init error */}
          {chat.initError && (
            <div className="flex items-start gap-3 p-4 border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm">
              <AlertTriangle className="w-5 h-5 text-[var(--ch-error)] shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[11px] text-[var(--ch-error)] uppercase tracking-wider">
                  Connection Error
                </span>
                <p className="text-[12px] text-[var(--ch-error-text)] leading-relaxed">
                  {chat.initError}
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!chat.initError && chat.messages.length === 0 && (
            <div className="clouds-chat-empty flex-1 flex flex-col items-center justify-center gap-2 opacity-30">
              <MessageSquare className="clouds-chat-empty-icon w-10 h-10" />
              <span className="clouds-chat-empty-text text-[11px] uppercase tracking-widest mt-2">
                {chat.isReady ? "Send a message to start" : "Connecting to PI\u2026"}
              </span>
              {!chat.isReady && !chat.initError && (
                <Loader2 className="w-4 h-4 animate-spin mt-1" />
              )}
            </div>
          )}

          {/* Messages — see renderMessages memo: tools are reordered above
              their assistant bubble and deduped per turn. */}
          {renderMessages.map((msg) => {
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] flex flex-col gap-2 items-end">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-1.5 w-full">
                        {msg.attachments
                          .filter((a) => a.type === "text")
                          .map((att, idx) => (
                            <div
                              key={`text-${idx}`}
                              className="border border-[#2a1f10] bg-[#1a150a] rounded-sm overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#332b1a]">
                                <FileText className="w-3 h-3 text-[#CC9933] opacity-60 shrink-0" />
                                <span className="text-[10px] font-mono text-[#CC9933] truncate">
                                  {att.title}.md
                                </span>
                              </div>
                              <div className="px-2.5 py-2 text-[11px] leading-relaxed opacity-40 whitespace-pre-wrap break-all max-h-[80px] overflow-y-auto font-mono">
                                {att.content.length > 200
                                  ? att.content.slice(0, 200) + "\u2026"
                                  : att.content}
                              </div>
                            </div>
                          ))}
                        {msg.attachments
                          .filter((a) => a.type === "image")
                          .map((att, idx) => (
                            <div
                              key={`img-${idx}`}
                              className="border border-[#2a1f10] bg-[#1a150a] rounded-sm overflow-hidden"
                            >
                              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[#332b1a]">
                                <ImageIcon className="w-3 h-3 text-[#CC9933] opacity-60 shrink-0" />
                                <span className="text-[10px] font-mono text-[#CC9933] truncate">
                                  {att.title}
                                </span>
                              </div>
                              {att.content.startsWith("data:") && (
                                <div className="px-2.5 py-2">
                                  <img
                                    src={att.content}
                                    alt={att.title}
                                    className="max-h-[200px] rounded-sm object-contain"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="clouds-chat-message-bubble border border-[var(--ch-border)] bg-[var(--ch-bg-elevated)] px-4 py-2.5 rounded-sm w-fit">
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.role === "assistant") {
              return (
                <div key={msg.id} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-40 ml-1">
                    PI {msg.isStreaming ? "\u2022 responding\u2026" : ""}
                  </span>
                  <div className="clouds-chat-message-bubble border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-4 py-2.5 rounded-sm">
                    {msg.thinking && (
                      <details className="mb-2">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wider opacity-30 hover:opacity-60 transition-opacity select-none">
                          {"Thinking\u2026"}
                        </summary>
                        <p className="mt-1 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ch-text-faint)] italic">
                          {msg.thinking}
                        </p>
                      </details>
                    )}
                    {msg.isStreaming ? (
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content || "\u200B"}
                      </p>
                    ) : (
                      <MarkdownContent
                        content={msg.content}
                        className="markdown-body"
                      />
                    )}
                    {msg.isStreaming && !msg.content && !msg.thinking && (
                      <span className="inline-block w-2 h-4 bg-[var(--ch-text)] animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              );
            }

            if (msg.role === "tool") {
              return (
                <div key={msg.id} className="flex items-center gap-1 ml-1 py-0.5">
                  <span className="text-[10px] opacity-25 italic">
                    Used {msg.toolName?.replace(/_/g, ' ') || 'a tool'}{msg.isToolError ? ' (error)' : ''}
                  </span>
                </div>
              );
            }

            return null;
          })}

          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {/* ---- User Input Area ---- */}
      <div className="clouds-chat-composer shrink-0 border border-[var(--ch-border)] p-2 pl-3 flex flex-col transition-all rounded-sm">
        {/* STT Visualizer */}
        {stt.isRecording && (
          <div className="mb-3 border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-hover)]">
              <Mic className="w-3.5 h-3.5 text-[var(--ch-error)] animate-pulse shrink-0" />
              <div className="min-w-0 flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ch-error)]">
                  {sttTitle}
                </span>
                <span className="text-[10px] text-[var(--ch-text-faint)] truncate">
                  {sttBackendLabel}
                </span>
              </div>
              <button
                className="ml-auto px-2 py-0.5 border border-[var(--ch-error)] text-[var(--ch-error)] hover:bg-[var(--ch-error)]/10 rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={stt.stop}
              >
                Stop
              </button>
            </div>
            <div className="flex items-end justify-center gap-[2px] h-16 px-4 py-2">
              {sttBars.map((level, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-all duration-75 min-h-[2px]"
                  style={{
                    height: `${Math.max(4, level * 60)}px`,
                    background:
                      level > 0.6
                        ? "var(--ch-error)"
                        : level > 0.3
                        ? "var(--ch-warning)"
                        : "var(--ch-success)",
                    opacity: 0.4 + level * 0.6,
                  }}
                />
              ))}
            </div>
            <div className="px-3 py-2 border-t border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)]">
              <p
                className={`text-[12px] leading-relaxed whitespace-pre-wrap break-words italic ${
                  stt.status === "error"
                    ? "text-[var(--ch-error-text)]"
                    : "text-[var(--ch-text-faint)]"
                }`}
              >
                {sttDetail}
              </p>
            </div>
          </div>
        )}

        {/* Paste boxes */}
        {pasteBoxes.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {pasteBoxes.map((box) => (
              <div
                key={box.id}
                className="border border-[var(--ch-text-faint)] bg-[var(--ch-bg-hover)] rounded-sm overflow-hidden"
              >
                <div className="flex items-center gap-2 px-1.5 py-1 border-b border-[var(--ch-border)] bg-[var(--ch-bg-elevated)]">
                  <button
                    className="w-5 h-5 flex items-center justify-center rounded-sm bg-[var(--ch-warning)] hover:brightness-110 text-black font-bold text-[14px] leading-none transition-colors shrink-0"
                    onClick={addPasteBox}
                  >
                    +
                  </button>
                  <Clipboard className="w-3 h-3 opacity-35 shrink-0" />
                  <input
                    type="text"
                    className="flex-1 bg-transparent text-[11px] outline-none placeholder:opacity-25"
                    placeholder="Paste title (optional)\u2026"
                    value={box.title}
                    onChange={(e) =>
                      updatePasteBox(box.id, "title", e.target.value)
                    }
                  />
                  <button
                    className="opacity-30 hover:opacity-80 hover:text-[var(--ch-error)] transition-all shrink-0"
                    onClick={() => requestRemovePasteBox(box.id)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {confirmRemoveId === box.id && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] text-[11px]">
                    <AlertTriangle className="w-3 h-3 text-[var(--ch-error)] shrink-0" />
                    <span className="text-[var(--ch-error-text)]">Discard this paste?</span>
                    <div className="flex gap-1.5 ml-auto">
                      <button
                        className="px-2 py-0.5 border border-[var(--ch-error-border)] text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                        onClick={() => confirmRemovePasteBox(box.id)}
                      >
                        Remove
                      </button>
                      <button
                        className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                        onClick={cancelRemovePasteBox}
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                )}
                <textarea
                  className="w-full bg-transparent resize-none outline-none px-3 py-2 text-[12px] leading-relaxed min-h-[60px] placeholder:opacity-20 font-mono"
                  placeholder="Paste or type text here\u2026"
                  value={box.content}
                  onChange={(e) =>
                    updatePasteBox(box.id, "content", e.target.value)
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>
        )}

        {/* Autocomplete dropdown */}
        {acOpen && acMatches.length > 0 && (
          <div className="relative mb-1">
            <div className="absolute bottom-0 left-0 right-0 border border-[var(--ch-text-faint)] bg-[var(--ch-bg-surface)] rounded-sm shadow-lg z-30 max-h-[180px] overflow-y-auto">
              {acMatches.map((cmd, i) => (
                <button
                  key={cmd.name}
                  className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 transition-colors ${
                    i === acIndex
                      ? "bg-white/[0.08] text-[var(--ch-text)]"
                      : "text-[var(--ch-text-muted)] hover:bg-white/[0.04] hover:text-[var(--ch-text)]"
                  }`}
                  onClick={() => selectAutocomplete(i)}
                  onMouseEnter={() => setAcIndex(i)}
                >
                  <span className="text-[var(--ch-success)] font-mono text-[11px] shrink-0">
                    /{cmd.name}
                  </span>
                  {cmd.description && (
                    <span className="opacity-40 truncate text-[11px]">
                      {cmd.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          onInput={handleInput}
          value={draftText}
          className="clouds-chat-input w-full bg-transparent resize-none outline-none min-h-[50px] overflow-y-auto leading-relaxed"
          placeholder="Type your input here..."
          rows={1}
          style={{ fontSize: "12px" }}
          onKeyDown={(e) => {
            if (acOpen && acMatches.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAcIndex((i) => (i + 1) % acMatches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setAcIndex(
                  (i) => (i - 1 + acMatches.length) % acMatches.length
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectAutocomplete(acIndex);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setAcOpen(false);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              doSend();
            }
          }}
        />

        {/* Attached image previews */}
        {chat.attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {chat.attachedImages.map((img) => (
              <div
                key={img.id}
                className="relative group w-16 h-16 border border-[var(--ch-border)] rounded-sm overflow-hidden shrink-0"
              >
                <img
                  src={img.preview}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
                <button
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                  onClick={() => chat.removeImage(img.id)}
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          type="file"
          ref={imageInputRef}
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={handleImageSelect}
        />

        <div className="clouds-chat-toolbar flex justify-between items-end mt-2 pt-2 border-t border-[var(--ch-border)]">
          <div className="flex gap-2">
            <button
              className={`clouds-chat-icon-button p-2 border rounded-sm transition-colors ${
                chat.attachedImages.length > 0
                  ? "border-[var(--ch-warning)] text-[var(--ch-warning)] bg-[var(--ch-warning)]/10"
                  : "border-[var(--ch-border)] hover:bg-[var(--ch-bg-elevated)] hover:text-[var(--ch-text)]"
              }`}
              title="Attach Image"
              onClick={handleImageClick}
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              className={`clouds-chat-icon-button p-2 border rounded-sm transition-colors ${
                chat.attachedDocuments.length > 0
                  ? "border-[var(--ch-warning)] text-[var(--ch-warning)] bg-[var(--ch-warning)]/10"
                  : "border-[var(--ch-border)] hover:bg-[var(--ch-bg-elevated)] hover:text-[var(--ch-text)]"
              }`}
              title="Attach Document"
              onClick={() => chat.attachDocument()}
            >
              <FileUp className="w-4 h-4" />
            </button>
            <button
              className="clouds-chat-icon-button p-2 border border-[var(--ch-border)] rounded-sm transition-colors hover:bg-[var(--ch-bg-elevated)] hover:text-[var(--ch-text)]"
              title="Paste text as separate context for AI"
              onClick={addPasteBox}
            >
              <Clipboard className="w-4 h-4" />
            </button>
            <button
              className={`clouds-chat-icon-button p-2 border rounded-sm transition-colors relative ${
                stt.isRecording
                  ? "border-[var(--ch-error)] text-[var(--ch-error)] bg-[var(--ch-error)]/10 animate-pulse"
                  : "border-[var(--ch-border)] hover:bg-[var(--ch-bg-elevated)] hover:text-[var(--ch-text)]"
              }`}
              onClick={stt.toggle}
            >
              <Mic className="w-4 h-4" />
              <span
                className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-[var(--ch-bg-base)] ${
                  stt.status === "ready"
                    ? "bg-[var(--ch-success)]"
                    : stt.status === "listening" ||
                      stt.status === "transcribing"
                    ? "bg-[var(--ch-error)] animate-pulse"
                    : stt.status === "loading" ||
                      stt.status === "downloading"
                    ? "bg-[var(--ch-warning)] animate-pulse"
                    : stt.status === "error"
                    ? "bg-[var(--ch-error)]"
                    : "bg-[var(--ch-text-faint)]"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {chat.isStreaming && (
              <button
                className="clouds-chat-send-button px-3 py-2 border border-[var(--ch-error-border)] text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)] transition-colors font-bold flex items-center gap-1.5 rounded-sm text-[10px] uppercase tracking-widest"
                onClick={() => chat.abort()}
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
            {!chat.isReady && !chat.isStreaming && (
              <button
                className="clouds-chat-send-button px-4 py-2 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 transition-colors font-bold flex items-center gap-1.5 rounded-sm text-[10px] uppercase tracking-widest"
                onClick={() => chat.reinit()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Connect
              </button>
            )}
            {chat.isReady && (
              <button
                className="clouds-chat-send-button px-6 py-2 border border-[var(--ch-border)] hover:bg-[var(--ch-bg-elevated)] bg-[var(--ch-bg-page)] transition-colors font-bold flex items-center gap-2 rounded-sm"
                onClick={doSend}
              >
                <span className="uppercase text-[10px] tracking-widest">
                  Send
                </span>
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

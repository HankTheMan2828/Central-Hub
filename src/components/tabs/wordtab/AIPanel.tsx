"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Sparkles,
  Eye,
  Pencil,
  Send,
  Square,
  Cpu,
  ChevronDown,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { usePiChat } from "@/hooks/usePiChat";
import { MarkdownContent } from "@/lib/markdown";
import { htmlToMarkdown } from "./exporters";
import { markdownToHtml } from "./markdownToHtml";

// IPC helper for pushing the live editor contents into main's
// word_read tool cache. Inline because this is the only place that
// needs it; lifting into a shared hook isn't worth the abstraction.
async function pushWordDocToMain(content: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const electron = (0, eval)("require")("electron");
    await electron.ipcRenderer.invoke("pi:word-doc-update", { content });
  } catch {
    // Non-fatal: the AI just sees a stale doc.
  }
}

// Push the current AIPanel mode to main so word_edit knows whether
// it's allowed to run. Read mode disables edits at the tool level.
async function pushWordModeToMain(mode: "read" | "edit"): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const electron = (0, eval)("require")("electron");
    await electron.ipcRenderer.invoke("pi:word-mode-set", { mode });
  } catch {
    // Non-fatal: main defaults to read mode.
  }
}

type Mode = "read" | "edit";

export type AIPanelHandle = {
  hasMessages: () => boolean;
  restart: () => Promise<void>;
};

type Props = {
  getEditor: () => HTMLElement | null;
  onApplyDoc: (html: string) => void;
};

export const AIPanel = forwardRef<AIPanelHandle, Props>(function AIPanel(
  { getEditor, onApplyDoc },
  ref
) {
  const chat = usePiChat({ sessionType: "word" });

  useImperativeHandle(
    ref,
    () => ({
      hasMessages: () => chat.messages.length > 0,
      restart: async () => {
        try {
          await chat.restart();
        } catch {
          // Non-fatal: the user can retry from the panel's own New button.
        }
      },
    }),
    [chat]
  );
  const [mode, setMode] = useState<Mode>("read");
  const [input, setInput] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [confirmNewChat, setConfirmNewChat] = useState(false);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.isStreaming]);

  // Sync mode to main. Runs on mount and on every toggle. word_edit
  // refuses to run while in read mode, gating the capability at the
  // tool layer rather than just nudging via prompt.
  useEffect(() => {
    pushWordModeToMain(mode);
  }, [mode]);

  // Subscribe to word_edit tool results from main. The AI calls word_edit,
  // main updates wordDocCache and fires pi:word-doc-edit; we apply the new
  // markdown to the live editor here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ipcRenderer: {
      on: (ch: string, fn: (...a: unknown[]) => void) => void;
      removeListener: (ch: string, fn: (...a: unknown[]) => void) => void;
    } | null = null;
    try {
      const electron = (0, eval)("require")("electron");
      ipcRenderer = electron.ipcRenderer;
    } catch {
      return;
    }
    if (!ipcRenderer) return;
    const handler = (_event: unknown, payload: { newContent?: string }) => {
      const md = typeof payload?.newContent === "string" ? payload.newContent : "";
      onApplyDoc(markdownToHtml(md));
    };
    ipcRenderer.on("pi:word-doc-edit", handler as (...a: unknown[]) => void);
    return () => {
      ipcRenderer?.removeListener(
        "pi:word-doc-edit",
        handler as (...a: unknown[]) => void
      );
    };
  }, [onApplyDoc]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !chat.isReady || chat.isStreaming) return;
    const editor = getEditor();
    const md = editor ? htmlToMarkdown(editor) : "";

    // Sync the live editor markdown into main so the next word_read
    // tool call returns fresh content. Awaited so the AI never reads
    // a stale snapshot when the user just edited and hit Send.
    await pushWordDocToMain(md);

    // The AI uses word_read / word_edit tools to inspect and modify
    // the document. In edit mode we attach a short hint so the model
    // is nudged toward word_edit; the hint is delivered as context, not
    // prepended to the user's visible message.
    const attachments =
      mode === "edit"
        ? [
            {
              type: "text" as const,
              title: "EditModeHint",
              content:
                'The user is in Edit mode. Use the word_edit tool to apply the requested changes to the document. If the document is empty, use word_edit with old_string="" and new_string set to the full starting content. Keep your chat reply brief; do not paste the document or revised passages into chat.',
            },
          ]
        : [];
    chat.sendMessage(text, attachments);
    setInput("");
  }, [input, chat, getEditor, mode]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // "New" chat: restart() destroys the backend PI session and creates
  // a fresh one of the same type, so the AI starts with no prior
  // history (it will call word_read again to see the current doc).
  const handleStartNew = useCallback(() => {
    chat.restart().catch(() => {});
  }, [chat]);

  const filtered = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    const list = chat.filteredModels;
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [chat.filteredModels, modelSearch]);

  const cost = chat.sessionStats?.cost ?? 0;
  const tokensTotal = chat.sessionStats?.tokens.total ?? 0;

  return (
    <aside className="w-1/4 max-w-[340px] min-w-[260px] h-full border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
          AI Assist
        </span>
        <div className="ml-auto flex items-center border border-[var(--ch-border-subtle)] rounded-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("read")}
            title="Read mode: AI replies in chat. It reads the document via a tool when needed."
            className={`flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-widest font-mono transition-colors ${
              mode === "read"
                ? "bg-[#4CAF50]/10 text-[var(--ch-success)]"
                : "text-[var(--ch-text-faint)] hover:text-[var(--ch-text)]"
            }`}
          >
            <Eye className="w-3 h-3" />
            Read
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            title="Edit mode: AI applies changes via the word_edit tool, one targeted edit at a time."
            className={`flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-widest font-mono transition-colors border-l border-[var(--ch-border-subtle)] ${
              mode === "edit"
                ? "bg-[var(--ch-accent-10)] text-[var(--ch-accent)]"
                : "text-[var(--ch-text-faint)] hover:text-[var(--ch-text)]"
            }`}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>
      </div>

      {/* Conversation bar — mirrors the main ChatPanel "New" UI */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)]">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-35">
          Conversation
        </span>
        {chat.messages.length > 0 && !confirmNewChat && (
          <button
            type="button"
            className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] hover:text-[var(--ch-text)] transition-colors rounded-sm text-[10px] uppercase tracking-wider flex items-center gap-1"
            onClick={() => setConfirmNewChat(true)}
            title="Start a new conversation"
          >
            <RefreshCw className="w-3 h-3" />
            New
          </button>
        )}
        {confirmNewChat && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--ch-error-text)]">Confirm?</span>
            <button
              type="button"
              className="px-2 py-0.5 border border-[#4CAF50]/50 text-[var(--ch-success)] hover:bg-[#1a2a1a] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
              onClick={() => {
                handleStartNew();
                setConfirmNewChat(false);
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
              onClick={() => setConfirmNewChat(false)}
            >
              No
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-b border-[var(--ch-border-subtle)] shrink-0 flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setModelOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] px-2 py-1 rounded-sm hover:bg-white/[0.04] text-left"
          >
            <Cpu className="w-3 h-3 text-[var(--ch-text-faint)] shrink-0" />
            <span
              className={`flex-1 truncate text-[10px] font-mono ${
                chat.currentModel ? "text-[var(--ch-text)]" : "text-[var(--ch-text-faint)]"
              }`}
            >
              {chat.currentModel
                ? chat.currentModel.name
                : chat.isReady
                ? "Select model…"
                : "Connecting…"}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--ch-text-faint)] shrink-0" />
          </button>
          {modelOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => {
                  setModelOpen(false);
                  setModelSearch("");
                }}
              />
              <div className="absolute top-full left-0 right-0 mt-1 z-40 max-h-[280px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl flex flex-col overflow-hidden">
                <input
                  type="text"
                  autoFocus
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Filter models…"
                  className="w-full bg-[var(--ch-bg-inset)] border-b border-[var(--ch-border-subtle)] px-2 py-1.5 text-[10px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none"
                />
                <div className="overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-2 py-3 text-[10px] text-[var(--ch-text-faint)] italic text-center">
                      No models available.
                    </div>
                  ) : (
                    filtered.map((m) => {
                      const isActive =
                        chat.currentModel?.provider === m.provider &&
                        chat.currentModel?.id === m.id;
                      return (
                        <button
                          key={`${m.provider}:${m.id}`}
                          type="button"
                          onClick={async () => {
                            setModelOpen(false);
                            setModelSearch("");
                            try {
                              await chat.setModel(m.provider, m.id);
                            } catch (err) {
                              console.warn("Set model failed:", err);
                            }
                          }}
                          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-mono text-left hover:bg-white/[0.06] ${
                            isActive ? "bg-white/[0.04] text-[var(--ch-accent)]" : "text-[var(--ch-text)]"
                          }`}
                        >
                          <span className="text-[8px] uppercase tracking-widest opacity-50 w-12 truncate shrink-0">
                            {m.provider}
                          </span>
                          <span className="flex-1 truncate">{m.name}</span>
                          {isActive && (
                            <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="text-[9px] font-mono text-[var(--ch-text-faint)] uppercase tracking-widest shrink-0 text-right">
          <div className="text-[var(--ch-success)]">${cost.toFixed(3)}</div>
          <div className="text-[8px]">{tokensTotal.toLocaleString()} tok</div>
        </div>
      </div>

      <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {chat.initError ? (
          <div className="text-[10px] text-[var(--ch-error)] leading-relaxed">
            {chat.initError}
          </div>
        ) : !chat.isReady ? (
          <div className="flex items-center gap-2 text-[10px] text-[var(--ch-text-faint)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            Connecting to PI…
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="text-[10px] text-[var(--ch-text-faint)] leading-relaxed">
            {mode === "read"
              ? "Read mode: ask about the document. The AI reads it on demand via a tool call instead of receiving it with every message."
              : "Edit mode: describe a change. The AI applies it via the word_edit tool, one targeted replacement at a time."}
          </div>
        ) : (
          chat.messages.map((m) => {
            if (m.role === "tool") {
              if (m.toolName === "word_edit") {
                const inFlight = !m.content;
                const failed = !inFlight && m.isToolError;
                return (
                  <div
                    key={m.id}
                    className={`text-[10px] font-mono uppercase tracking-widest rounded-sm px-2 py-1.5 border flex items-center gap-2 ${
                      failed
                        ? "border-[#EF5350]/40 bg-[#EF5350]/[0.06] text-[var(--ch-error)]"
                        : "border-[#FFB347]/30 bg-[#FFB347]/[0.04] text-[var(--ch-accent)]"
                    }`}
                  >
                    {inFlight ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Editing document…
                      </>
                    ) : failed ? (
                      <>
                        <Square className="w-3 h-3" />
                        Edit failed
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        Applied to document
                      </>
                    )}
                  </div>
                );
              }
              if (m.toolName === "word_read") {
                const inFlight = !m.content;
                return (
                  <div
                    key={m.id}
                    className="text-[9px] font-mono uppercase tracking-widest text-[var(--ch-text-faint)] flex items-center gap-1.5 px-1"
                  >
                    {inFlight ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Eye className="w-2.5 h-2.5" />
                    )}
                    {inFlight ? "Reading document…" : "Read document"}
                  </div>
                );
              }
              return null;
            }
            if (m.role === "user") {
              return (
                <div
                  key={m.id}
                  className="text-[11px] leading-relaxed whitespace-pre-wrap break-words rounded-sm px-2 py-1.5 border bg-[var(--ch-accent-5)] border-[#FFB347]/20 text-[var(--ch-text)]"
                >
                  {m.content}
                </div>
              );
            }
            // Assistant: skip empty bubbles (turns that only made tool calls
            // and produced no chat text) so we don't show ghost frames.
            if (!m.content && !m.thinking && !m.isStreaming) return null;
            return (
              <div
                key={m.id}
                className="text-[11px] leading-relaxed rounded-sm px-2 py-1.5 border bg-[var(--ch-bg-surface)] border-[var(--ch-border-subtle)] text-[var(--ch-text)]"
              >
                {m.thinking && (
                  <details className="mb-1">
                    <summary className="cursor-pointer text-[9px] uppercase tracking-widest opacity-40 hover:opacity-70 select-none">
                      Thinking…
                    </summary>
                    <p className="mt-1 text-[10px] whitespace-pre-wrap break-words text-[var(--ch-text-muted)] italic">
                      {m.thinking}
                    </p>
                  </details>
                )}
                {m.isStreaming ? (
                  <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                    {m.content || "\u200B"}
                  </p>
                ) : (
                  <MarkdownContent
                    content={m.content || ""}
                    className="markdown-body"
                  />
                )}
                {m.isStreaming && !m.content && (
                  <span className="inline-block w-1.5 h-3 ml-0.5 bg-[var(--ch-accent)] animate-pulse align-middle" />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-[var(--ch-border-subtle)] shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            mode === "read"
              ? "Ask about the document… (Enter to send)"
              : "Describe a change… (Enter to send)"
          }
          rows={3}
          disabled={!chat.isReady}
          className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm px-2 py-1.5 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50 resize-none disabled:opacity-50"
        />
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
            {mode === "read" ? "Reply in chat" : "Edits via word_edit"}
          </span>
          {chat.isStreaming ? (
            <button
              type="button"
              onClick={() => chat.abort()}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 border border-[#EF5350]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)] transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !chat.isReady}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3 h-3" />
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
});

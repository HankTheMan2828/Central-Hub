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
import { useAiChat, useAiRouteValue } from "@/hooks/useAiChat";
import { MarkdownContent } from "@/lib/markdown";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";
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

/**
 * Pull a revised document out of an assistant reply.
 * Supports <<<DOC...>>> markers and fenced ```markdown / ```md / bare ``` blocks.
 */
function extractRevisedDocument(content: string): string | null {
  const text = content?.trim();
  if (!text) return null;

  const marker = /<<<DOC\s*([\s\S]*?)\s*>>>/i.exec(text);
  if (marker?.[1]?.trim()) return marker[1].trim();

  // Incomplete stream: open <<<DOC without closing >>> yet
  const openMarker = /<<<DOC\s*([\s\S]*)$/i.exec(text);
  if (openMarker?.[1]?.trim() && !/>>>/.test(text.slice(text.indexOf("<<<DOC")))) {
    // Only treat as doc body if it looks substantial (still streaming)
    const partial = openMarker[1].trim();
    if (partial.length >= 8) return partial;
  }

  const fences = [
    ...text.matchAll(/```(?:markdown|md|document)?\s*\r?\n([\s\S]*?)```/gi),
  ];
  if (fences.length > 0) {
    let best = "";
    for (const m of fences) {
      const body = (m[1] || "").trim();
      if (body.length > best.length) best = body;
    }
    // Ignore tiny fences (inline examples); real docs are longer.
    if (best.length >= 8) return best;
  }

  // Incomplete fenced stream: ```markdown ... (no close yet)
  const openFence =
    /```(?:markdown|md|document)?\s*\r?\n([\s\S]*)$/i.exec(text);
  if (openFence?.[1]?.trim() && !text.trimEnd().endsWith("```")) {
    const partial = openFence[1].trim();
    if (partial.length >= 8) return partial;
  }

  return null;
}

/**
 * Remove document payloads from chat display.
 * Keeps normal conversational replies; only hides machine document blocks.
 */
function stripDocumentPayload(content: string): string {
  if (!content) return "";
  let out = content;
  // Closed markers
  out = out.replace(/<<<DOC\s*[\s\S]*?\s*>>>/gi, "");
  // Open marker still streaming
  out = out.replace(/<<<DOC\s*[\s\S]*$/gi, "");
  // Closed fences meant as the document body
  out = out.replace(/```(?:markdown|md|document)\s*\r?\n[\s\S]*?```/gi, "");
  // Long bare fences (likely full doc dumps, not tiny code samples)
  out = out.replace(/```\s*\r?\n([\s\S]*?)```/g, (full, body: string) =>
    (body || "").trim().length >= 80 ? "" : full
  );
  // Open fence still streaming (markdown/md/document tags only)
  out = out.replace(/```(?:markdown|md|document)\s*\r?\n[\s\S]*$/gi, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
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
  const aiRoute = useAiRouteValue();
  const chat = useAiChat({ sessionType: "word" });

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
  const wasStreamingRef = useRef(false);
  const [lastAppliedMsgId, setLastAppliedMsgId] = useState<string | null>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.isStreaming]);

  // Always sync mode to main so PI word_edit is gated correctly.
  // (No-op / non-fatal if not on PI or IPC unavailable.)
  useEffect(() => {
    pushWordModeToMain(mode);
  }, [mode]);

  // Subscribe to word_edit tool results from main (PI applies via IPC).
  // Keep listener always registered so late PI turns still apply after
  // route flickers during hydration.
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

  const applyExtractedDoc = useCallback(
    (markdown: string, sourceMsgId?: string, force = false) => {
      const body = markdown.trim();
      if (!body) return false;
      if (!force && sourceMsgId && lastAppliedMsgId === sourceMsgId) {
        return false;
      }
      onApplyDoc(markdownToHtml(body));
      if (sourceMsgId) setLastAppliedMsgId(sourceMsgId);
      return true;
    },
    [lastAppliedMsgId, onApplyDoc]
  );

  // After a turn finishes in Edit mode, apply any full document the model
  // returned (Grok has no word_edit tool; PI may also dump a fence if the
  // tool wasn't used). Skip if this turn already applied via word_edit.
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = chat.isStreaming;
    if (!wasStreaming || chat.isStreaming) return;
    if (mode !== "edit") return;

    const msgs = chat.messages;
    // Prefer the last non-empty assistant message.
    let lastAsst: (typeof msgs)[number] | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && msgs[i].content?.trim()) {
        lastAsst = msgs[i];
        break;
      }
    }
    if (!lastAsst) return;

    // If PI already ran a successful word_edit this turn, don't re-apply
    // a chat fence on top (could be a short example).
    let sawUser = false;
    let wordEditOk = false;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "user") {
        sawUser = true;
        break;
      }
      if (
        m.role === "tool" &&
        m.toolName === "word_edit" &&
        m.content &&
        !m.isToolError
      ) {
        wordEditOk = true;
      }
    }
    if (wordEditOk && sawUser && aiRoute === "pi") return;

    // Only apply explicit document payloads (markers / doc fences) — never
    // treat a normal conversational reply as the document body.
    const extracted = extractRevisedDocument(lastAsst.content);
    if (extracted) applyExtractedDoc(extracted, lastAsst.id);
  }, [aiRoute, applyExtractedDoc, chat.isStreaming, chat.messages, mode]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !chat.isReady || chat.isStreaming) return;
    const editor = getEditor();
    const md = editor ? htmlToMarkdown(editor) : "";

    // Always keep main's doc cache fresh (PI tools; harmless for Grok).
    await pushWordDocToMain(md);
    await pushWordModeToMain(mode);

    if (aiRoute === "grok-build") {
      const hiddenContext = [
        "You are assisting with a document inside Central Hub Docs Area.",
        mode === "edit"
          ? [
              "Mode: EDIT.",
              "The user has chat AND a separate document page.",
              "When changing the document, put the FULL revised markdown ONLY between these markers (applied to the page; the app hides this block from chat):",
              "<<<DOC",
              "...full revised markdown...",
              ">>>",
              "You MAY also reply normally in chat outside the markers — explain what you changed, ask questions, give notes, discuss the work, etc.",
              "Do not paste the full story/document body outside the markers.",
              "If no document change is needed, just reply in chat with no markers.",
            ].join("\n")
          : "Mode: READ-ONLY. Answer questions about the document. Do not dump the full document unless the user asks.",
        "--- Current document markdown ---",
        md || "(empty document)",
        "--- End document ---",
      ].join("\n");
      chat.sendMessage(text, undefined, hiddenContext);
      setInput("");
      return;
    }

    // PI path: word_read / word_edit tools + edit-mode instruction.
    const attachments =
      mode === "edit"
        ? [
            {
              type: "text" as const,
              title: "EditModeHint",
              content: [
                "The user is in Edit mode.",
                "Change the document with the word_edit tool (preferred). If the tool fails, put the full revised document between <<<DOC and >>> markers.",
                'If the document is empty, call word_edit with old_string="" and new_string set to the full starting content.',
                "You MAY reply normally in chat (explanations, questions, notes about what you changed).",
                "Do NOT paste the full story or long document body into chat — the page is updated from the tool/markers automatically.",
              ].join(" "),
            },
          ]
        : [];
    chat.sendMessage(text, attachments);
    setInput("");
  }, [aiRoute, input, chat, getEditor, mode]);

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
            title="Edit mode: AI changes are applied directly to the document page."
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
          {aiRoute === "grok-build" ? (
            <div className="w-full flex items-center gap-1.5 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] px-2 py-1 rounded-sm text-left">
              <Cpu className="w-3 h-3 text-[var(--ch-text-faint)] shrink-0" />
              <span className="flex-1 truncate text-[10px] font-mono text-[var(--ch-text)]">
                Grok 4.5
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  chat.isReady
                    ? "bg-[var(--ch-success)]"
                    : "bg-[var(--ch-text-faint)]"
                }`}
              />
            </div>
          ) : (
          <button
            type="button"
            onClick={() => setModelOpen((v) => !v)}
            className="clouds-coding-dropdown-button w-full flex items-center gap-1.5 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] px-2 py-1 rounded-sm hover:bg-white/[0.04] text-left"
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
          )}
          {aiRoute === "pi" && modelOpen && (
            <div
              className="fixed inset-0 z-30"
              onClick={() => {
                setModelOpen(false);
                setModelSearch("");
              }}
            />
          )}
          <AnimatedDropdown
            open={aiRoute === "pi" && modelOpen}
            className="clouds-coding-dropdown-panel absolute top-full left-0 right-0 mt-1 z-40 max-h-[280px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl flex flex-col overflow-hidden"
          >
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
                      <span className="flex-1 truncate">{m.name}</span>
                      {isActive && (
                        <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </AnimatedDropdown>
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
            Connecting to {aiRoute === "grok-build" ? "Grok" : "PI"}…
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="text-[10px] text-[var(--ch-text-faint)] leading-relaxed">
            {mode === "read"
              ? "Read mode: ask about the document. The AI reads it on demand."
              : "Edit mode: describe a change. The page updates from the edit; the AI can still talk in chat."}
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
            // Assistant: hide document payloads; keep normal chat replies.
            const raw = m.content || "";
            const extracted =
              mode === "edit" && raw ? extractRevisedDocument(raw) : null;
            const chatOnly =
              mode === "edit" ? stripDocumentPayload(raw) : raw;
            const alreadyApplied = lastAppliedMsgId === m.id;
            const showAppliedChip =
              mode === "edit" &&
              !m.isStreaming &&
              (alreadyApplied || Boolean(extracted));
            // While the model is streaming only the doc block, show progress.
            const showUpdating =
              mode === "edit" &&
              m.isStreaming &&
              !chatOnly.trim() &&
              Boolean(raw.trim());
            const hasVisibleChat =
              Boolean(chatOnly.trim()) ||
              Boolean(m.thinking) ||
              showUpdating ||
              showAppliedChip ||
              (m.isStreaming && !raw.trim());
            if (!hasVisibleChat) return null;

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
                {showUpdating ? (
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--ch-accent)] flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Updating document…
                  </div>
                ) : null}
                {chatOnly.trim() ? (
                  m.isStreaming ? (
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                      {chatOnly}
                    </p>
                  ) : (
                    <MarkdownContent
                      content={chatOnly}
                      className="markdown-body"
                    />
                  )
                ) : m.isStreaming && !showUpdating ? (
                  <span className="inline-block w-1.5 h-3 ml-0.5 bg-[var(--ch-accent)] animate-pulse align-middle" />
                ) : null}
                {showAppliedChip && (
                  <div
                    className={`text-[10px] font-mono uppercase tracking-widest text-[var(--ch-accent)] flex items-center gap-2 ${
                      chatOnly.trim() || showUpdating ? "mt-1.5" : ""
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    Applied to document
                  </div>
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
            {mode === "read"
              ? "Reply in chat"
              : aiRoute === "grok-build"
                ? "Edits apply to page"
                : "Edits via tool / block"}
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

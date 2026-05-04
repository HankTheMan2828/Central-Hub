"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  X,
  Plus,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertCircle,
  History,
  Pin,
  PinOff,
  FileText,
  Settings2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BraveSource {
  title: string;
  url: string;
  description: string;
  age?: string;
  type?: "web" | "news";
  excerpt?: string;
  fetched?: boolean;
  fetchError?: string;
}

type SearchMode = "default" | "premium" | "sources";
type PresentationMode = "summary" | "bullets" | "briefing" | "compare" | "timeline";
type SidebarView = "history" | "pinned" | "note";

interface SearchTabState {
  id: string;
  recordId?: string;
  label: string;
  query: string;
  inputDraft: string;
  aiAnswer: string;
  sources: BraveSource[];
  noteMarkdown: string;
  pinned: boolean;
  mode: SearchMode;
  presentation: PresentationMode;
  status: "idle" | "thinking" | "done" | "error";
  error?: string;
  savedAt: number;
  ranAt?: number;
}

interface SearchRecord {
  id: string;
  label: string;
  query: string;
  aiAnswer: string;
  sources: BraveSource[];
  noteMarkdown: string;
  pinned: boolean;
  mode: SearchMode;
  presentation: PresentationMode;
  createdAt: number;
  updatedAt: number;
}

interface PreviewState {
  content: string;
  status: "loading" | "done" | "error";
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "search-tabs-v1";
const HISTORY_KEY = "search-history-v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TABS = 8;
const MAX_HISTORY = 100;

const MODE_OPTIONS: Array<{ id: SearchMode; label: string }> = [
  { id: "default", label: "Default" },
  { id: "premium", label: "Premium" },
  { id: "sources", label: "Sources Only" },
];

const PRESENTATION_OPTIONS: Array<{ id: PresentationMode; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "bullets", label: "Bullets" },
  { id: "briefing", label: "Briefing" },
  { id: "compare", label: "Compare" },
  { id: "timeline", label: "Timeline" },
];

let tabSeq = 1;
const newId = () => `t${Date.now()}-${tabSeq++}`;

function makeTab(): SearchTabState {
  return {
    id: newId(),
    label: "New search",
    query: "",
    inputDraft: "",
    aiAnswer: "",
    sources: [],
    noteMarkdown: "",
    pinned: false,
    mode: "default",
    presentation: "summary",
    status: "idle",
    savedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/*  IPC helpers                                                        */
/* ------------------------------------------------------------------ */

interface IpcResult {
  success?: boolean;
  error?: string;
  content?: string;
  url?: string;
  sources?: BraveSource[];
  requestId?: string;
  aiAnswer?: string;
  mode?: SearchMode;
  presentation?: PresentationMode;
  data?: { web?: { results?: BraveSource[] } };
}

async function ipcInvoke(channel: string, ...args: unknown[]): Promise<IpcResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron") as {
      ipcRenderer: {
        invoke: (c: string, ...a: unknown[]) => Promise<IpcResult>;
        on: (c: string, cb: (...args: unknown[]) => void) => void;
        off: (c: string, cb: (...args: unknown[]) => void) => void;
      };
    };
    return await electron.ipcRenderer.invoke(channel, ...args);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function openExternal(url: string) {
  if (typeof window === "undefined") return;
  try {
    const electron = (0, eval)("require")("electron") as {
      shell: { openExternal: (u: string) => Promise<void> };
    };
    void electron.shell.openExternal(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getIpcRenderer() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron");
    return electron.ipcRenderer;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function normalizeSearchMode(value: unknown): SearchMode {
  const mode = String(value ?? "default").toLowerCase();
  if (mode === "sources") return "sources";
  if (mode === "premium" || mode === "deep" || mode === "recent") return "premium";
  return "default";
}

function searchModeLabel(mode: SearchMode) {
  if (mode === "premium") return "Premium";
  if (mode === "sources") return "Sources Only";
  return "Default";
}

function loadTabs(): SearchTabState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchTabState[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((t) => t && typeof t.savedAt === "number" && now - t.savedAt < TTL_MS)
      .map((t) => ({
        ...makeTab(),
        ...t,
        noteMarkdown: t.noteMarkdown ?? "",
        pinned: Boolean(t.pinned),
        mode: normalizeSearchMode(t.mode),
        presentation: (t.presentation ?? "summary") as PresentationMode,
      }));
  } catch {
    return [];
  }
}

function saveTabs(tabs: SearchTabState[]) {
  if (typeof window === "undefined") return;
  try {
    const clean = tabs.map((t) => ({
      ...t,
      status: t.status === "thinking" ? ("idle" as const) : t.status,
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* quota */
  }
}

function loadRecords(): SearchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchRecord[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((r) => r && typeof r.updatedAt === "number" && (r.pinned || now - r.updatedAt < TTL_MS))
      .map((r) => ({
        ...r,
        noteMarkdown: r.noteMarkdown ?? "",
        pinned: Boolean(r.pinned),
        mode: normalizeSearchMode(r.mode),
        presentation: (r.presentation ?? "summary") as PresentationMode,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveRecords(records: SearchRecord[]) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const clean = records
      .filter((r) => r.pinned || now - r.updatedAt < TTL_MS)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .slice(0, MAX_HISTORY);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(clean));
  } catch {
    /* quota */
  }
}

function makeRecordLabel(query: string) {
  return query.length > 28 ? query.slice(0, 28) + "\u2026" : query;
}

function makeNoteMarkdown(query: string, answer: string, sources: BraveSource[]) {
  const sourceLines = sources
    .map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`)
    .join("\n");
  return `# ${query}\n\n${answer || "_Sources collected without an AI summary._"}\n\n## Sources\n${sourceLines}`;
}

function formatRecordTime(ms: number) {
  try {
    return new Date(ms).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function loadInitialSearchState(): {
  tabs: SearchTabState[];
  activeId: string;
  records: SearchRecord[];
} {
  const loadedTabs = loadTabs();
  const tabs = loadedTabs.length > 0 ? loadedTabs : [makeTab()];
  return {
    tabs,
    activeId: tabs[0]?.id ?? "",
    records: loadRecords(),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SearchTab() {
  const [initialState] = useState(loadInitialSearchState);
  const [tabs, setTabs] = useState<SearchTabState[]>(initialState.tabs);
  const [activeId, setActiveId] = useState<string>(initialState.activeId);
  const [records, setRecords] = useState<SearchRecord[]>(initialState.records);
  const [sidebarView, setSidebarView] = useState<SidebarView>("history");
  const [preview, setPreview] = useState<Record<number, boolean>>({});
  const [previewContents, setPreviewContents] = useState<
    Record<number, PreviewState>
  >({});
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdsRef = useRef<Map<string, string>>(new Map());

  // Persist
  useEffect(() => {
    saveTabs(tabs);
  }, [tabs]);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  const updateActive = useCallback(
    (patch: Partial<SearchTabState>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, ...patch } : t)),
      );
    },
    [activeId],
  );

  const upsertRecord = useCallback((record: SearchRecord) => {
    setRecords((prev) => {
      const existing = prev.find((r) => r.id === record.id);
      const next = existing
        ? prev.map((r) => (r.id === record.id ? { ...r, ...record } : r))
        : [record, ...prev];
      return next
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
        .slice(0, MAX_HISTORY);
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!active) return;
    const query = active.inputDraft.trim();
    if (!query) return;

    const previousRequestId = requestIdsRef.current.get(activeId);
    if (previousRequestId) {
      void ipcInvoke("ai:search:stop", { requestId: previousRequestId });
    }

    const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const recordId = active.recordId ?? `r${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdsRef.current.set(activeId, requestId);
    setPreview({});
    setPreviewContents({});

    updateActive({
      query,
      aiAnswer: "",
      sources: [],
      noteMarkdown: "",
      recordId,
      status: "thinking",
      error: undefined,
      ranAt: Date.now(),
    });

    try {
      const res = await ipcInvoke("ai:search:start", {
        requestId,
        query,
        mode: active.mode,
        presentation: active.presentation,
      });
      if (!res?.success) {
        updateActive({
          status: "error",
          error: res?.error ?? "AI search failed",
        });
        return;
      }

      const label = makeRecordLabel(query);
      const sources = res.sources ?? [];
      const aiAnswer = res.aiAnswer ?? "";
      const noteMarkdown = active.query === query && active.noteMarkdown?.trim()
        ? active.noteMarkdown
        : makeNoteMarkdown(query, aiAnswer, sources);
      const now = Date.now();
      const record: SearchRecord = {
        id: recordId,
        label,
        query,
        aiAnswer,
        sources,
        noteMarkdown,
        pinned: active.pinned,
        mode: res.mode ?? active.mode,
        presentation: res.presentation ?? active.presentation,
        createdAt: now,
        updatedAt: now,
      };
      upsertRecord(record);

      if (res.aiAnswer) {
        updateActive({
          aiAnswer,
          status: "done",
          sources,
          noteMarkdown,
          label,
          recordId,
          savedAt: now,
        });
      } else {
        updateActive({
          sources,
          aiAnswer,
          noteMarkdown,
          status: "done",
          label,
          recordId,
          savedAt: now,
        });
      }
    } catch (e) {
      updateActive({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [active, activeId, updateActive, upsertRecord]);

  /* ---------- AI streaming listener ---------- */

  type AiStreamPayload = {
    requestId: string;
    event?: {
      type: string;
      message?: { content?: unknown[] };
      assistantMessageEvent?: {
        type: string;
        delta?: string;
      };
    };
  };

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    const handler = (_evt: unknown, ...args: unknown[]) => {
      const payload = args[0] as AiStreamPayload | undefined;
      if (!payload) return;
      const { requestId, event } = payload;

      let tabId: string | undefined;
      for (const [tid, rid] of requestIdsRef.current) {
        if (rid === requestId) {
          tabId = tid;
          break;
        }
      }
      if (!tabId) return;

      const ame = event?.assistantMessageEvent;
      if (ame?.type === "text_delta" && ame.delta) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            return { ...t, aiAnswer: (t.aiAnswer || "") + ame.delta };
          }),
        );
      }

      if (event?.type === "agent_end") {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            return t.status === "thinking" ? { ...t, status: "done" as const } : t;
          }),
        );
        requestIdsRef.current.delete(tabId);
      }
    };

    ipc.on("ai:search:stream", handler);
    return () => {
      ipc.off("ai:search:stream", handler);
    };
  }, []);

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) return;
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [tabs.length]);

  const closeTab = useCallback(
    (id: string) => {
      const requestId = requestIdsRef.current.get(id);
      if (requestId) {
        void ipcInvoke("ai:search:stop", { requestId });
        requestIdsRef.current.delete(id);
      }
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (filtered.length === 0) {
          const t = makeTab();
          setActiveId(t.id);
          return [t];
        }
        if (id === activeId) {
          setActiveId(filtered[filtered.length - 1].id);
        }
        return filtered;
      });
    },
    [activeId],
  );

  const openRecord = useCallback((record: SearchRecord) => {
    const existing = tabs.find((t) => t.recordId === record.id);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const t: SearchTabState = {
      ...makeTab(),
      id: newId(),
      recordId: record.id,
      label: record.label,
      query: record.query,
      inputDraft: record.query,
      aiAnswer: record.aiAnswer,
      sources: record.sources,
      noteMarkdown: record.noteMarkdown,
      pinned: record.pinned,
      mode: normalizeSearchMode(record.mode),
      presentation: record.presentation,
      status: "done",
      savedAt: Date.now(),
      ranAt: record.updatedAt,
    };
    setTabs((prev) => [...prev.slice(Math.max(0, prev.length - MAX_TABS + 1)), t]);
    setActiveId(t.id);
  }, [tabs]);

  const setActiveMode = useCallback((mode: SearchMode) => {
    updateActive({ mode, savedAt: Date.now() });
  }, [updateActive]);

  const setActivePresentation = useCallback((presentation: PresentationMode) => {
    updateActive({ presentation, savedAt: Date.now() });
  }, [updateActive]);

  const toggleActivePinned = useCallback(() => {
    if (!active) return;
    const pinned = !active.pinned;
    const now = Date.now();
    updateActive({ pinned, savedAt: now });
    if (active.recordId) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === active.recordId ? { ...r, pinned, updatedAt: now } : r,
        ),
      );
    }
  }, [active, updateActive]);

  const toggleRecordPinned = useCallback((recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    const pinned = !record.pinned;
    const now = Date.now();
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId ? { ...r, pinned, updatedAt: now } : r,
      ),
    );
    setTabs((prev) =>
      prev.map((t) =>
        t.recordId === recordId ? { ...t, pinned, savedAt: now } : t,
      ),
    );
  }, [records]);

  const updateActiveNote = useCallback((noteMarkdown: string) => {
    if (!active) return;
    const now = Date.now();
    updateActive({ noteMarkdown, savedAt: now });
    if (active.recordId) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === active.recordId ? { ...r, noteMarkdown, updatedAt: now } : r,
        ),
      );
    }
  }, [active, updateActive]);

  /* ---------- Preview on click ---------- */

  const handlePreview = useCallback(
    (resultUrl: string, idx: number) => {
      if (preview[idx]) {
        setPreview((p) => {
          const copy = { ...p };
          delete copy[idx];
          return copy;
        });
        return;
      }

      setPreview((p) => ({ ...p, [idx]: true }));
      setPreviewContents((prev) => ({
        ...prev,
        [idx]: { content: "", status: "loading" },
      }));

      (async () => {
        try {
          const res = await ipcInvoke("web:scrape", { url: resultUrl });
          if (!res?.success) {
            setPreviewContents((prev) => ({
              ...prev,
              [idx]: {
                content: "",
                status: "error",
                error: res?.error ?? "Failed to load",
              },
            }));
            return;
          }
          setPreviewContents((prev) => ({
            ...prev,
            [idx]: {
              content: res.content ?? "",
              status: "done",
            },
          }));
        } catch {
          setPreviewContents((prev) => ({
            ...prev,
            [idx]: {
              content: "",
              status: "error",
              error: "Network error",
            },
          }));
        }
      })();
    },
    [preview],
  );

  /* ---------- Render helpers ---------- */

  const clampDesc: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };

  const renderAnswer = useCallback(
    (text: string, sources: BraveSource[]) => {
      if (!text) return null;

      const parts: React.ReactNode[] = [];
      const lines = text.split("\n");
      let key = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          parts.push(<div key={key++} className="h-1.5" />);
        } else if (
          trimmed.startsWith("### ") ||
          trimmed.startsWith("## ") ||
          trimmed.startsWith("# ")
        ) {
          const headingText = trimmed.replace(/^#+\s*/, "");
          parts.push(
            <p
              key={key++}
              className="text-[12px] font-bold text-[var(--ch-text)] mt-3 mb-1"
            >
              {formatInline(headingText, sources)}
            </p>,
          );
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          parts.push(
            <p
              key={key++}
              className="text-[11px] text-[var(--ch-text-muted)] leading-relaxed pl-3 flex gap-1.5"
            >
              <span className="text-[var(--ch-accent)] shrink-0">*</span>
              <span>{formatInline(trimmed.slice(2), sources)}</span>
            </p>,
          );
        } else {
          parts.push(
            <p
              key={key++}
              className="text-[11px] text-[var(--ch-text-muted)] leading-relaxed"
            >
              {formatInline(trimmed, sources)}
            </p>,
          );
        }
      }

      return parts;
    },
    [],
  );

  const visibleRecords = records.filter((r) => !r.pinned);
  const pinnedRecords = records.filter((r) => r.pinned);

  return (
    <div className="flex-1 flex h-full min-w-[620px] gap-2 overflow-hidden">
      <div className="flex-1 flex flex-col h-full min-w-[360px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
      {/* Header */}
      <header className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <Search className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
          AI Search
        </span>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
          {tabs.length} / {MAX_TABS} tabs
        </span>
      </header>

      {/* Tab strip */}
      <div className="flex items-stretch border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] overflow-x-auto shrink-0">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              className={`group flex items-center gap-1.5 px-3 py-2 border-r border-[var(--ch-border-subtle)] cursor-pointer transition-colors max-w-[200px] shrink-0 ${
                isActive
                  ? "bg-[var(--ch-bg-base)] text-[var(--ch-accent)]"
                  : "text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
              }`}
              onClick={() => setActiveId(t.id)}
            >
              <Search className="w-3 h-3 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider truncate">
                {t.label}
              </span>
              {t.status === "thinking" && (
                <Loader2 className="w-3 h-3 animate-spin text-[var(--ch-warning)] shrink-0" />
              )}
              <button
                className="opacity-30 hover:opacity-100 hover:text-[var(--ch-error)] shrink-0 p-0.5 -mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                aria-label="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        <button
          className="px-2.5 text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] hover:bg-[var(--ch-bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onClick={addTab}
          disabled={tabs.length >= MAX_TABS}
          aria-label="New search tab"
          title="New tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Active tab content */}
      {active && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Search input */}
          <div className="p-3 border-b border-[var(--ch-border-subtle)] flex gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={active.inputDraft}
              onChange={(e) =>
                updateActive({ inputDraft: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Ask anything\u2026"
              autoFocus
              className="flex-1 bg-[var(--ch-bg-elevated)] border border-[var(--ch-border)] text-[12px] px-3 py-2 rounded-sm outline-none focus:border-[var(--ch-accent)] transition-colors font-mono"
            />
            <button
              onClick={handleSearch}
              disabled={
                !active.inputDraft.trim() || active.status === "thinking"
              }
              className="px-4 py-2 border border-[var(--ch-border)] hover:border-[var(--ch-accent)] hover:bg-[var(--ch-accent-5)] transition-colors rounded-sm flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {active.status === "thinking" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] uppercase tracking-widest">
                {active.status === "thinking" ? "Thinking\u2026" : "Search"}
              </span>
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Error */}
            {active.status === "error" && (
              <div className="m-3 p-3 border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-[var(--ch-error)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ch-error)] mb-1">
                    Search failed
                  </div>
                  <p className="text-[11px] text-[var(--ch-error)] opacity-80 font-mono break-all">
                    {active.error}
                  </p>
                  {active.error?.toLowerCase().includes("api key") && (
                    <p className="text-[10px] text-[var(--ch-warning)] mt-2 leading-relaxed">
                      Set your Brave API key in the Settings menu (the gear in
                      the top-left).
                    </p>
                  )}
                  {active.error?.toLowerCase().includes("no handler") && (
                    <p className="text-[10px] text-[var(--ch-warning)] mt-2 leading-relaxed">
                      Restart Electron - main.js handlers do not reload on
                      hot-update.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Idle */}
            {active.status === "idle" && !active.aiAnswer && (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--ch-text-faint)]">
                <Search className="w-8 h-8 mb-3 opacity-40" />
                <span className="uppercase tracking-widest text-[10px]">
                  Ask a question and hit enter
                </span>
              </div>
            )}

            {/* AI Summary */}
            {(active.aiAnswer || active.status === "thinking") && (
              <div className="border-b border-[var(--ch-border-subtle)] px-4 py-3 bg-[var(--ch-bg-inset)]">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3 h-3 text-[var(--ch-accent)]" />
                  <span className="text-[9px] uppercase tracking-widest text-[var(--ch-accent)] opacity-60 font-bold">
                    AI Summary
                  </span>
                  {active.status === "thinking" && !active.aiAnswer && (
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--ch-warning)]" />
                  )}
                  {active.status === "thinking" && active.aiAnswer && (
                    <span className="text-[9px] text-[var(--ch-warning)]">{"Generating\u2026"}</span>
                  )}
                </div>
                <div className="leading-relaxed min-h-[16px]">
                  {active.aiAnswer ? (
                    renderAnswer(active.aiAnswer, active.sources)
                  ) : (
                    <span className="text-[11px] text-[var(--ch-text-faint)] italic">
                      {"Searching\u2026"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Sources */}
            {active.sources.length > 0 && (
              <div>
                <div className="px-4 py-2 border-b border-[var(--ch-border-faint)]">
                  <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
                    Sources ({active.sources.length})
                  </span>
                </div>
                {active.sources.map((r, i) => (
                  <div key={`${r.url}-${i}`} className="border-b border-[var(--ch-border-faint)]">
                    <div
                      className="px-4 py-3 hover:bg-[var(--ch-bg-hover)] transition-colors group cursor-pointer"
                      onClick={() => handlePreview(r.url, i)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold bg-[var(--ch-accent-10)] text-[var(--ch-accent)] border border-[var(--ch-accent)] border-opacity-20">
                              {i + 1}
                            </span>
                            <h4 className="text-[12px] font-bold text-[var(--ch-text)] group-hover:text-[var(--ch-accent)] transition-colors truncate">
                              {r.title}
                            </h4>
                            <button
                              className="shrink-0 p-1 rounded-sm hover:bg-[var(--ch-border-subtle)] transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                openExternal(r.url);
                              }}
                              aria-label="Open in browser"
                              title="Open in browser"
                            >
                              <ExternalLink className="w-3 h-3 text-[var(--ch-text-faint)] group-hover:text-[var(--ch-accent)] transition-colors" />
                            </button>
                          </div>
                          <div className="text-[10px] text-[var(--ch-success)] opacity-70 font-mono truncate mt-0.5">
                            {r.url}
                          </div>
                          {(r.type || r.fetched || r.age) && (
                            <div className="flex items-center gap-1.5 mt-1 text-[8px] uppercase tracking-widest text-[var(--ch-text-faint)]">
                              {r.type && <span>{r.type}</span>}
                              {r.fetched && <span>Page read</span>}
                              {r.age && <span>{r.age}</span>}
                            </div>
                          )}
                          {r.description && (
                            <p
                              className="text-[11px] text-[var(--ch-text-faint)] mt-1 leading-relaxed"
                              style={clampDesc}
                            >
                              {r.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded preview */}
                    {preview[i] && previewContents[i] && (
                      <div className="border-t border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)]">
                        {previewContents[i].status === "loading" && (
                          <div className="px-4 py-3 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ch-warning)]" />
                            <span className="text-[10px] uppercase tracking-widest text-[var(--ch-text-faint)]">
                              {"Loading page\u2026"}
                            </span>
                          </div>
                        )}
                        {previewContents[i].status === "error" && (
                          <div className="px-4 py-3 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--ch-error)] shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ch-error)] mb-1">
                                Preview failed
                              </div>
                              <p className="text-[10px] text-[var(--ch-error)] opacity-80 font-mono break-all">
                                {previewContents[i].error}
                              </p>
                            </div>
                          </div>
                        )}
                        {previewContents[i].status === "done" && (
                          <div className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[9px] uppercase tracking-widest text-[var(--ch-accent)] opacity-60 font-bold">
                                Page Content
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openExternal(r.url);
                                }}
                                className="text-[9px] text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] flex items-center gap-1 transition-colors"
                              >
                                Open full page{" "}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            <div className="text-[var(--ch-text-muted)] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto font-mono text-[10px]">
                              {previewContents[i].content}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Done but empty */}
            {active.status === "done" &&
              !active.aiAnswer &&
              active.sources.length === 0 && (
                <div className="flex flex-1 items-center justify-center py-16 text-[var(--ch-text-faint)] text-[11px] uppercase tracking-widest">
                  No results
                </div>
              )}
          </div>
        </div>
      )}
      </div>

      <aside className="w-[300px] max-w-[32%] min-w-[260px] h-full border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
          <Settings2 className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
            Search Desk
          </span>
          <button
            type="button"
            onClick={toggleActivePinned}
            disabled={!active?.recordId && active?.status !== "done"}
            title={active?.pinned ? "Unpin search" : "Pin search"}
            className="ml-auto p-1 rounded-sm text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] hover:bg-[var(--ch-bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {active?.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="p-2 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] shrink-0 space-y-2">
          <div className="grid grid-cols-3 gap-1">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveMode(option.id)}
                disabled={!active}
                title={`${option.label} search`}
                className={`px-1.5 py-1 border rounded-sm text-[8px] uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  active?.mode === option.id
                    ? "border-[var(--ch-accent)] bg-[var(--ch-accent-10)] text-[var(--ch-accent)]"
                    : "border-[var(--ch-border-subtle)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[8px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
              Present
            </span>
            <select
              value={active?.presentation ?? "summary"}
              onChange={(e) => setActivePresentation(e.target.value as PresentationMode)}
              disabled={!active}
              className="flex-1 min-w-0 bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm px-2 py-1 text-[10px] font-mono text-[var(--ch-text)] focus:outline-none focus:border-[var(--ch-accent)] disabled:opacity-30"
            >
              {PRESENTATION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] shrink-0">
          {[
            { id: "history" as const, icon: History, label: "History" },
            { id: "pinned" as const, icon: Pin, label: "Pinned" },
            { id: "note" as const, icon: FileText, label: "Note" },
          ].map((item) => {
            const Icon = item.icon;
            const selected = sidebarView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSidebarView(item.id)}
                title={item.label}
                className={`py-2 flex items-center justify-center border-r last:border-r-0 border-[var(--ch-border-subtle)] transition-colors ${
                  selected
                    ? "bg-[var(--ch-bg-base)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarView === "history" && (
            <RecordList
              records={visibleRecords}
              empty="No search history yet."
              onOpen={openRecord}
              onTogglePin={toggleRecordPinned}
            />
          )}
          {sidebarView === "pinned" && (
            <RecordList
              records={pinnedRecords}
              empty="No pinned searches yet."
              onOpen={openRecord}
              onTogglePin={toggleRecordPinned}
            />
          )}
          {sidebarView === "note" && (
            <div className="p-3 h-full flex flex-col gap-2">
              <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
                Markdown Note
              </div>
              <textarea
                value={active?.noteMarkdown ?? ""}
                onChange={(e) => updateActiveNote(e.target.value)}
                disabled={!active}
                className="flex-1 min-h-[240px] bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm px-2 py-2 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[var(--ch-accent)] resize-none disabled:opacity-40"
                placeholder="Run a search to create a markdown note."
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightweight inline markdown formatter                              */
/* ------------------------------------------------------------------ */

function RecordList({
  records,
  empty,
  onOpen,
  onTogglePin,
}: {
  records: SearchRecord[];
  empty: string;
  onOpen: (record: SearchRecord) => void;
  onTogglePin: (recordId: string) => void;
}) {
  if (records.length === 0) {
    return (
      <div className="p-4 text-[10px] uppercase tracking-widest text-[var(--ch-text-faint)] text-center">
        {empty}
      </div>
    );
  }

  return (
    <div>
      {records.map((record) => (
        <div
          key={record.id}
          className="w-full px-3 py-2.5 border-b border-[var(--ch-border-faint)] hover:bg-[var(--ch-bg-hover)] transition-colors flex items-start gap-2"
        >
          <button
            type="button"
            onClick={() => onOpen(record)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="flex items-center gap-2">
              {record.pinned && <Pin className="w-3 h-3 text-[var(--ch-accent)] shrink-0" />}
              <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-[var(--ch-text)]">
                {record.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)]">
              <span>{searchModeLabel(record.mode)}</span>
              <span>{record.sources.length} src</span>
              <span className="ml-auto">{formatRecordTime(record.updatedAt)}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onTogglePin(record.id)}
            title={record.pinned ? "Unpin search" : "Pin search"}
            className="mt-0.5 p-1 rounded-sm text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] hover:bg-[var(--ch-bg-base)] shrink-0"
          >
            {record.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      ))}
    </div>
  );
}

function formatInline(text: string, sources: BraveSource[] = []): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const citeMatch = remaining.match(/\[(\d+)\]/);

    let earliest: { type: string; index: number; match: RegExpMatchArray } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      earliest = { type: "bold", index: boldMatch.index, match: boldMatch };
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!earliest || codeMatch.index < earliest.index) {
        earliest = { type: "code", index: codeMatch.index, match: codeMatch };
      }
    }
    if (citeMatch && citeMatch.index !== undefined) {
      if (!earliest || citeMatch.index < earliest.index) {
        earliest = { type: "cite", index: citeMatch.index, match: citeMatch };
      }
    }

    if (!earliest) {
      tokens.push(remaining);
      break;
    }

    if (earliest.index > 0) {
      tokens.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === "bold") {
      tokens.push(
        <strong key={key++} className="text-[var(--ch-text)] font-semibold">
          {earliest.match[1]}
        </strong>,
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === "code") {
      tokens.push(
        <code
          key={key++}
          className="bg-[var(--ch-code-bg)] px-1 py-0.5 rounded text-[var(--ch-accent)] text-[10px]"
        >
          {earliest.match[1]}
        </code>,
      );
      remaining = remaining.slice(
        earliest.index + earliest.match[0].length,
      );
    } else if (earliest.type === "cite") {
      const sourceIndex = Number(earliest.match[1]) - 1;
      const source = sources[sourceIndex];
      tokens.push(
        source ? (
          <button
            key={key++}
            type="button"
            onClick={() => openExternal(source.url)}
            title={source.title}
            className="align-super text-[9px] text-[var(--ch-accent)] hover:underline"
          >
            [{earliest.match[1]}]
          </button>
        ) : (
          <sup key={key++} className="text-[var(--ch-accent)] text-[9px]">
            [{earliest.match[1]}]
          </sup>
        ),
      );
      remaining = remaining.slice(
        earliest.index + earliest.match[0].length,
      );
    }
  }

  return tokens;
}

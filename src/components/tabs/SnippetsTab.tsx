"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Copy,
  Check,
  Trash2,
  Tag as TagIcon,
} from "lucide-react";

type Snippet = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "snippets-v1";
const MAX_SNIPPETS = 500;

function uid() {
  return `snip_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadSnippets(): Snippet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.title === "string" &&
          typeof s.body === "string"
      )
      .map((s) => ({
        id: s.id,
        title: s.title,
        body: s.body,
        tags: Array.isArray(s.tags)
          ? s.tags.filter((t: unknown) => typeof t === "string")
          : [],
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
        updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveSnippets(list: Snippet[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("Failed to save snippets:", err);
  }
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function SnippetsTab() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadSnippets();
    setSnippets(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSnippets(snippets);
  }, [snippets, hydrated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...snippets].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter((s) => {
      const hay = `${s.title}\n${s.body}\n${s.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [snippets, query]);

  const active = useMemo(
    () => snippets.find((s) => s.id === activeId) ?? null,
    [snippets, activeId]
  );

  const handleNew = useCallback(() => {
    if (snippets.length >= MAX_SNIPPETS) return;
    const now = Date.now();
    const fresh: Snippet = {
      id: uid(),
      title: "Untitled snippet",
      body: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    setSnippets((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
  }, [snippets.length]);

  const handleDelete = useCallback(
    (id: string) => {
      setSnippets((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (activeId === id) {
          setActiveId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeId]
  );

  const handleUpdate = useCallback(
    (id: string, patch: Partial<Pick<Snippet, "title" | "body" | "tags">>) => {
      setSnippets((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
        )
      );
    },
    []
  );

  const handleCopy = useCallback(async (snip: Snippet) => {
    try {
      await navigator.clipboard.writeText(snip.body);
      setCopiedId(snip.id);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === snip.id ? null : curr));
      }, 1200);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-w-[400px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
      <header className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
          Snippets
        </span>
        <span className="ml-2 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
          {snippets.length}/{MAX_SNIPPETS}
        </span>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--ch-success)] font-mono">
          Local
        </span>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* LEFT: list */}
        <aside className="w-[260px] shrink-0 border-r border-[var(--ch-border-subtle)] flex flex-col min-h-0">
          <div className="p-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
            <div className="flex-1 relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ch-text-faint)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, body, tags…"
                className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm pl-7 pr-2 py-1.5 text-[11px] text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
              />
            </div>
            <button
              type="button"
              onClick={handleNew}
              disabled={snippets.length >= MAX_SNIPPETS}
              title="New snippet"
              className="shrink-0 w-7 h-7 flex items-center justify-center border border-[var(--ch-border)] rounded-sm text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] hover:border-[#FFB347]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-[11px] text-[var(--ch-text-faint)] italic text-center">
                {snippets.length === 0
                  ? "No snippets yet — click + to create one."
                  : "No matches."}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map((snip) => {
                  const isActive = snip.id === activeId;
                  return (
                    <li key={snip.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(snip.id)}
                        className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                          isActive
                            ? "border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                            : "border-transparent hover:bg-[var(--ch-bg-hover)]"
                        }`}
                      >
                        <div
                          className={`text-[11px] font-mono truncate ${
                            isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text)]"
                          }`}
                        >
                          {snip.title || "Untitled"}
                        </div>
                        <div className="text-[10px] text-[var(--ch-text-faint)] truncate mt-0.5">
                          {snip.body.split("\n")[0] || "(empty)"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[9px] text-[var(--ch-text-faint)] font-mono uppercase tracking-wider">
                          <span>{formatRelative(snip.updatedAt)}</span>
                          {snip.tags.length > 0 && (
                            <>
                              <span className="text-[var(--ch-border)]">·</span>
                              <span className="truncate text-[var(--ch-success)] opacity-70">
                                {snip.tags.slice(0, 3).join(", ")}
                                {snip.tags.length > 3
                                  ? ` +${snip.tags.length - 3}`
                                  : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* RIGHT: editor */}
        <section className="flex-1 flex flex-col min-h-0 min-w-0">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-[var(--ch-text-faint)] text-[12px] italic px-8 text-center">
              Select a snippet, or click + to create one.
            </div>
          ) : (
            <SnippetEditor
              key={active.id}
              snippet={active}
              copied={copiedId === active.id}
              onCopy={() => handleCopy(active)}
              onDelete={() => handleDelete(active.id)}
              onChange={(patch) => handleUpdate(active.id, patch)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

type EditorProps = {
  snippet: Snippet;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onChange: (patch: Partial<Pick<Snippet, "title" | "body" | "tags">>) => void;
};

function SnippetEditor({
  snippet,
  copied,
  onCopy,
  onDelete,
  onChange,
}: EditorProps) {
  const [tagsDraft, setTagsDraft] = useState(snippet.tags.join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTagsDraft(snippet.tags.join(", "));
    setConfirmDelete(false);
  }, [snippet.id, snippet.tags]);

  const commitTags = useCallback(() => {
    const parsed = parseTags(tagsDraft);
    const sameLength = parsed.length === snippet.tags.length;
    const sameContent =
      sameLength && parsed.every((t, i) => t === snippet.tags[i]);
    if (!sameContent) onChange({ tags: parsed });
    setTagsDraft(parsed.join(", "));
  }, [tagsDraft, snippet.tags, onChange]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={snippet.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Snippet title"
          className="flex-1 bg-transparent text-[12px] font-mono text-[var(--ch-accent)] placeholder:text-[var(--ch-text-faint)] focus:outline-none"
        />
        <button
          type="button"
          onClick={onCopy}
          title="Copy body to clipboard"
          className="shrink-0 flex items-center gap-1.5 px-2 py-1 border border-[var(--ch-border)] rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text)] hover:border-[#FFB347]/50 hover:text-[var(--ch-accent)] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--ch-success)]" />
              <span className="text-[var(--ch-success)]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmDelete) onDelete();
            else setConfirmDelete(true);
          }}
          onBlur={() => setConfirmDelete(false)}
          title={confirmDelete ? "Click again to confirm" : "Delete snippet"}
          className={`shrink-0 flex items-center gap-1.5 px-2 py-1 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
            confirmDelete
              ? "border-[var(--ch-error)] text-[var(--ch-error)] bg-[var(--ch-error-bg)]"
              : "border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:border-[#E57373]/50 hover:text-[var(--ch-error)]"
          }`}
        >
          <Trash2 className="w-3 h-3" />
          <span>{confirmDelete ? "Confirm" : "Delete"}</span>
        </button>
      </div>

      <div className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <TagIcon className="w-3 h-3 text-[var(--ch-text-faint)]" />
        <input
          type="text"
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={commitTags}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTags();
            }
          }}
          placeholder="comma, separated, tags"
          className="flex-1 bg-transparent text-[10px] font-mono text-[var(--ch-success)] placeholder:text-[var(--ch-border)] focus:outline-none uppercase tracking-wider"
        />
        <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
          {formatRelative(snippet.updatedAt)}
        </span>
      </div>

      <textarea
        value={snippet.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Write your prompt or snippet here…"
        spellCheck={false}
        className="flex-1 w-full bg-[var(--ch-bg-page)] text-[12px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-border)] p-4 resize-none focus:outline-none leading-relaxed"
      />
    </div>
  );
}

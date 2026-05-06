"use client";

import { useMemo, useState } from "react";
import { FilePlus2, Trash2, Copy as CopyIcon, Search } from "lucide-react";
import type { WordDoc } from "./types";

type Props = {
  docs: WordDoc[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
};

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

export function SavesView({
  docs,
  activeId,
  onOpen,
  onNew,
  onDelete,
  onDuplicate,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.snippet.toLowerCase().includes(q)
    );
  }, [docs, query]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
      <header className="px-3 py-2 border-b border-[var(--ch-border-subtle)] flex flex-wrap items-center gap-2 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
            Saves
          </span>
          <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
            {docs.length} {docs.length === 1 ? "doc" : "docs"}
          </span>
        </div>

        <div className="order-3 w-full min-w-0 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ch-text-faint)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter saves..."
            className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm pl-7 pr-2 py-1 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
          />
        </div>

        <button
          type="button"
          onClick={onNew}
          title="New document"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          New
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-[12px] text-[var(--ch-text-faint)] mb-3">No documents yet.</p>
            <button
              type="button"
              onClick={onNew}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              Create document
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-[11px] text-[var(--ch-text-faint)] italic">
            No documents match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map((doc) => {
              const isActive = doc.id === activeId;
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(doc.id);
                    }
                  }}
                  className={`group relative min-h-[112px] flex flex-col p-3 rounded-sm border cursor-pointer transition-colors text-left focus:outline-none ${
                    isActive
                      ? "border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                      : "border-[var(--ch-border-subtle)] bg-[var(--ch-bg-surface)] hover:border-[#FFB347]/40 hover:bg-[var(--ch-accent-5)] focus:border-[#FFB347]/60"
                  }`}
                >
                  <div
                    className={`text-[12px] font-bold leading-snug line-clamp-2 ${
                      isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text)]"
                    }`}
                  >
                    {doc.title || "Untitled"}
                  </div>
                  <div className="mt-2 flex-1 overflow-hidden text-[10px] text-[var(--ch-text-faint)] leading-relaxed line-clamp-3">
                    {doc.snippet || (
                      <span className="italic text-[var(--ch-text-faint)]">empty document</span>
                    )}
                  </div>
                  <div className="mt-2 text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
                    {formatRelative(doc.updatedAt)}
                  </div>
                  <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-0.5 bg-[#0a0a0a]/95 rounded-sm border border-[var(--ch-border-subtle)]">
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(doc.id);
                      }}
                      className="p-1.5 text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] transition-colors"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          window.confirm(
                            `Delete "${doc.title || "Untitled"}"? This can't be undone.`
                          )
                        ) {
                          onDelete(doc.id);
                        }
                      }}
                      className="p-1.5 text-[var(--ch-text-faint)] hover:text-[var(--ch-error)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

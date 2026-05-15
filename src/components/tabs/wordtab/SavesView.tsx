"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  File,
  FilePlus2,
  FileUp,
  Folder,
  Search,
} from "lucide-react";
import { browse, pickFolder, setWorkingDir } from "./docStore";
import type { BrowseResult, DocEntry } from "./types";

// Extensions the Docs editor can open and render. Files outside this set
// (.obj, .odt, etc.) are hidden because the viewer can't read them.
const VIEWER_EXTS = new Set([
  ".docx",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".rtf",
  ".txt",
]);

type Props = {
  workingDir: string | null;
  refreshKey: number;
  activePath: string | null;
  onWorkingDirChange: (path: string) => void;
  onOpen: (path: string) => void;
  onOpenFromDisk: () => void;
  onNew: () => void;
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

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function SavesView({
  workingDir,
  refreshKey,
  activePath,
  onWorkingDirChange,
  onOpen,
  onOpenFromDisk,
  onNew,
}: Props) {
  const [query, setQuery] = useState("");
  const [listing, setListing] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (path?: string | null) => {
    setLoading(true);
    try {
      const result = await browse(path ?? workingDir ?? undefined);
      setListing(result);
      // Only notify the parent when the resolved path actually differs from
      // the working dir we already know about. Otherwise every refresh fires
      // an unconditional setRefreshSaves in the parent, which re-triggers
      // this effect and produces an infinite browse/render loop.
      if (result.path !== workingDir) {
        onWorkingDirChange(result.path);
      }
    } finally {
      setLoading(false);
    }
  },
    [onWorkingDirChange, workingDir]
  );

  useEffect(() => {
    load(workingDir).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingDir, refreshKey]);

  // Legacy .json doc tiles are hidden — .docx is the user-facing canonical
  // format, surfaced via filteredOthers below. The .json files are kept on
  // disk so existing work isn't lost; they're just no longer shown in the list.
  const filteredDocs: DocEntry[] = [];

  const filteredFolders = useMemo(() => {
    const folders = listing?.folders ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(q));
  }, [listing, query]);

  const filteredOthers = useMemo(() => {
    const others = (listing?.others ?? []).filter((entry) =>
      VIEWER_EXTS.has(entry.ext)
    );
    const q = query.trim().toLowerCase();
    if (!q) return others;
    return others.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [listing, query]);

  const handlePickFolder = async () => {
    const path = await pickFolder(listing?.path ?? workingDir ?? undefined);
    if (path) await load(path);
  };

  const handleBrowse = async (path: string) => {
    await setWorkingDir(path);
    await load(path);
  };

  const currentPath = listing?.path ?? workingDir ?? "";
  const currentFolderName = basename(currentPath) || "Folder";

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
      <header className="px-3 py-2 border-b border-[var(--ch-border-subtle)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)] shrink-0">
            Saves
          </span>

          <button
            type="button"
            onClick={() => {
              if (listing?.parent) handleBrowse(listing.parent).catch(() => {});
            }}
            disabled={!listing?.parent}
            title="Back to parent folder"
            className="shrink-0 h-7 w-7 flex items-center justify-center border border-[var(--ch-border-subtle)] rounded-sm text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--ch-border-subtle)] disabled:hover:text-[var(--ch-text-muted)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              handlePickFolder().catch(() => {});
            }}
            title={`Change working folder (currently ${currentFolderName})`}
            className="min-w-0 flex items-center gap-1.5 px-2 py-1.5 border border-[var(--ch-border-subtle)] rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
          >
            <Folder className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{currentFolderName}</span>
          </button>

          <button
            type="button"
            onClick={onNew}
            title="New document"
            className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            New
          </button>
          <button
            type="button"
            onClick={onOpenFromDisk}
            title="Open a doc from your PC"
            className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border border-[var(--ch-border-subtle)] rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" />
            Open
          </button>
        </div>

        <div className="w-full min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ch-text-faint)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter saves..."
              className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm pl-7 pr-2 py-1 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && !listing ? (
          <div className="text-[11px] text-[var(--ch-text-faint)] italic">
            Loading saves...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredFolders.map((folder) => (
              <button
                key={folder.path}
                type="button"
                onClick={() => {
                  handleBrowse(folder.path).catch(() => {});
                }}
                className="min-h-[74px] flex flex-col p-3 rounded-sm border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-surface)] hover:border-[#FFB347]/40 hover:bg-[var(--ch-accent-5)] transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-[12px] font-bold text-[var(--ch-text)]">
                  <Folder className="w-4 h-4 text-[var(--ch-accent)]" />
                  {folder.name}
                </span>
                <span className="mt-2 text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
                  {folder.docCount} {folder.docCount === 1 ? "doc" : "docs"} -{" "}
                  {formatRelative(folder.updatedAt)}
                </span>
              </button>
            ))}

            {filteredDocs.map((doc) => (
              <DocTile
                key={doc.path}
                doc={doc}
                isActive={doc.path === activePath}
                onOpen={onOpen}
              />
            ))}

            {filteredOthers.map((entry) => {
              const isActive = entry.path === activePath;
              return (
                <div
                  key={entry.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(entry.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(entry.path);
                    }
                  }}
                  title={`Open ${entry.name}`}
                  className={`flex items-center gap-3 p-3 rounded-sm border cursor-pointer focus:outline-none transition-colors ${
                    isActive
                      ? "min-h-[112px] border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                      : "min-h-[64px] border-[var(--ch-border-subtle)] bg-[var(--ch-bg-surface)] hover:border-[#FFB347]/40 hover:bg-[var(--ch-accent-5)] focus:border-[#FFB347]/60"
                  }`}
                >
                  <File
                    className={`w-4 h-4 ${
                      isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text-faint)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[11px] font-mono truncate ${
                        isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text-muted)]"
                      }`}
                    >
                      {entry.name}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
                      {entry.ext || "file"} - {formatRelative(entry.updatedAt)}
                    </div>
                  </div>
                </div>
              );
            })}

            {!filteredFolders.length && !filteredDocs.length && !filteredOthers.length && (
              <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-center">
                <p className="text-[12px] text-[var(--ch-text-faint)] mb-3">
                  No documents in this folder.
                </p>
                <button
                  type="button"
                  onClick={onNew}
                  className="flex items-center gap-1.5 px-3 py-2 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  Create document
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="px-3 py-2 border-t border-[var(--ch-border-subtle)] text-[9px] font-mono text-[var(--ch-text-faint)] truncate">
        {currentPath || "No folder selected"}
      </footer>
    </div>
  );
}

function DocTile({
  doc,
  isActive,
  onOpen,
}: {
  doc: DocEntry;
  isActive: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(doc.path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(doc.path);
        }
      }}
      className={`relative min-h-[112px] flex flex-col p-3 rounded-sm border cursor-pointer transition-colors text-left focus:outline-none ${
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
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
          {formatRelative(doc.updatedAt)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(doc.path);
          }}
          className="px-2 py-1 border border-[var(--ch-border-subtle)] rounded-sm text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
        >
          Open
        </button>
      </div>
    </div>
  );
}

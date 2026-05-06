"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WordSubTabId } from "../LeftNav";
import { EditorView } from "./wordtab/EditorView";
import { SavesView } from "./wordtab/SavesView";
import { AIPanel, type AIPanelHandle } from "./wordtab/AIPanel";
import {
  backupDoc,
  createDoc,
  deleteDoc,
  duplicateDoc,
  getLatestBackupForDoc,
  listDocs,
  loadStore,
  saveStore,
  setActive,
  updateDoc,
} from "./wordtab/docStore";
import type { DocStoreState } from "./wordtab/types";
import {
  exportDoc,
  htmlToMarkdown,
  type ExportFormat,
} from "./wordtab/exporters";

const SAVE_DEBOUNCE_MS = 600;
const DEFAULT_PAGE_LAYOUT_ID = "letter";
const DEFAULT_PAGE_COLOR_ID = "default";

async function pushWordDocToMain(content: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const electron = (0, eval)("require")("electron");
    await electron.ipcRenderer.invoke("pi:word-doc-update", { content });
  } catch {
    // Non-fatal: the AI panel will resync before the next message.
  }
}

function emptyState(): DocStoreState {
  return { version: 2, activeId: null, docs: {} };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleString();
}

function cleanEditorHtml(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>("[data-word-auto-break]").forEach((el) => {
    el.style.marginTop = el.dataset.wordOriginalMarginTop ?? "";
    if (!el.getAttribute("style")) {
      el.removeAttribute("style");
    }
    delete el.dataset.wordOriginalMarginTop;
    delete el.dataset.wordAutoBreak;
  });
  return clone.innerHTML;
}

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || "").replace(/\s+/g, " ").trim();
}

type Props = {
  subTab: WordSubTabId;
  onSubTabChange: (id: WordSubTabId) => void;
  aiPortalId?: string;
  savesPortalId?: string;
};

export function WordTab({
  subTab,
  onSubTabChange,
  aiPortalId,
  savesPortalId,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const storeRef = useRef<DocStoreState>(emptyState());
  const aiPanelRef = useRef<AIPanelHandle | null>(null);
  const pageLayoutRef = useRef(DEFAULT_PAGE_LAYOUT_ID);
  const pageColorRef = useRef(DEFAULT_PAGE_COLOR_ID);

  const [store, setStore] = useState<DocStoreState>(emptyState());
  const [title, setTitle] = useState("Untitled document");
  const [pageLayoutId, setPageLayoutId] = useState(DEFAULT_PAGE_LAYOUT_ID);
  const [pageColorId, setPageColorId] = useState(DEFAULT_PAGE_COLOR_ID);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [backupTick, setBackupTick] = useState(0);
  const [pendingOpen, setPendingOpen] = useState<
    { id: string; title: string; hadMessages: boolean } | null
  >(null);
  const [aiPortalTarget, setAiPortalTarget] = useState<HTMLElement | null>(null);
  const [savesPortalTarget, setSavesPortalTarget] = useState<HTMLElement | null>(
    null
  );
  const hydratedDocRef = useRef<string | null>(null);

  const commitStore = useCallback((next: DocStoreState) => {
    storeRef.current = next;
    setStore(next);
    saveStore(next);
  }, []);

  const rememberBackup = useCallback((doc: DocStoreState["docs"][string], reason: string) => {
    backupDoc(doc, reason);
    setBackupTick((tick) => tick + 1);
  }, []);

  const refreshStats = useCallback(() => {
    const text = editorRef.current?.innerText ?? "";
    setStats({ words: countWords(text), chars: text.length });
  }, []);

  const hydrateEditor = useCallback((id: string | null) => {
    if (!editorRef.current) return;
    if (!id) {
      hydratedDocRef.current = null;
      editorRef.current.innerHTML = "";
      setTitle("Untitled document");
      pageLayoutRef.current = DEFAULT_PAGE_LAYOUT_ID;
      pageColorRef.current = DEFAULT_PAGE_COLOR_ID;
      setPageLayoutId(DEFAULT_PAGE_LAYOUT_ID);
      setPageColorId(DEFAULT_PAGE_COLOR_ID);
      setSavedAt(null);
      setStats({ words: 0, chars: 0 });
      return;
    }
    const doc = storeRef.current.docs[id];
    if (!doc) return;
    hydratedDocRef.current = id;
    editorRef.current.innerHTML = doc.html;
    setTitle(doc.title);
    const nextPageLayoutId = doc.pageLayoutId ?? DEFAULT_PAGE_LAYOUT_ID;
    const nextPageColorId = doc.pageColorId ?? DEFAULT_PAGE_COLOR_ID;
    pageLayoutRef.current = nextPageLayoutId;
    pageColorRef.current = nextPageColorId;
    setPageLayoutId(nextPageLayoutId);
    setPageColorId(nextPageColorId);
    setSavedAt(doc.updatedAt);
    const text = editorRef.current.innerText ?? "";
    setStats({ words: countWords(text), chars: text.length });
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = storeRef.current.activeId;
    if (!id) {
      setIsSaving(false);
      return;
    }
    if (hydratedDocRef.current !== id) {
      setIsSaving(false);
      return;
    }
    if (!editorRef.current) {
      setIsSaving(false);
      return;
    }
    const existing = storeRef.current.docs[id];
    const html = cleanEditorHtml(editorRef.current);
    const existingText = existing ? htmlToPlainText(existing.html) : "";
    const nextText = htmlToPlainText(html);
    if (existing && existingText && !nextText) {
      rememberBackup(existing, "blocked-empty-save");
      setIsSaving(false);
      return;
    }
    if (existing && existing.html !== html && existingText) {
      rememberBackup(existing, "before-save");
    }
    const next = updateDoc(storeRef.current, id, {
      html,
      title,
      pageLayoutId: pageLayoutRef.current,
      pageColorId: pageColorRef.current,
    });
    commitStore(next);
    setSavedAt(next.docs[id].updatedAt);
    setIsSaving(false);
  }, [title, commitStore, rememberBackup]);

  const handleEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (!node || !hydrated) return;
      const activeId = storeRef.current.activeId;
      if (hydratedDocRef.current !== activeId) {
        hydrateEditor(activeId);
      }
    },
    [hydrated, hydrateEditor]
  );

  const scheduleSave = useCallback(() => {
    if (!hydrated) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    setIsSaving(true);
    saveTimerRef.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave, hydrated]);

  // Initial hydration. No auto-create: if there's no active doc the user
  // should land in Saves and pick one (or hit + to make one).
  useEffect(() => {
    const s = loadStore();
    storeRef.current = s;
    setStore(s);
    if (s.activeId && s.docs[s.activeId]) {
      hydrateEditor(s.activeId);
    } else {
      onSubTabChange("saves");
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aiPortalId) {
      return;
    }
    const syncTarget = () => setAiPortalTarget(document.getElementById(aiPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [aiPortalId]);

  useEffect(() => {
    if (!savesPortalId) {
      return;
    }
    const syncTarget = () =>
      setSavesPortalTarget(document.getElementById(savesPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [savesPortalId]);

  // Keep "Saved Xm ago" fresh.
  useEffect(() => {
    const handle = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(handle);
  }, []);

  // Save on title change.
  useEffect(() => {
    scheduleSave();
  }, [title, scheduleSave]);

  // Final flush on unmount so we never lose the last edit.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        const id = storeRef.current.activeId;
        if (id && editorRef.current && hydratedDocRef.current === id) {
          const html = cleanEditorHtml(editorRef.current);
          const existing = storeRef.current.docs[id];
          const existingText = existing ? htmlToPlainText(existing.html) : "";
          const nextText = htmlToPlainText(html);
          if (existing && existingText && !nextText) {
            backupDoc(existing, "blocked-empty-unmount-save");
            return;
          }
          if (existing?.html && existing.html !== html) {
            backupDoc(existing, "before-unmount-save");
          }
          const next = updateDoc(storeRef.current, id, {
            html,
            pageLayoutId: pageLayoutRef.current,
            pageColorId: pageColorRef.current,
          });
          saveStore(next);
        }
      }
    };
  }, []);

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      refreshStats();
      scheduleSave();
    },
    [refreshStats, scheduleSave]
  );

  const handleInput = useCallback(() => {
    refreshStats();
    scheduleSave();
  }, [refreshStats, scheduleSave]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    },
    []
  );

  const handleSelection = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const handlePageLayoutChange = useCallback(
    (id: string) => {
      pageLayoutRef.current = id;
      setPageLayoutId(id);
      scheduleSave();
    },
    [scheduleSave]
  );

  const handlePageColorChange = useCallback(
    (id: string) => {
      pageColorRef.current = id;
      setPageColorId(id);
      scheduleSave();
    },
    [scheduleSave]
  );

  // Switch implementation, shared by confirm + same-doc paths. Flushes
  // the current doc, swaps active, and rehydrates the editor.
  const performOpen = useCallback(
    (id: string) => {
      if (id !== storeRef.current.activeId) {
        flushSave();
        const next = setActive(storeRef.current, id);
        commitStore(next);
        hydrateEditor(id);
      }
      onSubTabChange("editor");
    },
    [flushSave, commitStore, hydrateEditor, onSubTabChange]
  );

  // Clicking a different doc opens a confirmation that bundles the
  // switch with a chat-continuity choice. Same-doc clicks fall through
  // to the existing direct path. First-doc opens (no active doc) skip
  // the modal: there's nothing to switch from.
  const handleOpen = useCallback(
    (id: string) => {
      const currentId = storeRef.current.activeId;
      if (currentId && id !== currentId) {
        const target = storeRef.current.docs[id];
        if (!target) return;
        setPendingOpen({
          id,
          title: target.title,
          hadMessages: aiPanelRef.current?.hasMessages() ?? false,
        });
        return;
      }
      performOpen(id);
    },
    [performOpen]
  );

  const confirmOpenContinue = useCallback(() => {
    if (!pendingOpen) return;
    const id = pendingOpen.id;
    setPendingOpen(null);
    performOpen(id);
  }, [pendingOpen, performOpen]);

  const confirmOpenNewChat = useCallback(() => {
    if (!pendingOpen) return;
    const id = pendingOpen.id;
    setPendingOpen(null);
    performOpen(id);
    aiPanelRef.current?.restart().catch(() => {});
  }, [pendingOpen, performOpen]);

  const cancelOpen = useCallback(() => {
    setPendingOpen(null);
  }, []);

  const handleNew = useCallback(() => {
    flushSave();
    const { state: next, doc } = createDoc(storeRef.current);
    commitStore(next);
    hydrateEditor(doc.id);
    onSubTabChange("editor");
    window.setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 50);
  }, [flushSave, commitStore, hydrateEditor, onSubTabChange]);

  const handleDelete = useCallback(
    (id: string) => {
      const wasActive = storeRef.current.activeId === id;
      const next = deleteDoc(storeRef.current, id);
      commitStore(next);
      if (wasActive) {
        if (next.activeId) {
          hydrateEditor(next.activeId);
        } else {
          hydrateEditor(null);
          onSubTabChange("saves");
        }
      }
    },
    [commitStore, hydrateEditor, onSubTabChange]
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      flushSave();
      const next = duplicateDoc(storeRef.current, id);
      commitStore(next);
      if (next.activeId) hydrateEditor(next.activeId);
    },
    [flushSave, commitStore, hydrateEditor]
  );

  const docs = useMemo(() => listDocs(store), [store]);

  const savedAtLabel = savedAt
    ? `Saved ${formatRelative(savedAt)}`
    : "Not saved yet";

  const getEditor = useCallback(() => editorRef.current, []);

  const handleApplyDoc = useCallback(
    (html: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const id = storeRef.current.activeId;
      if (id) {
        const existing = storeRef.current.docs[id];
        if (existing?.html.trim()) {
          rememberBackup(existing, "before-ai-edit");
        }
      }
      editor.innerHTML = html;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      refreshStats();
      flushSave();
      pushWordDocToMain(htmlToMarkdown(editor)).catch(() => {});
    },
    [rememberBackup, refreshStats, flushSave]
  );

  const latestBackup = useMemo(() => {
    const id = store.activeId;
    return id ? getLatestBackupForDoc(id) : null;
    // backupTick tracks backup changes because localStorage is outside React.
  }, [store.activeId, backupTick]);

  const handleRestoreBackup = useCallback(() => {
    const id = storeRef.current.activeId;
    const backup = id ? getLatestBackupForDoc(id) : null;
    if (!id || !backup || !editorRef.current) return;
    const current = storeRef.current.docs[id];
    if (current?.html.trim()) {
      rememberBackup(current, "before-restore-backup");
    }
    editorRef.current.innerHTML = backup.html;
    pageLayoutRef.current = backup.pageLayoutId ?? DEFAULT_PAGE_LAYOUT_ID;
    pageColorRef.current = backup.pageColorId ?? DEFAULT_PAGE_COLOR_ID;
    setTitle(backup.title);
    setPageLayoutId(pageLayoutRef.current);
    setPageColorId(pageColorRef.current);
    refreshStats();
    const next = updateDoc(storeRef.current, id, {
      html: backup.html,
      title: backup.title,
      pageLayoutId: backup.pageLayoutId ?? DEFAULT_PAGE_LAYOUT_ID,
      pageColorId: backup.pageColorId ?? DEFAULT_PAGE_COLOR_ID,
    });
    commitStore(next);
    setSavedAt(next.docs[id].updatedAt);
  }, [commitStore, refreshStats, rememberBackup]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      // Flush so the export reflects the latest edits.
      flushSave();
      exportDoc(format, title, editorRef.current);
    },
    [flushSave, title]
  );

  const aiPanel = (
    <AIPanel ref={aiPanelRef} getEditor={getEditor} onApplyDoc={handleApplyDoc} />
  );
  const savesView = (
    <SavesView
      docs={docs}
      activeId={store.activeId}
      onOpen={handleOpen}
      onNew={handleNew}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
    />
  );

  return (
    <>
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <EditorView
          ref={handleEditorRef}
          title={title}
          onTitleChange={setTitle}
          titleRef={titleRef}
          stats={stats}
          savedAtLabel={savedAtLabel}
          isSaving={isSaving}
          onInput={handleInput}
          onPaste={handlePaste}
          onSelection={handleSelection}
          onForceSave={flushSave}
          onExport={handleExport}
          canRestoreBackup={Boolean(latestBackup)}
          onRestoreBackup={handleRestoreBackup}
          pageLayoutId={pageLayoutId}
          onPageLayoutChange={handlePageLayoutChange}
          pageColorId={pageColorId}
          onPageColorChange={handlePageColorChange}
          exec={exec}
          hidden={!savesPortalId && subTab !== "editor"}
        />
        {!savesPortalId && subTab === "saves" && savesView}
      </div>
      {savesPortalId
        ? savesPortalTarget
          ? createPortal(savesView, savesPortalTarget)
          : null
        : null}
      {aiPortalId
        ? aiPortalTarget
          ? createPortal(aiPanel, aiPortalTarget)
          : null
        : aiPanel}
      {pendingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={cancelOpen}
        >
          <div
            className="border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-2xl p-4 max-w-sm w-[90%] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ch-accent)]">
              Switch document?
            </div>
            <div className="text-[11px] text-[var(--ch-text)] leading-relaxed">
              Open <span className="text-[var(--ch-accent)]">{pendingOpen.title}</span>?
              {pendingOpen.hadMessages && (
                <>
                  <br />
                  <span className="text-[10px] text-[var(--ch-text-muted)]">
                    Your AI chat has history. Continue it for this doc, or start fresh?
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5 mt-1">
              {pendingOpen.hadMessages ? (
                <>
                  <button
                    type="button"
                    onClick={confirmOpenContinue}
                    className="px-2 py-1.5 border border-[#4CAF50]/40 text-[var(--ch-success)] hover:bg-[#4CAF50]/10 rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
                  >
                    Continue chat
                  </button>
                  <button
                    type="button"
                    onClick={confirmOpenNewChat}
                    className="px-2 py-1.5 border border-[#FFB347]/40 text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
                  >
                    Start new chat
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={confirmOpenContinue}
                  className="px-2 py-1.5 border border-[#FFB347]/40 text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
                >
                  Switch
                </button>
              )}
              <button
                type="button"
                onClick={cancelOpen}
                className="px-2 py-1.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

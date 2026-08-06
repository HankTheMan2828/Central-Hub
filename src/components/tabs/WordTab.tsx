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
  getActiveDocPath,
  getWorkingDir,
  listBackups,
  migrateLegacyDocs,
  pickFile,
  readDocLayout,
  readFileBytes,
  readFileText,
  readBackup,
  readDoc,
  setActiveDocPath,
  setWorkingDir,
  writeDoc,
  writeDocLayout,
  type DocLayoutSidecar,
} from "./wordtab/docStore";
import type { BackupEntry, WordDoc } from "./wordtab/types";
import {
  exportDoc,
  htmlToMarkdown,
  type ExportFormat,
} from "./wordtab/exporters";
import {
  importFile,
  importDocxDocument,
  importTextDocument,
  sanitizeHtml,
} from "./wordtab/importers";

const SAVE_DEBOUNCE_MS = 600;
const DEFAULT_PAGE_LAYOUT_ID = "letter";
const DEFAULT_PAGE_COLOR_ID = "theme";
const DEFAULT_ORIENTATION = "portrait";
const DEFAULT_MARGINS_ID = "normal";
const DEFAULT_COLUMNS = 1;
const DEFAULT_FONT_FAMILY_ID = "sans";
const DEFAULT_FONT_SIZE_PT = 11;
const DEFAULT_LINE_SPACING = 1.15;
const DEFAULT_PARAGRAPH_BEFORE_PT = 0;
const DEFAULT_PARAGRAPH_AFTER_PT = 8;

async function pushWordDocToMain(content: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const electron = (0, eval)("require")("electron");
    await electron.ipcRenderer.invoke("pi:word-doc-update", { content });
  } catch {
    // Non-fatal: the AI panel will resync before the next message.
  }
}

function defaultColumnsForLayout(pageLayoutId?: string): 1 | 2 | 3 {
  return pageLayoutId === "letter-landscape-columns" ? 2 : DEFAULT_COLUMNS;
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
  clone.querySelectorAll<HTMLElement>("mark[data-word-find]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  });
  clone.querySelectorAll<HTMLElement>("[data-word-auto-break]").forEach((el) => {
    el.style.marginTop = el.dataset.wordOriginalMarginTop ?? "";
    if (!el.getAttribute("style")) {
      el.removeAttribute("style");
    }
    delete el.dataset.wordOriginalMarginTop;
    delete el.dataset.wordAutoBreak;
  });
  clone.querySelectorAll<HTMLElement>("[data-word-page-push]").forEach((el) => {
    el.style.marginTop = el.dataset.wordOriginalPagePushMt ?? "";
    if (!el.getAttribute("style")) {
      el.removeAttribute("style");
    }
    delete el.dataset.wordOriginalPagePushMt;
    delete el.dataset.wordPagePush;
  });
  clone.querySelectorAll<HTMLElement>("[data-word-page-wrapper]").forEach((el) => {
    while (el.firstChild) {
      el.parentNode?.insertBefore(el.firstChild, el);
    }
    el.remove();
  });
  return clone.innerHTML;
}

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || "").replace(/\s+/g, " ").trim();
}

function htmlToSnippet(html: string): string {
  return htmlToPlainText(html).slice(0, 140);
}

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function isInternalDocPath(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

function isDocxPath(path: string): boolean {
  return path.toLowerCase().endsWith(".docx");
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
  const activeDocRef = useRef<WordDoc | null>(null);
  const activeDocPathRef = useRef<string | null>(null);
  // True when the active doc is a preview of a non-internal format (e.g. .docx)
  // that hasn't been promoted to a .json on disk yet. Auto-save is suspended
  // for transient docs; manual Save promotes them via saveTransient.
  const activeDocTransientRef = useRef(false);
  const aiPanelRef = useRef<AIPanelHandle | null>(null);
  const pageLayoutRef = useRef(DEFAULT_PAGE_LAYOUT_ID);
  const pageColorRef = useRef(DEFAULT_PAGE_COLOR_ID);
  const orientationRef = useRef<"portrait" | "landscape">(DEFAULT_ORIENTATION);
  const marginsIdRef = useRef(DEFAULT_MARGINS_ID);
  const columnsRef = useRef<1 | 2 | 3>(DEFAULT_COLUMNS);
  const fontFamilyIdRef = useRef(DEFAULT_FONT_FAMILY_ID);
  const fontSizePtRef = useRef(DEFAULT_FONT_SIZE_PT);
  const lineSpacingRef = useRef(DEFAULT_LINE_SPACING);
  const paragraphSpacingBeforePtRef = useRef(DEFAULT_PARAGRAPH_BEFORE_PT);
  const paragraphSpacingAfterPtRef = useRef(DEFAULT_PARAGRAPH_AFTER_PT);

  const [activeDoc, setActiveDoc] = useState<WordDoc | null>(null);
  const [activeDocPath, setActivePathState] = useState<string | null>(null);
  const [workingDir, setWorkingDirState] = useState<string | null>(null);
  const [refreshSaves, setRefreshSaves] = useState(0);
  const [title, setTitle] = useState("Untitled document");
  const [pageLayoutId, setPageLayoutId] = useState(DEFAULT_PAGE_LAYOUT_ID);
  const [pageColorId, setPageColorId] = useState(DEFAULT_PAGE_COLOR_ID);
  const [orientation, setOrientation] =
    useState<"portrait" | "landscape">(DEFAULT_ORIENTATION);
  const [marginsId, setMarginsId] = useState(DEFAULT_MARGINS_ID);
  const [columns, setColumns] = useState<1 | 2 | 3>(DEFAULT_COLUMNS);
  const [fontFamilyId, setFontFamilyId] = useState(DEFAULT_FONT_FAMILY_ID);
  const [fontSizePt, setFontSizePt] = useState(DEFAULT_FONT_SIZE_PT);
  const [lineSpacing, setLineSpacing] = useState(DEFAULT_LINE_SPACING);
  const [paragraphSpacingBeforePt, setParagraphSpacingBeforePt] = useState(
    DEFAULT_PARAGRAPH_BEFORE_PT
  );
  const [paragraphSpacingAfterPt, setParagraphSpacingAfterPt] = useState(
    DEFAULT_PARAGRAPH_AFTER_PT
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [backupTick, setBackupTick] = useState(0);
  const [latestBackup, setLatestBackup] = useState<BackupEntry | null>(null);
  const [pendingOpen, setPendingOpen] = useState<
    { path: string; title: string; hadMessages: boolean; transient: boolean } | null
  >(null);
  const [pendingFolderSwitch, setPendingFolderSwitch] = useState<
    { folder: string } | null
  >(null);
  const [aiPortalTarget, setAiPortalTarget] = useState<HTMLElement | null>(null);
  const [savesPortalTarget, setSavesPortalTarget] = useState<HTMLElement | null>(
    null
  );

  const setActivePath = useCallback((path: string | null) => {
    activeDocPathRef.current = path;
    setActivePathState(path);
    setActiveDocPath(path);
  }, []);

  const applyDoc = useCallback(
    (doc: WordDoc | null, path: string | null, transient: boolean = false) => {
      activeDocRef.current = doc;
      activeDocTransientRef.current = transient;
      setActiveDoc(doc);
      setActivePath(path);
      if (!editorRef.current) return;
      if (!doc) {
        editorRef.current.innerHTML = "";
        setTitle("Untitled document");
        setSavedAt(null);
        setStats({ words: 0, chars: 0 });
        return;
      }
      editorRef.current.innerHTML = doc.html;
      setTitle(doc.title);
      const nextPageLayoutId = doc.pageLayoutId ?? DEFAULT_PAGE_LAYOUT_ID;
      const nextPageColorId = doc.pageColorId ?? DEFAULT_PAGE_COLOR_ID;
      const nextOrientation = doc.orientation ?? DEFAULT_ORIENTATION;
      const nextMarginsId = doc.marginsId ?? DEFAULT_MARGINS_ID;
      const nextColumns = doc.columns ?? defaultColumnsForLayout(nextPageLayoutId);
      const nextFontFamilyId = doc.fontFamilyId ?? DEFAULT_FONT_FAMILY_ID;
      const nextFontSizePt = doc.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
      const nextLineSpacing = doc.lineSpacing ?? DEFAULT_LINE_SPACING;
      const nextParagraphBefore =
        doc.paragraphSpacingBeforePt ?? DEFAULT_PARAGRAPH_BEFORE_PT;
      const nextParagraphAfter =
        doc.paragraphSpacingAfterPt ?? DEFAULT_PARAGRAPH_AFTER_PT;
      pageLayoutRef.current = nextPageLayoutId;
      pageColorRef.current = nextPageColorId;
      orientationRef.current = nextOrientation;
      marginsIdRef.current = nextMarginsId;
      columnsRef.current = nextColumns;
      fontFamilyIdRef.current = nextFontFamilyId;
      fontSizePtRef.current = nextFontSizePt;
      lineSpacingRef.current = nextLineSpacing;
      paragraphSpacingBeforePtRef.current = nextParagraphBefore;
      paragraphSpacingAfterPtRef.current = nextParagraphAfter;
      setPageLayoutId(nextPageLayoutId);
      setPageColorId(nextPageColorId);
      setOrientation(nextOrientation);
      setMarginsId(nextMarginsId);
      setColumns(nextColumns);
      setFontFamilyId(nextFontFamilyId);
      setFontSizePt(nextFontSizePt);
      setLineSpacing(nextLineSpacing);
      setParagraphSpacingBeforePt(nextParagraphBefore);
      setParagraphSpacingAfterPt(nextParagraphAfter);
      setSavedAt(transient ? null : doc.updatedAt);
      const text = editorRef.current.innerText ?? "";
      setStats({ words: countWords(text), chars: text.length });
      pushWordDocToMain(htmlToMarkdown(editorRef.current)).catch(() => {});
    },
    [setActivePath]
  );

  const rememberBackup = useCallback(async (doc: WordDoc, reason: string) => {
    const path = activeDocPathRef.current;
    if (!path) return;
    await backupDoc(doc, path, reason);
    setBackupTick((tick) => tick + 1);
  }, []);

  const refreshStats = useCallback(() => {
    const text = editorRef.current?.innerText ?? "";
    setStats({ words: countWords(text), chars: text.length });
  }, []);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const path = activeDocPathRef.current;
    const existing = activeDocRef.current;
    if (!path || !existing || !editorRef.current) {
      setIsSaving(false);
      return;
    }
    // Transient docs (e.g. a .docx being previewed) are NOT writable in place —
    // we'd corrupt the source. Manual Save uses saveTransient instead.
    if (activeDocTransientRef.current) {
      setIsSaving(false);
      return;
    }
    const html = cleanEditorHtml(editorRef.current);
    const existingText = htmlToPlainText(existing.html);
    const nextText = htmlToPlainText(html);
    if (existingText && !nextText) {
      await rememberBackup(existing, "blocked-empty-save");
      setIsSaving(false);
      return;
    }
    if (existing.html !== html && existingText) {
      await rememberBackup(existing, "before-save");
    }
    const updated: WordDoc = {
      ...existing,
      title,
      html,
      pageLayoutId: pageLayoutRef.current,
      pageColorId: pageColorRef.current,
      orientation: orientationRef.current,
      marginsId: marginsIdRef.current,
      columns: columnsRef.current,
      fontFamilyId: fontFamilyIdRef.current,
      fontSizePt: fontSizePtRef.current,
      lineSpacing: lineSpacingRef.current,
      paragraphSpacingBeforePt: paragraphSpacingBeforePtRef.current,
      paragraphSpacingAfterPt: paragraphSpacingAfterPtRef.current,
      snippet: htmlToSnippet(html),
      updatedAt: Date.now(),
    };
    const result = await writeDoc(updated, path);
    activeDocRef.current = updated;
    setActiveDoc(updated);
    setActivePath(result.path);
    setSavedAt(updated.updatedAt);
    setIsSaving(false);
    setRefreshSaves((tick) => tick + 1);
    pushWordDocToMain(htmlToMarkdown(editorRef.current)).catch(() => {});
  }, [rememberBackup, setActivePath, title]);

  const handleEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (node && activeDocRef.current) {
        applyDoc(activeDocRef.current, activeDocPathRef.current);
      }
    },
    [applyDoc]
  );

  const scheduleSave = useCallback(() => {
    if (!hydrated) return;
    if (!activeDocPathRef.current) return;
    // Transient docs (preview from non-internal formats) don't auto-save —
    // the user has to hit the manual Save button to promote them to a .json.
    if (activeDocTransientRef.current) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    setIsSaving(true);
    saveTimerRef.current = window.setTimeout(() => {
      flushSave().catch(() => setIsSaving(false));
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave, hydrated]);

  const saveTransient = useCallback(async () => {
    const existing = activeDocRef.current;
    const editor = editorRef.current;
    if (!existing || !editor) return;
    const html = cleanEditorHtml(editor);
    const folder = workingDir ?? (await getWorkingDir());
    const created = await createDoc(folder, title || existing.title);
    const doc: WordDoc = {
      ...created.doc,
      title: title || existing.title,
      html,
      snippet: htmlToSnippet(html),
      pageLayoutId: pageLayoutRef.current,
      pageColorId: pageColorRef.current,
      orientation: orientationRef.current,
      marginsId: marginsIdRef.current,
      columns: columnsRef.current,
      fontFamilyId: fontFamilyIdRef.current,
      fontSizePt: fontSizePtRef.current,
      lineSpacing: lineSpacingRef.current,
      paragraphSpacingBeforePt: paragraphSpacingBeforePtRef.current,
      paragraphSpacingAfterPt: paragraphSpacingAfterPtRef.current,
      updatedAt: Date.now(),
    };
    await writeDoc(doc, created.path);
    activeDocRef.current = doc;
    activeDocTransientRef.current = false;
    setActiveDoc(doc);
    setActivePath(created.path);
    setSavedAt(doc.updatedAt);
    setRefreshSaves((tick) => tick + 1);
    pushWordDocToMain(htmlToMarkdown(editor)).catch(() => {});
  }, [setActivePath, title, workingDir]);

  const handleForceSave = useCallback(() => {
    if (activeDocTransientRef.current && activeDocRef.current) {
      saveTransient().catch(() => {});
    } else if (activeDocPathRef.current) {
      flushSave().catch(() => {});
    }
  }, [flushSave, saveTransient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyDocs();
        const dir = await getWorkingDir();
        if (cancelled) return;
        setWorkingDirState(dir);
        const rememberedPath = getActiveDocPath();
        if (rememberedPath) {
          const result = await readDoc(rememberedPath);
          if (!cancelled && result.doc) {
            applyDoc(result.doc, result.path);
          } else if (!cancelled) {
            onSubTabChange("saves");
          }
        } else if (!cancelled) {
          onSubTabChange("saves");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aiPortalId) return;
    const syncTarget = () => setAiPortalTarget(document.getElementById(aiPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [aiPortalId]);

  useEffect(() => {
    if (!savesPortalId) return;
    const syncTarget = () =>
      setSavesPortalTarget(document.getElementById(savesPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [savesPortalId]);

  useEffect(() => {
    const handle = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    scheduleSave();
  }, [title, scheduleSave]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeDocPath) {
        setLatestBackup(null);
        return;
      }
      const backups = await listBackups(activeDocPath);
      if (!cancelled) setLatestBackup(backups[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDocPath, backupTick]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        flushSave().catch(() => {});
      }
    };
  }, [flushSave]);

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

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) {
      document.execCommand("insertHTML", false, sanitizeHtml(html));
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  const handleSelection = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // For transient previews (.docx and other non-.json formats) the editor
  // can't autosave the body into the source file, but we still want page
  // settings to persist per-doc. Mirror them into a `<path>.layout.json`
  // sidecar whenever the user tweaks them.
  const persistLayoutSidecar = useCallback(() => {
    const path = activeDocPathRef.current;
    if (!path || !activeDocTransientRef.current) return;
    const layout: DocLayoutSidecar = {
      pageLayoutId: pageLayoutRef.current,
      pageColorId: pageColorRef.current,
      orientation: orientationRef.current,
      marginsId: marginsIdRef.current,
      columns: columnsRef.current,
      fontFamilyId: fontFamilyIdRef.current,
      fontSizePt: fontSizePtRef.current,
      lineSpacing: lineSpacingRef.current,
      paragraphSpacingBeforePt: paragraphSpacingBeforePtRef.current,
      paragraphSpacingAfterPt: paragraphSpacingAfterPtRef.current,
    };
    writeDocLayout(path, layout).catch(() => {});
  }, []);

  const handlePageLayoutChange = useCallback(
    (id: string) => {
      pageLayoutRef.current = id;
      setPageLayoutId(id);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handlePageColorChange = useCallback(
    (id: string) => {
      pageColorRef.current = id;
      setPageColorId(id);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleOrientationChange = useCallback(
    (next: "portrait" | "landscape") => {
      orientationRef.current = next;
      setOrientation(next);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleMarginsChange = useCallback(
    (id: string) => {
      marginsIdRef.current = id;
      setMarginsId(id);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleColumnsChange = useCallback(
    (next: 1 | 2 | 3) => {
      columnsRef.current = next;
      setColumns(next);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleFontFamilyChange = useCallback(
    (id: string) => {
      fontFamilyIdRef.current = id;
      setFontFamilyId(id);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleFontSizeChange = useCallback(
    (size: number) => {
      fontSizePtRef.current = size;
      setFontSizePt(size);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const handleSpacingChange = useCallback(
    (line: number, before: number, after: number) => {
      lineSpacingRef.current = line;
      paragraphSpacingBeforePtRef.current = before;
      paragraphSpacingAfterPtRef.current = after;
      setLineSpacing(line);
      setParagraphSpacingBeforePt(before);
      setParagraphSpacingAfterPt(after);
      scheduleSave();
      persistLayoutSidecar();
    },
    [persistLayoutSidecar, scheduleSave]
  );

  const performOpen = useCallback(
    async (path: string) => {
      await flushSave();
      const result = await readDoc(path);
      if (!result.doc) return;
      applyDoc(result.doc, result.path);
      onSubTabChange("editor");
    },
    [applyDoc, flushSave, onSubTabChange]
  );

  const openByPath = useCallback(
    async (
      path: string,
      parent?: string | null,
      options?: { transient?: boolean }
    ): Promise<void> => {
      if (isInternalDocPath(path)) {
        await performOpen(path);
        return;
      }
      await flushSave();
      const name = filenameFromPath(path);
      const imported = isDocxPath(path)
        ? await importDocxDocument(name, await readFileBytes(path))
        : importTextDocument(name, await readFileText(path));
      if (options?.transient) {
        // Preview-only: hold the imported content in the editor without writing
        // a .json copy. We keep the source path active so the tile in Saves
        // still highlights and the switch-doc modal still gates on it. The
        // user's manual Save promotes the preview to a real .json doc.
        const now = Date.now();
        // Per-file page-layout sidecar — when the user has tweaked the
        // orientation/margins/columns/etc. for this doc before, those settings
        // come back on reopen instead of falling back to global defaults.
        const layout = await readDocLayout(path).catch(() => null);
        const transientDoc: WordDoc = {
          id: `transient-${now}-${Math.random().toString(36).slice(2, 8)}`,
          title: imported.title,
          html: imported.html,
          snippet: htmlToSnippet(imported.html),
          pageColorId: layout?.pageColorId ?? DEFAULT_PAGE_COLOR_ID,
          pageLayoutId: layout?.pageLayoutId,
          orientation: layout?.orientation,
          marginsId: layout?.marginsId,
          columns: layout?.columns,
          fontFamilyId: layout?.fontFamilyId,
          fontSizePt: layout?.fontSizePt,
          lineSpacing: layout?.lineSpacing,
          paragraphSpacingBeforePt: layout?.paragraphSpacingBeforePt,
          paragraphSpacingAfterPt: layout?.paragraphSpacingAfterPt,
          createdAt: now,
          updatedAt: now,
        };
        applyDoc(transientDoc, path, true);
        onSubTabChange("editor");
        return;
      }
      const folder = parent || workingDir || (await getWorkingDir());
      const created = await createDoc(folder, imported.title);
      const doc: WordDoc = {
        ...created.doc,
        title: imported.title,
        html: imported.html,
        snippet: htmlToSnippet(imported.html),
        pageColorId: DEFAULT_PAGE_COLOR_ID,
        updatedAt: Date.now(),
      };
      const written = await writeDoc(doc, created.path);
      applyDoc(doc, written.path);
      setRefreshSaves((tick) => tick + 1);
      onSubTabChange("editor");
    },
    [applyDoc, flushSave, onSubTabChange, performOpen, workingDir]
  );

  const handleOpen = useCallback(
    async (path: string) => {
      // Tile clicks on non-internal formats preview-only — no .json duplicate
      // is written until the user explicitly saves.
      const transient = !isInternalDocPath(path);
      if (activeDocPathRef.current && path !== activeDocPathRef.current) {
        let title = filenameFromPath(path);
        if (isInternalDocPath(path)) {
          const result = await readDoc(path);
          if (!result.doc) return;
          title = result.doc.title;
        }
        setPendingOpen({
          path,
          title,
          hadMessages: aiPanelRef.current?.hasMessages() ?? false,
          transient,
        });
        return;
      }
      await openByPath(path, undefined, { transient });
    },
    [openByPath]
  );

  const confirmOpenContinue = useCallback(() => {
    if (!pendingOpen) return;
    const { path, transient } = pendingOpen;
    setPendingOpen(null);
    openByPath(path, undefined, { transient }).catch(() => {});
  }, [openByPath, pendingOpen]);

  const confirmOpenNewChat = useCallback(() => {
    if (!pendingOpen) return;
    const { path, transient } = pendingOpen;
    setPendingOpen(null);
    openByPath(path, undefined, { transient }).catch(() => {});
    aiPanelRef.current?.restart().catch(() => {});
  }, [openByPath, pendingOpen]);

  const cancelOpen = useCallback(() => {
    setPendingOpen(null);
  }, []);

  const handleOpenFromDisk = useCallback(async () => {
    const picked = await pickFile(workingDir ?? undefined);
    if (!picked) return;
    await openByPath(picked.path, picked.parent);
    if (picked.parent && picked.parent !== workingDir) {
      setPendingFolderSwitch({ folder: picked.parent });
    }
  }, [openByPath, workingDir]);

  const confirmFolderSwitch = useCallback(async () => {
    if (!pendingFolderSwitch) return;
    const folder = pendingFolderSwitch.folder;
    setPendingFolderSwitch(null);
    try {
      await setWorkingDir(folder);
      setWorkingDirState(folder);
      setRefreshSaves((tick) => tick + 1);
    } catch {
      // Ignore errors switching folders.
    }
  }, [pendingFolderSwitch]);

  const cancelFolderSwitch = useCallback(() => {
    setPendingFolderSwitch(null);
  }, []);

  const handleNew = useCallback(async () => {
    await flushSave();
    const folder = workingDir ?? (await getWorkingDir());
    const { doc, path } = await createDoc(folder);
    setWorkingDirState(folder);
    applyDoc(doc, path);
    setRefreshSaves((tick) => tick + 1);
    onSubTabChange("editor");
    window.setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 50);
  }, [applyDoc, flushSave, onSubTabChange, workingDir]);

  const savedAtLabel = savedAt
    ? `Saved ${formatRelative(savedAt)}`
    : "Not saved yet";

  const getEditor = useCallback(() => editorRef.current, []);

  const handleApplyDoc = useCallback(
    (html: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const doc = activeDocRef.current;
      // Apply even if no active doc yet so Edit mode still updates the page.
      if (doc?.html.trim()) {
        rememberBackup(doc, "before-ai-edit").catch(() => {});
      }
      editor.innerHTML = html;
      // Keep in-memory doc in sync immediately (don't wait for debounced save).
      if (doc) {
        const updated: WordDoc = {
          ...doc,
          html,
          snippet: htmlToSnippet(html),
          updatedAt: Date.now(),
        };
        activeDocRef.current = updated;
        setActiveDoc(updated);
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      refreshStats();
      if (doc && activeDocPathRef.current && !activeDocTransientRef.current) {
        flushSave().catch(() => {});
      }
      pushWordDocToMain(htmlToMarkdown(editor)).catch(() => {});
    },
    [flushSave, refreshStats, rememberBackup]
  );

  const handleRestoreBackup = useCallback(async () => {
    const doc = activeDocRef.current;
    if (!doc || !latestBackup || !editorRef.current || !activeDocPathRef.current) {
      return;
    }
    if (doc.html.trim()) {
      await rememberBackup(doc, "before-restore-backup");
    }
    const backup = await readBackup(latestBackup.path);
    if (!backup) return;
    const restored = { ...backup, id: doc.id, updatedAt: Date.now() };
    const path = activeDocPathRef.current;
    applyDoc(restored, path);
    if (path) await writeDoc(restored, path);
    setRefreshSaves((tick) => tick + 1);
  }, [applyDoc, latestBackup, rememberBackup]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      flushSave().catch(() => {});
      exportDoc(format, title, editorRef.current);
    },
    [flushSave, title]
  );

  const handleImport = useCallback(
    async (file: File) => {
      await flushSave();
      const folder = workingDir ?? (await getWorkingDir());
      const imported = await importFile(file);
      const created = await createDoc(folder, imported.title);
      const doc: WordDoc = {
        ...created.doc,
        title: imported.title,
        html: imported.html,
        snippet: htmlToSnippet(imported.html),
        pageColorId: DEFAULT_PAGE_COLOR_ID,
        updatedAt: Date.now(),
      };
      const written = await writeDoc(doc, created.path);
      setWorkingDirState(folder);
      applyDoc(doc, written.path);
      setRefreshSaves((tick) => tick + 1);
      onSubTabChange("editor");
    },
    [applyDoc, flushSave, onSubTabChange, workingDir]
  );

  const handleWorkingDirChange = useCallback((path: string) => {
    setWorkingDirState(path);
    setRefreshSaves((tick) => tick + 1);
  }, []);

  const aiPanel = (
    <AIPanel ref={aiPanelRef} getEditor={getEditor} onApplyDoc={handleApplyDoc} />
  );
  const savesView = (
    <SavesView
      workingDir={workingDir}
      refreshKey={refreshSaves}
      activePath={activeDocPath}
      onWorkingDirChange={handleWorkingDirChange}
      onOpen={(path) => {
        handleOpen(path).catch(() => {});
      }}
      onOpenFromDisk={() => {
        handleOpenFromDisk().catch(() => {});
      }}
      onNew={() => {
        handleNew().catch(() => {});
      }}
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
          onForceSave={handleForceSave}
          onExport={handleExport}
          onImport={(file) => {
            handleImport(file).catch((err: unknown) => {
              const message =
                err instanceof Error ? err.message : "Could not import that file.";
              window.alert(message);
            });
          }}
          canRestoreBackup={Boolean(latestBackup)}
          onRestoreBackup={() => {
            handleRestoreBackup().catch(() => {});
          }}
          pageLayoutId={pageLayoutId}
          onPageLayoutChange={handlePageLayoutChange}
          pageColorId={pageColorId}
          onPageColorChange={handlePageColorChange}
          orientation={orientation}
          onOrientationChange={handleOrientationChange}
          marginsId={marginsId}
          onMarginsChange={handleMarginsChange}
          columns={columns}
          onColumnsChange={handleColumnsChange}
          fontFamilyId={fontFamilyId}
          onFontFamilyChange={handleFontFamilyChange}
          fontSizePt={fontSizePt}
          onFontSizeChange={handleFontSizeChange}
          lineSpacing={lineSpacing}
          paragraphSpacingBeforePt={paragraphSpacingBeforePt}
          paragraphSpacingAfterPt={paragraphSpacingAfterPt}
          onSpacingChange={handleSpacingChange}
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
      {pendingFolderSwitch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={cancelFolderSwitch}
        >
          <div
            className="border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-2xl p-4 max-w-sm w-[90%] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ch-accent)]">
              Switch Saves folder?
            </div>
            <div className="text-[11px] text-[var(--ch-text)] leading-relaxed">
              This doc lives in
              <span className="text-[var(--ch-accent)]"> {pendingFolderSwitch.folder}</span>.
              Show that folder in the Saves panel?
            </div>
            <div className="flex flex-col gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => {
                  confirmFolderSwitch().catch(() => {});
                }}
                className="px-2 py-1.5 border border-[#FFB347]/40 text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
              >
                Switch
              </button>
              <button
                type="button"
                onClick={cancelFolderSwitch}
                className="px-2 py-1.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider font-mono transition-colors"
              >
                Keep current folder
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from "react";
import {
  FileText,
  Download,
  ChevronDown,
} from "lucide-react";
import type { ExportFormat } from "./exporters";
import { PAGE_LAYOUTS, PAGE_COLORS } from "./pageOptions";
import { RibbonTabs, type RibbonTabId } from "./ribbon/RibbonTabs";
import { HomeRibbon } from "./ribbon/HomeRibbon";
import { LayoutRibbon } from "./ribbon/LayoutRibbon";
import { ViewRibbon, type PageFlow } from "./ribbon/ViewRibbon";
import type { FormatState } from "./ribbon/shared";

const PAGE_GAP_PX = 36;
const INNER_COLUMN_GAP_PX = 28;
const MAX_PAGE_COUNT = 80;
const PAGE_COUNT_TOLERANCE_PX = 24;

type Props = {
  title: string;
  onTitleChange: (title: string) => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  stats: { words: number; chars: number };
  savedAtLabel: string;
  isSaving: boolean;
  onInput: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onSelection: () => void;
  onForceSave: () => void;
  onExport: (format: ExportFormat) => void;
  canRestoreBackup: boolean;
  onRestoreBackup: () => void;
  pageLayoutId: string;
  onPageLayoutChange: (id: string) => void;
  pageColorId: string;
  onPageColorChange: (id: string) => void;
  exec: (command: string, value?: string) => void;
  hidden: boolean;
};

function queryState(cmd: string): boolean {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
}

function queryBlock(): string {
  try {
    return (document.queryCommandValue("formatBlock") || "").toLowerCase();
  } catch {
    return "";
  }
}

export const EditorView = forwardRef(function EditorView(
  {
    title,
    onTitleChange,
    titleRef,
    stats,
    savedAtLabel,
    isSaving,
    onInput,
    onPaste,
    onSelection,
    onForceSave,
    onExport,
    canRestoreBackup,
    onRestoreBackup,
    pageLayoutId,
    onPageLayoutChange,
    pageColorId,
    onPageColorChange,
    exec,
    hidden,
  }: Props,
  editorRef: ForwardedRef<HTMLDivElement>
) {
  const [exportOpen, setExportOpen] = useState(false);
  const [activeRibbon, setActiveRibbon] = useState<RibbonTabId>("home");
  const [pageFlow, setPageFlow] = useState<PageFlow>("vertical");
  const [pageCount, setPageCount] = useState(1);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const localEditorRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const handleHeading = useCallback(
    (tag: "H1" | "H2" | "P" | "BLOCKQUOTE") => {
      exec("formatBlock", tag);
    },
    [exec]
  );

  const handleInsertLink = useCallback(() => {
    const url = window.prompt("Link URL:", "https://");
    if (!url) return;
    exec("createLink", url);
  }, [exec]);

  // hiliteColor isn't reliable across browsers; fall back to backColor when
  // unsupported. "transparent" clears the highlight.
  const applyHighlight = useCallback(
    (color: string) => {
      const cmd = document.queryCommandSupported?.("hiliteColor")
        ? "hiliteColor"
        : "backColor";
      exec(cmd, color);
    },
    [exec]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        onForceSave();
      } else if (k === "k") {
        e.preventDefault();
        handleInsertLink();
      } else if (k === "1") {
        e.preventDefault();
        handleHeading("H1");
      } else if (k === "2") {
        e.preventDefault();
        handleHeading("H2");
      } else if (k === "0") {
        e.preventDefault();
        handleHeading("P");
      }
    },
    [onForceSave, handleInsertLink, handleHeading]
  );

  const pageLayout =
    PAGE_LAYOUTS.find((layout) => layout.id === pageLayoutId) ?? PAGE_LAYOUTS[0];
  const pageColor =
    PAGE_COLORS.find((color) => color.id === pageColorId) ?? PAGE_COLORS[0];
  const stripStyle = useMemo<CSSProperties>(
    () => ({
      width:
        pageFlow === "horizontal"
          ? `calc(${pageLayout.width} * ${pageCount} + ${PAGE_GAP_PX}px * ${
              pageCount - 1
            })`
          : pageLayout.width,
      height:
        pageFlow === "horizontal"
          ? pageLayout.height
          : `calc(${pageLayout.height} * ${pageCount} + ${PAGE_GAP_PX}px * ${
              pageCount - 1
            })`,
    }),
    [pageCount, pageFlow, pageLayout]
  );
  const pageThemeStyle = useMemo(
    () =>
      ({
        "--word-page-bg": pageColor.background,
        "--word-page-text": pageColor.text,
        "--word-page-muted": pageColor.muted,
        "--word-page-heading": pageColor.heading,
        "--word-page-subheading": pageColor.subheading,
        "--word-page-quote": pageColor.quote,
        "--word-page-rule": pageColor.rule,
        "--word-page-ring": pageColor.ring,
      } as CSSProperties),
    [pageColor]
  );
  const pageStyle = useMemo<CSSProperties>(
    () => ({
      width: pageLayout.width,
      height: pageLayout.height,
      borderRadius: "7px",
      backgroundColor: "var(--word-page-bg)",
      boxShadow:
        "0 18px 44px rgba(0, 0, 0, 0.32), 0 0 0 1px var(--word-page-ring)",
    }),
    [pageLayout]
  );
  const writingAreaWidth = `calc(${pageLayout.width} - (${pageLayout.margin} * 2))`;
  const writingAreaHeight = `calc(${pageLayout.height} - (${pageLayout.margin} * 2))`;
  const editorStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      top: pageLayout.margin,
      left: pageLayout.margin,
      width: writingAreaWidth,
      height:
        pageFlow === "horizontal"
          ? writingAreaHeight
          : undefined,
      minHeight: writingAreaHeight,
      outline: "none",
      columnFill: "auto",
      columnWidth:
        pageFlow === "horizontal"
          ? pageLayout.columns === 2
            ? `calc((${writingAreaWidth} - ${INNER_COLUMN_GAP_PX}px) / 2)`
            : writingAreaWidth
          : undefined,
      columnCount:
        pageFlow === "vertical" && pageLayout.columns === 2
          ? pageLayout.columns
          : undefined,
      columnGap:
        pageFlow === "horizontal"
          ? pageLayout.columns === 2
            ? `${INNER_COLUMN_GAP_PX}px`
            : `calc(${pageLayout.margin} * 2 + ${PAGE_GAP_PX}px)`
          : pageLayout.columns === 2
          ? `${INNER_COLUMN_GAP_PX}px`
          : undefined,
      columnRule:
        pageLayout.columns === 2
          ? "1px solid var(--word-page-rule)"
          : undefined,
      overflow: "visible",
      color: "var(--word-page-text)",
    }),
    [pageFlow, pageLayout, writingAreaHeight, writingAreaWidth]
  );
  const assignEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      localEditorRef.current = node;
      if (typeof editorRef === "function") {
        editorRef(node);
      } else if (editorRef) {
        editorRef.current = node;
      }
    },
    [editorRef]
  );
  const updatePageCount = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    let nextPageCount = 1;
    if (pageFlow === "horizontal") {
      const style = window.getComputedStyle(node);
      const columnGap = Number.parseFloat(style.columnGap || "0") || 0;
      const columnWidth =
        Number.parseFloat(style.columnWidth || "0") || node.clientWidth || 1;
      const columns = Math.max(
        1,
        Math.ceil(
          (node.scrollWidth + columnGap - PAGE_COUNT_TOLERANCE_PX) /
            (columnWidth + columnGap)
        )
      );
      nextPageCount =
        pageLayout.columns === 2 ? Math.ceil(columns / 2) : columns;
    } else {
      const strip = stripRef.current;
      const firstPage = strip?.querySelector<HTMLElement>(".word-page-sheet");
      const pageHeight = firstPage?.offsetHeight || node.clientHeight || 1;
      const contentHeight = Math.max(1, pageHeight - node.offsetTop * 2);
      nextPageCount = Math.ceil(
        (node.scrollHeight - PAGE_COUNT_TOLERANCE_PX) / contentHeight
      );
    }
    const boundedPageCount = Math.min(MAX_PAGE_COUNT, Math.max(1, nextPageCount));
    setPageCount((current) =>
      current === boundedPageCount ? current : boundedPageCount
    );
  }, [pageFlow, pageLayout.columns]);
  const schedulePageCountUpdate = useCallback(() => {
    window.requestAnimationFrame(updatePageCount);
  }, [updatePageCount]);
  const handleEditorInput = useCallback(() => {
    onInput();
    schedulePageCountUpdate();
  }, [onInput, schedulePageCountUpdate]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPageCount(1);
      updatePageCount();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pageFlow, pageLayoutId, updatePageCount]);

  useEffect(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const observer = new ResizeObserver(schedulePageCountUpdate);
    observer.observe(node);
    schedulePageCountUpdate();
    return () => observer.disconnect();
  }, [schedulePageCountUpdate]);

  useEffect(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const observer = new MutationObserver(schedulePageCountUpdate);
    observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [schedulePageCountUpdate]);

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index),
    [pageCount]
  );

  const block = queryBlock();
  const formatState: FormatState = {
    isBold: queryState("bold"),
    isItalic: queryState("italic"),
    isUnderline: queryState("underline"),
    isStrike: queryState("strikeThrough"),
    isSub: queryState("subscript"),
    isSuper: queryState("superscript"),
    isUL: queryState("insertUnorderedList"),
    isOL: queryState("insertOrderedList"),
    isH1: block === "h1",
    isH2: block === "h2",
    isP: block === "p" || (!block || (!block.startsWith("h") && block !== "blockquote")),
    isQuote: block === "blockquote",
    isAlignLeft: queryState("justifyLeft"),
    isAlignCenter: queryState("justifyCenter"),
    isAlignRight: queryState("justifyRight"),
    isAlignJustify: queryState("justifyFull"),
  };

  const exportFormats: { id: ExportFormat; label: string; ext: string }[] = [
    { id: "md", label: "Markdown", ext: ".md" },
    { id: "html", label: "HTML", ext: ".html" },
    { id: "txt", label: "Plain text", ext: ".txt" },
    { id: "pdf", label: "PDF (via print)", ext: ".pdf" },
  ];

  return (
    <div
      className="flex-1 flex flex-col h-full min-w-[400px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden"
      style={hidden ? { display: "none" } : undefined}
    >
      <header className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <FileText className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
          Editor
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled document"
          className="ml-2 flex-1 max-w-[400px] bg-transparent border-b border-transparent focus:border-[#FFB347]/40 px-1 py-0.5 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none"
        />
        <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
          {stats.words} words - {stats.chars} chars
        </span>
        <span
          className={`text-[9px] uppercase tracking-widest font-mono ${
            isSaving
              ? "text-[var(--ch-accent)] opacity-80"
              : "text-[var(--ch-success)] opacity-80"
          }`}
        >
          {isSaving ? "Saving..." : savedAtLabel}
        </span>
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            onMouseDown={(e) => e.preventDefault()}
            title="Download / export"
            className={`clouds-coding-dropdown-button flex items-center gap-1 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
              exportOpen
                ? "border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
            }`}
          >
            <Download className="w-3 h-3" />
            Export
            <ChevronDown className="w-3 h-3" />
          </button>
          {exportOpen && (
            <div className="clouds-coding-dropdown-panel absolute top-full right-0 mt-1 z-30 min-w-[180px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl overflow-hidden">
              {exportFormats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onExport(f.id);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)] transition-colors text-left"
                >
                  <span>{f.label}</span>
                  <span className="text-[9px] text-[var(--ch-text-faint)]">{f.ext}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <RibbonTabs active={activeRibbon} onChange={setActiveRibbon} />

      <div className="px-3 py-1.5 border-b border-[var(--ch-border-subtle)] flex items-center gap-1 shrink-0 flex-wrap min-h-[44px]">
        {activeRibbon === "home" && (
          <HomeRibbon
            exec={exec}
            applyHighlight={applyHighlight}
            onHeading={handleHeading}
            onInsertLink={handleInsertLink}
            formatState={formatState}
            canRestoreBackup={canRestoreBackup}
            onRestoreBackup={onRestoreBackup}
          />
        )}
        {activeRibbon === "layout" && (
          <LayoutRibbon
            pageLayoutId={pageLayoutId}
            onPageLayoutChange={onPageLayoutChange}
            pageColorId={pageColorId}
            onPageColorChange={onPageColorChange}
          />
        )}
        {activeRibbon === "view" && (
          <ViewRibbon pageFlow={pageFlow} onPageFlowChange={setPageFlow} />
        )}
      </div>

      <div
        className="flex-1 overflow-auto px-8 py-8 min-w-0 bg-[var(--ch-bg-surface)]"
        onClick={() => {
          if (typeof editorRef === "object" && editorRef?.current) {
            editorRef.current.focus();
          }
        }}
      >
        <div
          ref={stripRef}
          className={`word-page-strip relative mx-auto ${
            pageFlow === "vertical" ? "word-page-strip-vertical" : ""
          }`}
          style={{ ...stripStyle, ...pageThemeStyle }}
        >
          <div
            className={`absolute inset-0 flex pointer-events-none ${
              pageFlow === "horizontal"
                ? "items-start"
                : "items-center flex-col"
            }`}
          >
            {pages.map((page) => (
              <div
                key={page}
                className="word-page-sheet shrink-0"
                style={{
                  ...pageStyle,
                  marginLeft:
                    pageFlow === "horizontal" && page !== 0
                      ? PAGE_GAP_PX
                      : undefined,
                  marginTop:
                    pageFlow === "vertical" && page !== 0
                      ? PAGE_GAP_PX
                      : undefined,
                }}
              />
            ))}
          </div>
          <div
            ref={assignEditorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={handleEditorInput}
            onPaste={onPaste}
            onKeyUp={onSelection}
            onMouseUp={onSelection}
            onKeyDown={handleKeyDown}
            style={editorStyle}
            className="word-editor-surface text-[14px] leading-relaxed font-sans focus:outline-none"
            data-placeholder="Start writing..."
          />
        </div>
      </div>

      <style jsx global>{`
        .word-page-strip,
        .word-page-sheet {
          box-sizing: border-box;
        }
        .word-editor-surface[data-placeholder]:empty::before,
        .word-editor-surface[data-placeholder]:has(> br:only-child)::before {
          content: attr(data-placeholder);
          color: var(--word-page-muted);
          pointer-events: none;
        }
        .word-editor-surface h1 {
          font-size: 22px;
          font-weight: 700;
          color: var(--word-page-heading);
          margin: 1em 0 0.4em;
          line-height: 1.2;
        }
        .word-editor-surface h2 {
          font-size: 17px;
          font-weight: 700;
          color: var(--word-page-subheading);
          margin: 0.9em 0 0.3em;
          line-height: 1.3;
        }
        .word-editor-surface p {
          margin: 0 0 0.6em;
        }
        .word-editor-surface > :first-child {
          margin-top: 0;
        }
        .word-editor-surface > :last-child {
          margin-bottom: 0;
        }
        .word-editor-surface ul,
        .word-editor-surface ol {
          margin: 0.4em 0 0.8em 1.4em;
        }
        .word-editor-surface li {
          margin-bottom: 0.2em;
        }
        .word-editor-surface blockquote {
          border-left: 3px solid var(--word-page-heading);
          padding: 0.2em 0 0.2em 0.9em;
          margin: 0.6em 0;
          color: var(--word-page-quote);
          font-style: italic;
        }
        .word-editor-surface a {
          color: #0f6c3f;
          text-decoration: underline;
        }
        .word-editor-surface ::selection {
          background: rgba(255, 179, 71, 0.22);
        }
      `}</style>
    </div>
  );
});

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
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  History,
  RemoveFormatting,
  Link as LinkIcon,
  Download,
  ChevronDown,
  Columns2,
  Palette,
} from "lucide-react";
import type { ExportFormat } from "./exporters";

type PageLayout = {
  id: string;
  label: string;
  meta: string;
  width: string;
  height: string;
  margin: string;
  columns: 1 | 2;
};

type PageFlow = "vertical" | "horizontal";

type PageColor = {
  id: string;
  label: string;
  background: string;
  text: string;
  muted: string;
  heading: string;
  subheading: string;
  quote: string;
  rule: string;
  ring: string;
};

const PAGE_GAP_PX = 36;
const INNER_COLUMN_GAP_PX = 28;
const MAX_PAGE_COUNT = 80;
const PAGE_COUNT_TOLERANCE_PX = 24;

const PAGE_LAYOUTS: PageLayout[] = [
  {
    id: "letter",
    label: "Letter",
    meta: '8.5" x 11"',
    width: "8.5in",
    height: "11in",
    margin: "1in",
    columns: 1,
  },
  {
    id: "legal",
    label: "Legal",
    meta: '8.5" x 14"',
    width: "8.5in",
    height: "14in",
    margin: "1in",
    columns: 1,
  },
  {
    id: "a4",
    label: "A4",
    meta: '8.27" x 11.69"',
    width: "8.27in",
    height: "11.69in",
    margin: "0.95in",
    columns: 1,
  },
  {
    id: "a5",
    label: "A5",
    meta: '5.83" x 8.27"',
    width: "5.83in",
    height: "8.27in",
    margin: "0.62in",
    columns: 1,
  },
  {
    id: "executive",
    label: "Executive",
    meta: '7.25" x 10.5"',
    width: "7.25in",
    height: "10.5in",
    margin: "0.78in",
    columns: 1,
  },
  {
    id: "letter-landscape-columns",
    label: "Book landscape columns",
    meta: '10.5" x 7.5" - 2 columns',
    width: "10.5in",
    height: "7.5in",
    margin: "0.62in",
    columns: 2,
  },
];

const PAGE_COLORS: PageColor[] = [
  {
    id: "theme",
    label: "Follow theme",
    background: "var(--ch-bg-elevated)",
    text: "var(--ch-text)",
    muted: "var(--ch-text-faint)",
    heading: "var(--ch-accent)",
    subheading: "var(--ch-text)",
    quote: "var(--ch-text-muted)",
    rule: "var(--ch-border-subtle)",
    ring: "var(--ch-border)",
  },
  {
    id: "default",
    label: "Default",
    background: "#efe0c2",
    text: "#1f1a14",
    muted: "#9d9489",
    heading: "#7a4307",
    subheading: "#17130f",
    quote: "#4f4941",
    rule: "rgba(91, 69, 42, 0.2)",
    ring: "rgba(106, 77, 39, 0.2)",
  },
  {
    id: "dull-tan",
    label: "Dull Tan",
    background: "#c7b08a",
    text: "#211a11",
    muted: "#6f604b",
    heading: "#623d12",
    subheading: "#211a11",
    quote: "#4d4334",
    rule: "rgba(61, 47, 28, 0.24)",
    ring: "rgba(61, 47, 28, 0.25)",
  },
  {
    id: "dark-grey",
    label: "Dark Grey",
    background: "#2b2b2b",
    text: "#eee9df",
    muted: "#aaa39a",
    heading: "#ffbd66",
    subheading: "#f7f0e6",
    quote: "#c9c0b5",
    rule: "rgba(255, 255, 255, 0.18)",
    ring: "rgba(255, 255, 255, 0.14)",
  },
  {
    id: "black",
    label: "Black",
    background: "#050505",
    text: "#f3eee6",
    muted: "#928b83",
    heading: "#ffb347",
    subheading: "#fff8ee",
    quote: "#c7beb3",
    rule: "rgba(255, 255, 255, 0.16)",
    ring: "rgba(255, 255, 255, 0.16)",
  },
];

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
  const [pageOpen, setPageOpen] = useState(false);
  const [pageColorOpen, setPageColorOpen] = useState(false);
  const [pageFlow, setPageFlow] = useState<PageFlow>("vertical");
  const [pageCount, setPageCount] = useState(1);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);
  const pageColorMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!pageOpen) return;
    const handler = (e: MouseEvent) => {
      if (!pageMenuRef.current?.contains(e.target as Node)) {
        setPageOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pageOpen]);

  useEffect(() => {
    if (!pageColorOpen) return;
    const handler = (e: MouseEvent) => {
      if (!pageColorMenuRef.current?.contains(e.target as Node)) {
        setPageColorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pageColorOpen]);

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
    PAGE_COLORS.find((color) => color.id === pageColorId) ?? PAGE_COLORS[1];
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
  const isBold = queryState("bold");
  const isItalic = queryState("italic");
  const isUnderline = queryState("underline");
  const isUL = queryState("insertUnorderedList");
  const isOL = queryState("insertOrderedList");
  const isH1 = block === "h1";
  const isH2 = block === "h2";
  const isP = block === "p" || (!isH1 && !isH2 && !block.startsWith("h"));
  const isQuote = block === "blockquote";

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
            className={`flex items-center gap-1 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
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
            <div className="absolute top-full right-0 mt-1 z-30 min-w-[180px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl overflow-hidden">
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

      <div className="px-3 py-1.5 border-b border-[var(--ch-border-subtle)] flex items-center gap-1 shrink-0 flex-wrap">
        <ToolbarBtn
          title="Bold (Ctrl+B)"
          onClick={() => exec("bold")}
          active={isBold}
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Italic (Ctrl+I)"
          onClick={() => exec("italic")}
          active={isItalic}
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Underline (Ctrl+U)"
          onClick={() => exec("underline")}
          active={isUnderline}
        >
          <Underline className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          title="Heading 1 (Ctrl+1)"
          onClick={() => handleHeading("H1")}
          active={isH1}
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Heading 2 (Ctrl+2)"
          onClick={() => handleHeading("H2")}
          active={isH2}
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Paragraph (Ctrl+0)"
          onClick={() => handleHeading("P")}
          active={isP && !isQuote && !isUL && !isOL}
        >
          <span className="text-[10px] font-mono">P</span>
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          title="Bulleted list"
          onClick={() => exec("insertUnorderedList")}
          active={isUL}
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Numbered list"
          onClick={() => exec("insertOrderedList")}
          active={isOL}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title="Block quote"
          onClick={() => handleHeading("BLOCKQUOTE")}
          active={isQuote}
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Insert link (Ctrl+K)" onClick={handleInsertLink}>
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          title="Clear formatting"
          onClick={() => exec("removeFormat")}
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Undo (Ctrl+Z)" onClick={() => exec("undo")}>
          <Undo2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Redo (Ctrl+Shift+Z)" onClick={() => exec("redo")}>
          <Redo2 className="w-3.5 h-3.5" />
        </ToolbarBtn>
        {canRestoreBackup && (
          <ToolbarBtn title="Restore latest backup" onClick={onRestoreBackup}>
            <History className="w-3.5 h-3.5" />
          </ToolbarBtn>
        )}
        <Divider />

        <div className="relative" ref={pageMenuRef}>
          <button
            type="button"
            onClick={() => setPageOpen((v) => !v)}
            onMouseDown={(e) => e.preventDefault()}
            title="Page size"
            className={`flex items-center gap-1.5 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
              pageOpen
                ? "border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
            }`}
          >
            {pageLayout.columns === 2 ? (
              <Columns2 className="w-3 h-3" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            {pageLayout.label}
            <ChevronDown className="w-3 h-3" />
          </button>
          {pageOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 min-w-[250px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl overflow-hidden">
              {PAGE_LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => {
                    setPageOpen(false);
                    onPageLayoutChange(layout.id);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left font-mono transition-colors ${
                    layout.id === pageLayout.id
                      ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                      : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {layout.columns === 2 ? (
                      <Columns2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="text-[11px] truncate">{layout.label}</span>
                  </span>
                  <span className="text-[9px] text-[var(--ch-text-faint)] shrink-0">
                    {layout.meta}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={pageColorMenuRef}>
          <button
            type="button"
            onClick={() => setPageColorOpen((v) => !v)}
            onMouseDown={(e) => e.preventDefault()}
            title="Page Color"
            className={`flex items-center gap-1.5 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
              pageColorOpen
                ? "border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
            }`}
          >
            <Palette className="w-3 h-3" />
            <span
              className="h-3 w-3 rounded-[2px] border border-[var(--ch-border-subtle)]"
              style={{ backgroundColor: pageColor.background }}
            />
            Page Color
            <ChevronDown className="w-3 h-3" />
          </button>
          {pageColorOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 min-w-[190px] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl overflow-hidden">
              {PAGE_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => {
                    setPageColorOpen(false);
                    onPageColorChange(color.id);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left font-mono transition-colors ${
                    color.id === pageColor.id
                      ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                      : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-[2px] border border-[var(--ch-border-subtle)] shrink-0"
                    style={{ backgroundColor: color.background }}
                  />
                  <span className="text-[11px] truncate">{color.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex h-7 overflow-hidden rounded-sm border border-[var(--ch-border-subtle)]">
          <button
            type="button"
            title="Scroll pages vertically"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPageFlow("vertical")}
            className={`px-2 text-[10px] uppercase tracking-widest font-mono transition-colors ${
              pageFlow === "vertical"
                ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                : "text-[var(--ch-text-muted)] hover:text-[var(--ch-accent)]"
            }`}
          >
            Vertical
          </button>
          <button
            type="button"
            title="Scroll pages horizontally"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPageFlow("horizontal")}
            className={`border-l border-[var(--ch-border-subtle)] px-2 text-[10px] uppercase tracking-widest font-mono transition-colors ${
              pageFlow === "horizontal"
                ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                : "text-[var(--ch-text-muted)] hover:text-[var(--ch-accent)]"
            }`}
          >
            Horizontal
          </button>
        </div>

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

function ToolbarBtn({
  title,
  onClick,
  children,
  active,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center border transition-colors ${
        active
          ? "rounded-full border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
          : "rounded-sm border-transparent hover:border-[#FFB347]/40 hover:bg-[var(--ch-accent-5)] text-[var(--ch-text-muted)] hover:text-[var(--ch-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-4 bg-[var(--ch-border-subtle)] mx-1" />;
}

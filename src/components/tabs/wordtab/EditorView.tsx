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
  FileUp,
  Save,
} from "lucide-react";
import type { ExportFormat } from "./exporters";
import {
  PAGE_LAYOUTS,
  PAGE_COLORS,
  FONT_FAMILIES,
  FONT_SIZES_PT,
  MARGIN_PRESETS,
  type StylePreset,
} from "./pageOptions";
import { RibbonTabs, type RibbonTabId } from "./ribbon/RibbonTabs";
import { HomeRibbon } from "./ribbon/HomeRibbon";
import { LayoutRibbon } from "./ribbon/LayoutRibbon";
import { ViewRibbon, type PageFlow } from "./ribbon/ViewRibbon";
import type { FormatState } from "./ribbon/shared";

const PAGE_GAP_PX = 36;
const INNER_COLUMN_GAP_PX = 28;
const MAX_PAGE_COUNT = 80;
const PAGE_COUNT_TOLERANCE_PX = 24;
const VERTICAL_PAGE_COUNT_TOLERANCE_PX = 1;
const CSS_IN_PX = 96;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const PAGE_WRAPPER_ATTR = "data-word-page-wrapper";

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
  onImport: (file: File) => void;
  canRestoreBackup: boolean;
  onRestoreBackup: () => void;
  pageLayoutId: string;
  onPageLayoutChange: (id: string) => void;
  pageColorId: string;
  onPageColorChange: (id: string) => void;
  orientation: "portrait" | "landscape";
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
  marginsId: string;
  onMarginsChange: (id: string) => void;
  columns: 1 | 2 | 3;
  onColumnsChange: (columns: 1 | 2 | 3) => void;
  fontFamilyId: string;
  onFontFamilyChange: (id: string) => void;
  fontSizePt: number;
  onFontSizeChange: (size: number) => void;
  lineSpacing: number;
  paragraphSpacingBeforePt: number;
  paragraphSpacingAfterPt: number;
  onSpacingChange: (line: number, before: number, after: number) => void;
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

function isBlockElement(node: Node): boolean {
  return (
    node instanceof HTMLElement &&
    /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL|TABLE|HR)$/i.test(node.tagName)
  );
}

function cssLengthToPx(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("in")) {
    return Number.parseFloat(trimmed) * CSS_IN_PX;
  }
  if (trimmed.endsWith("px")) {
    return Number.parseFloat(trimmed);
  }
  return Number.parseFloat(trimmed) || 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
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
    onImport,
    canRestoreBackup,
    onRestoreBackup,
    pageLayoutId,
    onPageLayoutChange,
    pageColorId,
    onPageColorChange,
    orientation,
    onOrientationChange,
    marginsId,
    onMarginsChange,
    columns,
    onColumnsChange,
    fontFamilyId,
    onFontFamilyChange,
    fontSizePt,
    onFontSizeChange,
    lineSpacing,
    paragraphSpacingBeforePt,
    paragraphSpacingAfterPt,
    onSpacingChange,
    exec,
    hidden,
  }: Props,
  editorRef: ForwardedRef<HTMLDivElement>
) {
  const [exportOpen, setExportOpen] = useState(false);
  const [activeRibbon, setActiveRibbon] = useState<RibbonTabId>("home");
  const [pageFlow, setPageFlow] = useState<PageFlow>("vertical");
  const [zoom, setZoom] = useState(100);
  const [showFormatting, setShowFormatting] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findMatchCase, setFindMatchCase] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findCount, setFindCount] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localEditorRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pageCountFrameRef = useRef<number | null>(null);
  const paginationMutatingRef = useRef(false);

  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
  }, []);

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
    (tag: "H1" | "H2" | "H3" | "P" | "BLOCKQUOTE") => {
      exec("formatBlock", tag);
    },
    [exec]
  );

  const getSelectionBlock = useCallback(() => {
    const editor = localEditorRef.current;
    const selection = window.getSelection();
    let node = selection?.anchorNode ?? null;
    if (!editor || !node || !editor.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== editor) {
      if (
        node instanceof HTMLElement &&
        /^(H1|H2|H3|P|BLOCKQUOTE|DIV)$/i.test(node.tagName)
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }, []);

  const handleStyle = useCallback(
    (style: StylePreset) => {
      exec("formatBlock", style.tag);
      window.requestAnimationFrame(() => {
        const block = getSelectionBlock();
        if (!block) return;
        block.classList.remove("word-style-title", "word-style-subtitle");
        if (style.className) {
          block.classList.add(style.className);
        }
        onInput();
      });
    },
    [exec, getSelectionBlock, onInput]
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

  const normalizeFonts = useCallback((kind: "size" | "face", value: string) => {
    const editor = localEditorRef.current;
    if (!editor) return;
    const selector = kind === "size" ? 'font[size="7"]' : "font[face]";
    editor.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const span = document.createElement("span");
      if (kind === "size") {
        span.style.fontSize = `${value}pt`;
      } else {
        span.style.fontFamily = value;
      }
      while (el.firstChild) span.appendChild(el.firstChild);
      el.replaceWith(span);
    });
    onInput();
  }, [onInput]);

  const handleFontFamily = useCallback(
    (id: string) => {
      const font = FONT_FAMILIES.find((item) => item.id === id) ?? FONT_FAMILIES[0];
      onFontFamilyChange(font.id);
      exec("fontName", font.stack);
      window.requestAnimationFrame(() => normalizeFonts("face", font.stack));
    },
    [exec, normalizeFonts, onFontFamilyChange]
  );

  const handleFontSize = useCallback(
    (size: number) => {
      onFontSizeChange(size);
      exec("fontSize", "7");
      window.requestAnimationFrame(() => normalizeFonts("size", String(size)));
    },
    [exec, normalizeFonts, onFontSizeChange]
  );

  const handleFontSizeStep = useCallback(
    (delta: number) => {
      const currentIndex = FONT_SIZES_PT.findIndex((size) => size === fontSizePt);
      const fallbackIndex = FONT_SIZES_PT.findIndex((size) => size >= fontSizePt);
      const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
      const nextIndex = Math.max(
        0,
        Math.min(FONT_SIZES_PT.length - 1, baseIndex + delta)
      );
      handleFontSize(FONT_SIZES_PT[nextIndex]);
    },
    [fontSizePt, handleFontSize]
  );

  const isSelectionInList = useCallback(() => {
    const editor = localEditorRef.current;
    const selection = window.getSelection();
    let node: Node | null = selection?.anchorNode ?? null;
    if (!editor || !node || !editor.contains(node)) return false;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== editor) {
      if (node instanceof HTMLElement && /^(UL|OL|LI)$/i.test(node.tagName)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const k = e.key.toLowerCase();
      if (k === "tab") {
        e.preventDefault();
        if (isSelectionInList()) {
          exec(e.shiftKey ? "outdent" : "indent");
        } else if (e.shiftKey) {
          exec("outdent");
        } else {
          exec(
            "insertHTML",
            '<span class="word-tab" style="display:inline-block;width:0.5in;"></span>'
          );
        }
        return;
      }
      if (k === "enter") {
        window.requestAnimationFrame(() => {
          localEditorRef.current?.dispatchEvent(
            new InputEvent("input", { bubbles: true })
          );
        });
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (k === "s") {
        e.preventDefault();
        onForceSave();
      } else if (k === "k") {
        e.preventDefault();
        handleInsertLink();
      } else if (k === "f") {
        e.preventDefault();
        setFindOpen(true);
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
    [exec, isSelectionInList, onForceSave, handleInsertLink, handleHeading]
  );

  const pageLayout =
    PAGE_LAYOUTS.find((layout) => layout.id === pageLayoutId) ?? PAGE_LAYOUTS[0];
  const pageColor =
    PAGE_COLORS.find((color) => color.id === pageColorId) ?? PAGE_COLORS[0];
  const fontFamily =
    FONT_FAMILIES.find((font) => font.id === fontFamilyId) ?? FONT_FAMILIES[0];
  const marginPreset =
    MARGIN_PRESETS.find((preset) => preset.id === marginsId) ?? MARGIN_PRESETS[0];
  const effectiveLayout = useMemo(
    () => ({
      ...pageLayout,
      width: orientation === "landscape" ? pageLayout.height : pageLayout.width,
      height: orientation === "landscape" ? pageLayout.width : pageLayout.height,
    }),
    [orientation, pageLayout]
  );
  const effectiveMargins = marginPreset.margins;
  const pageWidthPx = cssLengthToPx(effectiveLayout.width);
  const pageHeightPx = cssLengthToPx(effectiveLayout.height);
  const marginTopPx = cssLengthToPx(effectiveMargins.top);
  const marginRightPx = cssLengthToPx(effectiveMargins.right);
  const marginBottomPx = cssLengthToPx(effectiveMargins.bottom);
  const marginLeftPx = cssLengthToPx(effectiveMargins.left);
  const writingAreaWidthPx = Math.max(1, pageWidthPx - marginLeftPx - marginRightPx);
  const writingAreaHeightPx = Math.max(1, pageHeightPx - marginTopPx - marginBottomPx);
  const verticalPageGapPx = 12;
  const isVerticalMultiColumn = pageFlow === "vertical" && columns > 1;
  const effectivePageFlow: PageFlow = pageFlow;
  const horizontalPageStridePx =
    columns > 1 ? writingAreaWidthPx + INNER_COLUMN_GAP_PX : pageWidthPx + PAGE_GAP_PX;
  const horizontalPageGapPx = horizontalPageStridePx - pageWidthPx;
  const pageWrapperGapPx = pageHeightPx + verticalPageGapPx - writingAreaHeightPx;
  const innerColumnWidthPx =
    columns > 1
      ? (writingAreaWidthPx - INNER_COLUMN_GAP_PX * (columns - 1)) / columns
      : writingAreaWidthPx;
  const columnRuleOffsets = useMemo(
    () =>
      columns > 1
        ? Array.from(
            { length: columns - 1 },
            (_, index) =>
              marginLeftPx +
              innerColumnWidthPx * (index + 1) +
              INNER_COLUMN_GAP_PX * index +
              INNER_COLUMN_GAP_PX / 2
          )
        : [],
    [columns, innerColumnWidthPx, marginLeftPx]
  );
  const pagePeriodPx =
    effectivePageFlow === "vertical"
      ? pageHeightPx + verticalPageGapPx
      : pageHeightPx + PAGE_GAP_PX;
  const stripStyle = useMemo<CSSProperties>(
    () => ({
      width:
        effectivePageFlow === "horizontal"
          ? pageWidthPx + horizontalPageStridePx * (pageCount - 1)
          : pageWidthPx,
      height:
        effectivePageFlow === "horizontal"
          ? pageHeightPx
          : pageHeightPx * pageCount + verticalPageGapPx * (pageCount - 1),
    }),
    [
      effectivePageFlow,
      horizontalPageStridePx,
      pageCount,
      pageHeightPx,
      pageWidthPx,
      verticalPageGapPx,
    ]
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
      position: "relative",
      width: pageWidthPx,
      height: pageHeightPx,
      borderRadius: "7px",
      backgroundColor: "var(--word-page-bg)",
      boxShadow:
        "0 18px 44px rgba(0, 0, 0, 0.32), 0 0 0 1px var(--word-page-ring)",
    }),
    [pageHeightPx, pageWidthPx]
  );
  const editorStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      top: marginTopPx,
      left: marginLeftPx,
      width: writingAreaWidthPx,
      height:
        effectivePageFlow === "horizontal" || isVerticalMultiColumn
          ? writingAreaHeightPx
          : undefined,
      minHeight: writingAreaHeightPx,
      outline: "none",
      columnFill: "auto",
      columnWidth:
        effectivePageFlow === "horizontal"
          ? columns > 1
            ? innerColumnWidthPx
            : writingAreaWidthPx
          : undefined,
      columnCount:
        effectivePageFlow === "vertical" && columns > 1 && !isVerticalMultiColumn
          ? columns
          : undefined,
      columnGap:
        effectivePageFlow === "horizontal"
          ? columns > 1
            ? `${INNER_COLUMN_GAP_PX}px`
            : `${marginRightPx + marginLeftPx + PAGE_GAP_PX}px`
          : columns > 1 && !isVerticalMultiColumn
          ? `${INNER_COLUMN_GAP_PX}px`
          : undefined,
      columnRule:
        undefined,
      overflow: "visible",
      color: "var(--word-page-text)",
      fontFamily: "var(--word-font-family)",
      fontSize: "var(--word-font-size)",
      lineHeight: "var(--word-line-height)",
      "--word-font-family": fontFamily.stack,
      "--word-font-size": `${fontSizePt}pt`,
      "--word-line-height": lineSpacing,
      "--word-para-before": `${paragraphSpacingBeforePt}pt`,
      "--word-para-after": `${paragraphSpacingAfterPt}pt`,
    } as CSSProperties),
    [
      columns,
      fontFamily,
      fontSizePt,
      innerColumnWidthPx,
      isVerticalMultiColumn,
      lineSpacing,
      marginLeftPx,
      marginRightPx,
      marginTopPx,
      effectivePageFlow,
      paragraphSpacingAfterPt,
      paragraphSpacingBeforePt,
      writingAreaHeightPx,
      writingAreaWidthPx,
    ]
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
  const normalizeTopLevelBlocks = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const pending: Node[] = [];
    const flush = (before: Node | null) => {
      if (!pending.length) return;
      const paragraph = document.createElement("p");
      pending.forEach((child) => paragraph.appendChild(child));
      node.insertBefore(paragraph, before);
      pending.length = 0;
    };
    Array.from(node.childNodes).forEach((child) => {
      if (isBlockElement(child)) {
        flush(child);
        return;
      }
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
        return;
      }
      pending.push(child);
    });
    flush(null);
  }, []);

  const placeCaretAtEnd = useCallback((target: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const focusEditorWithoutScroll = useCallback((target: HTMLElement) => {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }, []);

  const unwrapPageWrappers = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    Array.from(node.querySelectorAll<HTMLElement>(`[${PAGE_WRAPPER_ATTR}]`)).forEach(
      (wrapper) => {
        while (wrapper.firstChild) {
          wrapper.parentNode?.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
      }
    );
  }, []);

  const createPageWrapper = useCallback(() => {
    const page = document.createElement("div");
    page.setAttribute(PAGE_WRAPPER_ATTR, "true");
    page.className = "word-page-content";
    page.style.width = `${writingAreaWidthPx}px`;
    page.style.height = `${writingAreaHeightPx}px`;
    page.style.marginBottom = `${pageWrapperGapPx}px`;
    page.style.columnCount = String(columns);
    page.style.columnGap = `${INNER_COLUMN_GAP_PX}px`;
    page.style.columnFill = "auto";
    return page;
  }, [columns, pageWrapperGapPx, writingAreaHeightPx, writingAreaWidthPx]);

  const applyMultiColumnPageWrappers = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    node.dataset.wordPaginating = "true";
    try {
      unwrapPageWrappers();
      normalizeTopLevelBlocks();
      node.querySelectorAll<HTMLElement>("[data-word-auto-break]").forEach((child) => {
        child.style.marginTop = child.dataset.wordOriginalMarginTop ?? "";
        delete child.dataset.wordAutoBreak;
        delete child.dataset.wordOriginalMarginTop;
      });

      const children = Array.from(node.childNodes);
      if (!children.length) return;

      const pages: HTMLElement[] = [];
      const makePage = () => {
        const page = createPageWrapper();
        pages.push(page);
        node.appendChild(page);
        return page;
      };

      let page = makePage();
      children.forEach((child) => {
        page.appendChild(child);
        const hasOverflow =
          page.scrollWidth > writingAreaWidthPx + PAGE_COUNT_TOLERANCE_PX;
        if (hasOverflow && page.childNodes.length > 1) {
          page.removeChild(child);
          page = makePage();
          page.appendChild(child);
        }
      });

      pages.forEach((item, index) => {
        if (index === pages.length - 1) {
          item.style.marginBottom = "0px";
        }
      });
    } finally {
      window.requestAnimationFrame(() => {
        delete node.dataset.wordPaginating;
      });
    }
  }, [
    createPageWrapper,
    normalizeTopLevelBlocks,
    unwrapPageWrappers,
    writingAreaWidthPx,
  ]);

  const clearAutoPageOffsets = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return [];
    const children = Array.from(
      node.querySelectorAll<HTMLElement>("[data-word-auto-break]")
    );
    children.forEach((child) => {
      child.style.marginTop = child.dataset.wordOriginalMarginTop ?? "";
      delete child.dataset.wordAutoBreak;
      delete child.dataset.wordOriginalMarginTop;
    });
    return children;
  }, []);

  const clearVerticalParagraphPushes = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    node
      .querySelectorAll<HTMLElement>("[data-word-page-push]")
      .forEach((child) => {
        child.style.marginTop = child.dataset.wordOriginalPagePushMt ?? "";
        if (!child.getAttribute("style")) child.removeAttribute("style");
        delete child.dataset.wordOriginalPagePushMt;
        delete child.dataset.wordPagePush;
      });
  }, []);

  // In single-column vertical mode, walk top-level blocks and push any block
  // whose bottom would straddle a page boundary down to the start of the next
  // page. Without this, paragraphs visually overlap the page seam.
  const applyVerticalParagraphPushes = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    clearVerticalParagraphPushes();
    const children = Array.from(node.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );
    children.forEach((child) => {
      const top = child.offsetTop;
      const height = child.offsetHeight;
      if (!height || height > writingAreaHeightPx) return;
      const topInPage = positiveModulo(top, pagePeriodPx);
      if (
        topInPage + height <=
        writingAreaHeightPx + VERTICAL_PAGE_COUNT_TOLERANCE_PX
      ) {
        return;
      }
      const pushPx = pagePeriodPx - topInPage;
      if (pushPx <= 0) return;
      const computed = window.getComputedStyle(child);
      const originalPx = Number.parseFloat(computed.marginTop || "0") || 0;
      child.dataset.wordOriginalPagePushMt = child.style.marginTop || "";
      child.dataset.wordPagePush = "true";
      child.style.marginTop = `${originalPx + pushPx}px`;
    });
  }, [clearVerticalParagraphPushes, pagePeriodPx, writingAreaHeightPx]);

  const applyVerticalPageOffsets = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    if (isVerticalMultiColumn) {
      clearVerticalParagraphPushes();
      applyMultiColumnPageWrappers();
      return;
    }
    unwrapPageWrappers();
    normalizeTopLevelBlocks();
    clearAutoPageOffsets();
    applyVerticalParagraphPushes();
  }, [
    applyMultiColumnPageWrappers,
    applyVerticalParagraphPushes,
    clearAutoPageOffsets,
    clearVerticalParagraphPushes,
    isVerticalMultiColumn,
    normalizeTopLevelBlocks,
    unwrapPageWrappers,
  ]);

  const correctSelectionPageGap = useCallback(() => {
    clearAutoPageOffsets();
  }, [clearAutoPageOffsets]);

  const updatePageCount = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    paginationMutatingRef.current = true;
    node.dataset.wordPaginating = "true";
    applyVerticalPageOffsets();
    correctSelectionPageGap();
    window.requestAnimationFrame(() => {
      paginationMutatingRef.current = false;
      if (node.dataset.wordPaginating === "true") {
        delete node.dataset.wordPaginating;
      }
    });
    let nextPageCount = 1;
    if (isVerticalMultiColumn) {
      nextPageCount = Math.max(
        1,
        node.querySelectorAll<HTMLElement>(`[${PAGE_WRAPPER_ATTR}]`).length
      );
    } else if (effectivePageFlow === "horizontal") {
      const style = window.getComputedStyle(node);
      const columnGap = Number.parseFloat(style.columnGap || "0") || 0;
      const columnWidth =
        Number.parseFloat(style.columnWidth || "0") || node.clientWidth || 1;
      const columnSegments = Math.max(
        1,
        Math.ceil(
          (node.scrollWidth + columnGap - PAGE_COUNT_TOLERANCE_PX) /
            (columnWidth + columnGap)
        )
      );
      nextPageCount =
        columns > 1 ? Math.ceil(columnSegments / columns) : columnSegments;
    } else {
      const contentBottom = Array.from(node.children).reduce((bottom, child) => {
        if (!(child instanceof HTMLElement)) return bottom;
        return Math.max(bottom, child.offsetTop + child.offsetHeight);
      }, node.scrollHeight);
      if (contentBottom > writingAreaHeightPx + VERTICAL_PAGE_COUNT_TOLERANCE_PX) {
        nextPageCount =
          Math.floor(
            (contentBottom -
              writingAreaHeightPx -
              VERTICAL_PAGE_COUNT_TOLERANCE_PX) /
              pagePeriodPx
          ) + 2;
      }
    }
    const boundedPageCount = Math.min(MAX_PAGE_COUNT, Math.max(1, nextPageCount));
    setPageCount((current) =>
      current === boundedPageCount ? current : boundedPageCount
    );
  }, [
    applyVerticalPageOffsets,
    correctSelectionPageGap,
    columns,
    effectivePageFlow,
    isVerticalMultiColumn,
    pagePeriodPx,
    writingAreaHeightPx,
  ]);
  const schedulePageCountUpdate = useCallback(() => {
    if (pageCountFrameRef.current !== null) return;
    pageCountFrameRef.current = window.requestAnimationFrame(() => {
      pageCountFrameRef.current = null;
      updatePageCount();
    });
  }, [updatePageCount]);
  const handleInsertPageBreak = useCallback(() => {
    exec(
      "insertHTML",
      '<div data-word-page-break="true" style="break-before: page; page-break-before: always; height: 0; margin: 0;"></div><p><br></p>'
    );
    schedulePageCountUpdate();
  }, [exec, schedulePageCountUpdate]);
  const handleEditorInput = useCallback(() => {
    onInput();
    applyVerticalPageOffsets();
    correctSelectionPageGap();
    schedulePageCountUpdate();
  }, [
    applyVerticalPageOffsets,
    correctSelectionPageGap,
    onInput,
    schedulePageCountUpdate,
  ]);

  const placeCaretAtStart = useCallback(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const handleEditorMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const node = localEditorRef.current;
      if (!node) return;
      if (effectivePageFlow === "vertical") {
        // editorRect / e.clientY are in viewport CSS pixels which already
        // include CSS `zoom`. pagePeriodPx / writingAreaHeightPx are layout
        // values computed without zoom. Scale the screen-space pointer offset
        // back into layout space before the gap check, otherwise non-100%
        // zoom levels produce a recurring 36-px band where legitimate clicks
        // land in the "gap" by accident and get redirected to the doc end.
        const zoomScale = zoom / 100 || 1;
        const editorRect = node.getBoundingClientRect();
        const pointerY = (e.clientY - editorRect.top) / zoomScale;
        const pointerInPage = positiveModulo(pointerY, pagePeriodPx);
        if (pointerInPage > writingAreaHeightPx) {
          e.preventDefault();
          focusEditorWithoutScroll(node);
          const lastBlock = Array.from(node.children)
            .reverse()
            .find((child): child is HTMLElement => child instanceof HTMLElement);
          if (lastBlock) {
            placeCaretAtEnd(lastBlock);
            correctSelectionPageGap();
          }
          return;
        }
      }
      const isEmpty = !node.innerText.trim() && !node.querySelector("img, table");
      if (!isEmpty) return;
      e.preventDefault();
      const scroller = node.closest(".word-editor-viewer");
      const scrollTop = scroller?.scrollTop ?? 0;
      const scrollLeft = scroller?.scrollLeft ?? 0;
      focusEditorWithoutScroll(node);
      placeCaretAtStart();
      if (scroller) {
        scroller.scrollTop = scrollTop;
        scroller.scrollLeft = scrollLeft;
      }
    },
    [
      correctSelectionPageGap,
      effectivePageFlow,
      focusEditorWithoutScroll,
      pagePeriodPx,
      placeCaretAtEnd,
      placeCaretAtStart,
      writingAreaHeightPx,
      zoom,
    ]
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPageCount(1);
      updatePageCount();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (pageCountFrameRef.current !== null) {
        window.cancelAnimationFrame(pageCountFrameRef.current);
        pageCountFrameRef.current = null;
      }
    };
  }, [columns, effectivePageFlow, marginsId, orientation, pageLayoutId, updatePageCount]);

  useEffect(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (paginationMutatingRef.current || node.dataset.wordPaginating === "true") {
        return;
      }
      schedulePageCountUpdate();
    });
    observer.observe(node);
    schedulePageCountUpdate();
    return () => observer.disconnect();
  }, [schedulePageCountUpdate]);

  useEffect(() => {
    const node = localEditorRef.current;
    if (!node) return;
    const observer = new MutationObserver(() => {
      if (node.dataset.wordPaginating === "true") return;
      schedulePageCountUpdate();
    });
    observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [schedulePageCountUpdate]);

  useEffect(() => {
    applyVerticalPageOffsets();
    correctSelectionPageGap();
    schedulePageCountUpdate();
  }, [applyVerticalPageOffsets, correctSelectionPageGap, schedulePageCountUpdate]);

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
    { id: "rtf", label: "Rich text", ext: ".rtf" },
    { id: "pdf", label: "PDF (via print)", ext: ".pdf" },
  ];

  const clearFindMarks = useCallback(() => {
    const editor = localEditorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>("mark[data-word-find]").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      mark.remove();
      parent.normalize();
    });
  }, []);

  const makeFindRegex = useCallback(() => {
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return null;
    return new RegExp(
      findWholeWord ? `\\b${escaped}\\b` : escaped,
      findMatchCase ? "g" : "gi"
    );
  }, [findMatchCase, findQuery, findWholeWord]);

  const highlightFindMatches = useCallback(() => {
    const editor = localEditorRef.current;
    clearFindMarks();
    const regex = makeFindRegex();
    if (!editor || !regex) {
      setFindCount(0);
      return;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.trim()) nodes.push(node);
    }
    let count = 0;
    nodes.forEach((node) => {
      const text = node.textContent ?? "";
      regex.lastIndex = 0;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      text.replace(regex, (match, offset: number) => {
        if (offset > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
        }
        const mark = document.createElement("mark");
        mark.dataset.wordFind = "true";
        mark.textContent = match;
        fragment.appendChild(mark);
        count += 1;
        lastIndex = offset + match.length;
        return match;
      });
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      node.replaceWith(fragment);
    });
    setFindCount(count);
  }, [clearFindMarks, makeFindRegex]);

  useEffect(() => {
    if (!findOpen) {
      clearFindMarks();
      setFindCount(0);
      return;
    }
    const handle = window.setTimeout(highlightFindMatches, 120);
    return () => window.clearTimeout(handle);
  }, [clearFindMarks, findOpen, highlightFindMatches]);

  const handleReplaceAll = useCallback(() => {
    const editor = localEditorRef.current;
    const regex = makeFindRegex();
    if (!editor || !regex) return;
    clearFindMarks();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    nodes.forEach((node) => {
      regex.lastIndex = 0;
      node.textContent = (node.textContent ?? "").replace(regex, replaceQuery);
    });
    onInput();
    window.requestAnimationFrame(highlightFindMatches);
  }, [clearFindMarks, highlightFindMatches, makeFindRegex, onInput, replaceQuery]);

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
        <button
          type="button"
          onClick={onForceSave}
          title="Save now (Ctrl+S)"
          className="flex items-center gap-1 px-2 py-1 border border-[var(--ch-border-subtle)] rounded-sm text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
        <span
          className={`text-[9px] uppercase tracking-widest font-mono ${
            isSaving
              ? "text-[var(--ch-accent)] opacity-80"
              : "text-[var(--ch-success)] opacity-80"
          }`}
        >
          {isSaving ? "Saving..." : savedAtLabel}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.html,.htm,.md,.markdown,.txt,.rtf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onImport(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onMouseDown={(e) => e.preventDefault()}
          title="Import / open file"
          className="clouds-coding-dropdown-button flex items-center gap-1 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
        >
          <FileUp className="w-3 h-3" />
          Import
        </button>
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

      <RibbonTabs
        active={activeRibbon}
        onChange={setActiveRibbon}
        zoom={zoom}
        onZoomChange={handleZoomChange}
      />

      <div className="px-3 py-1.5 border-b border-[var(--ch-border-subtle)] flex items-center gap-1 shrink-0 flex-wrap min-h-[44px]">
        {activeRibbon === "home" && (
          <HomeRibbon
            exec={exec}
            applyHighlight={applyHighlight}
            onHeading={handleHeading}
            onStyle={handleStyle}
            fontFamilyId={fontFamilyId}
            fontSizePt={fontSizePt}
            lineSpacing={lineSpacing}
            paragraphSpacingBeforePt={paragraphSpacingBeforePt}
            paragraphSpacingAfterPt={paragraphSpacingAfterPt}
            onFontFamilyChange={handleFontFamily}
            onFontSizeChange={handleFontSize}
            onFontSizeStep={handleFontSizeStep}
            onSpacingChange={onSpacingChange}
            onInsertLink={handleInsertLink}
            onFindOpen={() => setFindOpen(true)}
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
            orientation={orientation}
            onOrientationChange={onOrientationChange}
            marginsId={marginsId}
            onMarginsChange={onMarginsChange}
            columns={columns}
            onColumnsChange={onColumnsChange}
            onInsertPageBreak={handleInsertPageBreak}
          />
        )}
        {activeRibbon === "view" && (
          <ViewRibbon
            pageFlow={pageFlow}
            onPageFlowChange={setPageFlow}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            showFormatting={showFormatting}
            onShowFormattingChange={setShowFormatting}
          />
        )}
      </div>

      {findOpen && (
        <div className="px-3 py-2 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] flex items-center gap-2 shrink-0 flex-wrap">
          <input
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find"
            className="h-7 w-36 bg-transparent border border-[var(--ch-border-subtle)] rounded-sm px-2 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
          />
          <input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            className="h-7 w-36 bg-transparent border border-[var(--ch-border-subtle)] rounded-sm px-2 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
          />
          <button
            type="button"
            onClick={handleReplaceAll}
            className="h-7 px-2 border border-[var(--ch-border-subtle)] rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
          >
            Replace all
          </button>
          <label className="h-7 px-2 border border-transparent rounded-sm flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)]">
            <input
              type="checkbox"
              checked={findMatchCase}
              onChange={(e) => setFindMatchCase(e.target.checked)}
              className="accent-[var(--ch-accent)]"
            />
            Case
          </label>
          <label className="h-7 px-2 border border-transparent rounded-sm flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)]">
            <input
              type="checkbox"
              checked={findWholeWord}
              onChange={(e) => setFindWholeWord(e.target.checked)}
              className="accent-[var(--ch-accent)]"
            />
            Word
          </label>
          <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
            {findCount} found
          </span>
          <button
            type="button"
            onClick={() => setFindOpen(false)}
            className="h-7 px-2 border border-[var(--ch-border-subtle)] rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] transition-colors"
          >
            Close
          </button>
        </div>
      )}

      <div
        className="word-editor-viewer flex-1 overflow-auto px-8 py-8 min-w-0 bg-[var(--ch-bg-surface)]"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          e.preventDefault();
          onImport(file);
        }}
        onClick={(e) => {
          if (typeof editorRef === "object" && editorRef?.current) {
            if (editorRef.current.contains(e.target as Node)) return;
            focusEditorWithoutScroll(editorRef.current);
          }
        }}
      >
        <div
          ref={stripRef}
          className={`word-page-strip relative mx-auto ${
            effectivePageFlow === "vertical" ? "word-page-strip-vertical" : ""
          }`}
          style={{
            ...stripStyle,
            ...pageThemeStyle,
            zoom: `${zoom}%`,
          } as CSSProperties}
        >
          <div
            className={`absolute inset-0 flex pointer-events-none ${
              effectivePageFlow === "horizontal"
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
                    effectivePageFlow === "horizontal" && page !== 0
                      ? horizontalPageGapPx
                      : undefined,
                  marginTop:
                    effectivePageFlow === "vertical" && page !== 0
                      ? verticalPageGapPx
                      : undefined,
                }}
              >
                {columnRuleOffsets.map((left) => (
                  <div
                    key={left}
                    className="absolute pointer-events-none"
                    style={{
                      left,
                      top: marginTopPx,
                      width: 1,
                      height: writingAreaHeightPx,
                      backgroundColor: "var(--word-page-rule)",
                    }}
                  />
                ))}
              </div>
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
            onMouseDown={handleEditorMouseDown}
            onKeyDown={handleKeyDown}
            style={editorStyle}
            className={`word-editor-surface text-[14px] leading-relaxed font-sans focus:outline-none ${
              showFormatting ? "word-show-formatting" : ""
            }`}
            data-placeholder="Start writing..."
          />
        </div>
      </div>

      <style jsx global>{`
        .word-page-strip,
        .word-page-sheet {
          box-sizing: border-box;
        }
        .word-editor-surface {
          position: relative;
          caret-color: var(--word-page-text);
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .word-page-content {
          overflow: visible;
        }
        .word-editor-surface :where(p, h1, h2, h3, li, blockquote, div) {
          max-width: 100%;
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .word-editor-surface[data-placeholder]:empty::before,
        .word-editor-surface[data-placeholder]:has(> br:only-child)::before {
          content: attr(data-placeholder);
          display: block;
          position: absolute;
          top: 0;
          left: 0;
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
        .word-editor-surface h3 {
          font-size: 14px;
          font-weight: 700;
          color: var(--word-page-subheading);
          margin: 0.8em 0 0.25em;
          line-height: 1.35;
        }
        .word-editor-surface .word-style-title {
          font-size: 26px;
          font-weight: 700;
          color: var(--word-page-heading);
          margin: 0 0 0.35em;
          line-height: 1.15;
        }
        .word-editor-surface .word-style-subtitle {
          font-size: 15px;
          color: var(--word-page-quote);
          margin: 0 0 0.9em;
          line-height: 1.35;
        }
        .word-editor-surface p {
          margin: var(--word-para-before) 0 var(--word-para-after);
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
        .word-editor-surface [data-word-page-break] {
          break-before: page;
          page-break-before: always;
          height: 0;
          margin: 0;
        }
        .word-editor-surface.word-show-formatting p::after,
        .word-editor-surface.word-show-formatting h1::after,
        .word-editor-surface.word-show-formatting h2::after,
        .word-editor-surface.word-show-formatting h3::after,
        .word-editor-surface.word-show-formatting li::after,
        .word-editor-surface.word-show-formatting blockquote::after {
          content: " ¶";
          color: var(--word-page-muted);
          font-weight: 400;
        }
        .word-editor-surface.word-show-formatting [data-word-page-break]::after {
          content: "Page break";
          display: block;
          border-top: 1px dashed var(--word-page-rule);
          color: var(--word-page-muted);
          font-size: 9px;
          font-family: var(--word-font-family);
          text-align: center;
        }
        .word-editor-surface mark[data-word-find] {
          background: rgba(255, 179, 71, 0.42);
          color: inherit;
          padding: 0 1px;
        }
        .word-editor-surface a {
          color: #0f6c3f;
          text-decoration: underline;
        }
        .word-editor-surface img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 0.35em 0;
        }
        .word-editor-surface table {
          max-width: 100%;
          border-collapse: collapse;
          table-layout: auto;
        }
        .word-editor-surface td,
        .word-editor-surface th {
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        .word-editor-surface ::selection {
          background: rgba(255, 179, 71, 0.22);
        }
      `}</style>
    </div>
  );
});

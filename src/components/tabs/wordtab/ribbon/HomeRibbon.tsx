"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
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
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Indent,
  Outdent,
  Baseline,
  Highlighter,
  Type,
  Search,
} from "lucide-react";
import {
  ToolbarBtn,
  Divider,
  DropdownButton,
  type FormatState,
} from "./shared";
import {
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  FONT_FAMILIES,
  FONT_SIZES_PT,
  LINE_SPACING_PRESETS,
  PARAGRAPH_SPACING_PRESETS,
  STYLE_PRESETS,
  type FontFamily,
  type StylePreset,
} from "../pageOptions";

const FONT_RECENTS_KEY = "wordtab-font-recents";
const FONT_RECENTS_MAX = 5;

function loadFontRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FONT_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function saveFontRecents(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FONT_RECENTS_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage full / disabled — non-fatal */
  }
}

type FontPickerBodyProps = {
  fonts: FontFamily[];
  selectedId: string;
  recents: string[];
  onPick: (id: string) => void;
};

function FontPickerBody({
  fonts,
  selectedId,
  recents,
  onPick,
}: FontPickerBodyProps) {
  const [query, setQuery] = useState("");
  const fontsById = useMemo(() => {
    const map = new Map<string, FontFamily>();
    fonts.forEach((f) => map.set(f.id, f));
    return map;
  }, [fonts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fonts;
    return fonts.filter((f) => f.label.toLowerCase().includes(q));
  }, [fonts, query]);

  const recentEntries = useMemo(() => {
    if (query.trim()) return [];
    return recents
      .map((id) => fontsById.get(id))
      .filter((f): f is FontFamily => Boolean(f));
  }, [fontsById, query, recents]);

  const renderRow = (font: FontFamily) => (
    <button
      key={font.id}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(font.id)}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left font-mono transition-colors ${
        font.id === selectedId
          ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
          : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
      }`}
    >
      <span className="text-[11px] truncate" style={{ fontFamily: font.stack }}>
        {font.label}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col max-h-[320px] min-w-[220px]">
      <div className="p-2 border-b border-[var(--ch-border-subtle)] shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ch-text-faint)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts..."
            className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm pl-7 pr-2 py-1 text-[11px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-text-faint)] focus:outline-none focus:border-[#FFB347]/50"
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {recentEntries.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
              Recent
            </div>
            {recentEntries.map(renderRow)}
            <div className="my-1 border-t border-[var(--ch-border-subtle)]" />
          </>
        )}
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-[11px] font-mono text-[var(--ch-text-faint)] italic">
            No fonts match
          </div>
        ) : (
          filtered.map(renderRow)
        )}
      </div>
    </div>
  );
}

type Props = {
  exec: (cmd: string, value?: string) => void;
  applyHighlight: (color: string) => void;
  onHeading: (tag: "H1" | "H2" | "H3" | "P" | "BLOCKQUOTE") => void;
  onStyle: (style: StylePreset) => void;
  fontFamilyId: string;
  fontSizePt: number;
  lineSpacing: number;
  paragraphSpacingBeforePt: number;
  paragraphSpacingAfterPt: number;
  onFontFamilyChange: (id: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontSizeStep: (delta: number) => void;
  onSpacingChange: (line: number, before: number, after: number) => void;
  onInsertLink: () => void;
  onFindOpen: () => void;
  formatState: FormatState;
  canRestoreBackup: boolean;
  onRestoreBackup: () => void;
};

export function HomeRibbon({
  exec,
  applyHighlight,
  onHeading,
  onStyle,
  fontFamilyId,
  fontSizePt,
  lineSpacing,
  paragraphSpacingBeforePt,
  paragraphSpacingAfterPt,
  onFontFamilyChange,
  onFontSizeChange,
  onFontSizeStep,
  onSpacingChange,
  onInsertLink,
  onFindOpen,
  formatState,
  canRestoreBackup,
  onRestoreBackup,
}: Props) {
  const {
    isBold,
    isItalic,
    isUnderline,
    isStrike,
    isSub,
    isSuper,
    isUL,
    isOL,
    isH1,
    isH2,
    isP,
    isQuote,
    isAlignLeft,
    isAlignCenter,
    isAlignRight,
    isAlignJustify,
  } = formatState;
  const fontFamily =
    FONT_FAMILIES.find((font) => font.id === fontFamilyId) ?? FONT_FAMILIES[0];

  const [fontRecents, setFontRecents] = useState<string[]>([]);
  useEffect(() => {
    setFontRecents(loadFontRecents());
  }, []);
  const handleFontPick = (close: () => void) => (id: string) => {
    close();
    onFontFamilyChange(id);
    setFontRecents((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(
        0,
        FONT_RECENTS_MAX
      );
      saveFontRecents(next);
      return next;
    });
  };

  return (
    <>
      <DropdownButton
        title="Font family"
        icon={<Type className="w-3 h-3" />}
        label={fontFamily.label}
        panelClass="min-w-[220px] p-0"
      >
        {(close) => (
          <FontPickerBody
            fonts={FONT_FAMILIES}
            selectedId={fontFamily.id}
            recents={fontRecents}
            onPick={handleFontPick(close)}
          />
        )}
      </DropdownButton>

      <DropdownButton
        title="Font size"
        label={`${fontSizePt} pt`}
        panelClass="min-w-[92px] max-h-[260px] overflow-auto"
      >
        {(close) => (
          <>
            {FONT_SIZES_PT.map((size) => (
              <button
                key={size}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onFontSizeChange(size);
                }}
                className={`w-full px-3 py-1.5 text-left text-[11px] font-mono transition-colors ${
                  size === fontSizePt
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                {size}
              </button>
            ))}
          </>
        )}
      </DropdownButton>
      <ToolbarBtn title="Grow font" onClick={() => onFontSizeStep(1)}>
        <span className="text-[10px] font-mono">A+</span>
      </ToolbarBtn>
      <ToolbarBtn title="Shrink font" onClick={() => onFontSizeStep(-1)}>
        <span className="text-[10px] font-mono">A-</span>
      </ToolbarBtn>

      <Divider />

      {/* Inline formatting */}
      <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => exec("bold")} active={isBold}>
        <Bold className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => exec("italic")} active={isItalic}>
        <Italic className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => exec("underline")} active={isUnderline}>
        <Underline className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Strikethrough" onClick={() => exec("strikeThrough")} active={isStrike}>
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Subscript" onClick={() => exec("subscript")} active={isSub}>
        <Subscript className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Superscript" onClick={() => exec("superscript")} active={isSuper}>
        <Superscript className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <Divider />

      {/* Font color */}
      <DropdownButton
        title="Font color"
        icon={<Baseline className="w-3 h-3" />}
        label="Color"
        panelClass="min-w-[180px] p-2"
      >
        {(close) => (
          <div className="grid grid-cols-6 gap-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  if (!c.value) {
                    exec("removeFormat");
                  } else {
                    exec("foreColor", c.value);
                  }
                }}
                className="w-6 h-6 rounded-sm border border-[var(--ch-border-subtle)] hover:border-[var(--ch-accent)] transition-colors"
                style={{
                  backgroundColor: c.value || "transparent",
                  backgroundImage: c.value
                    ? undefined
                    : "linear-gradient(135deg, transparent 45%, var(--ch-text-muted) 45%, var(--ch-text-muted) 55%, transparent 55%)",
                }}
              />
            ))}
          </div>
        )}
      </DropdownButton>

      {/* Highlight color */}
      <DropdownButton
        title="Highlight"
        icon={<Highlighter className="w-3 h-3" />}
        label="Hi-light"
        panelClass="min-w-[180px] p-2"
      >
        {(close) => (
          <div className="grid grid-cols-5 gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  applyHighlight(c.value);
                }}
                className="w-6 h-6 rounded-sm border border-[var(--ch-border-subtle)] hover:border-[var(--ch-accent)] transition-colors"
                style={{
                  backgroundColor:
                    c.value === "transparent" ? "transparent" : c.value,
                  backgroundImage:
                    c.value === "transparent"
                      ? "linear-gradient(135deg, transparent 45%, var(--ch-text-muted) 45%, var(--ch-text-muted) 55%, transparent 55%)"
                      : undefined,
                }}
              />
            ))}
          </div>
        )}
      </DropdownButton>

      <Divider />

      {/* Block / style picker */}
      <DropdownButton
        title="Styles"
        label="Styles"
        panelClass="min-w-[170px]"
      >
        {(close) => (
          <>
            {STYLE_PRESETS.map((style) => (
              <button
                key={style.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onStyle(style);
                }}
                className="w-full px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)] transition-colors"
              >
                {style.label}
              </button>
            ))}
          </>
        )}
      </DropdownButton>
      <ToolbarBtn title="Heading 1 (Ctrl+1)" onClick={() => onHeading("H1")} active={isH1}>
        <Heading1 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Heading 2 (Ctrl+2)" onClick={() => onHeading("H2")} active={isH2}>
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Paragraph (Ctrl+0)"
        onClick={() => onHeading("P")}
        active={isP && !isQuote && !isUL && !isOL}
      >
        <span className="text-[10px] font-mono">P</span>
      </ToolbarBtn>
      <ToolbarBtn title="Block quote" onClick={() => onHeading("BLOCKQUOTE")} active={isQuote}>
        <Quote className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <Divider />

      <DropdownButton
        title="Line and paragraph spacing"
        label="Spacing"
        panelClass="min-w-[190px]"
      >
        {(close) => (
          <div className="py-1">
            {LINE_SPACING_PRESETS.map((line) => (
              <button
                key={line}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onSpacingChange(
                    line,
                    paragraphSpacingBeforePt,
                    paragraphSpacingAfterPt
                  );
                }}
                className={`w-full px-3 py-1.5 text-left text-[11px] font-mono transition-colors ${
                  line === lineSpacing
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                Line {line}
              </button>
            ))}
            <div className="h-px bg-[var(--ch-border-subtle)] my-1" />
            {PARAGRAPH_SPACING_PRESETS.map((spacing) => (
              <button
                key={spacing.label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onSpacingChange(lineSpacing, spacing.before, spacing.after);
                }}
                className={`w-full px-3 py-1.5 text-left text-[11px] font-mono transition-colors ${
                  spacing.before === paragraphSpacingBeforePt &&
                  spacing.after === paragraphSpacingAfterPt
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                {spacing.label}
              </button>
            ))}
          </div>
        )}
      </DropdownButton>

      <Divider />

      {/* Alignment */}
      <ToolbarBtn
        title="Align left"
        onClick={() => exec("justifyLeft")}
        active={isAlignLeft}
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Align center"
        onClick={() => exec("justifyCenter")}
        active={isAlignCenter}
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Align right"
        onClick={() => exec("justifyRight")}
        active={isAlignRight}
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Justify"
        onClick={() => exec("justifyFull")}
        active={isAlignJustify}
      >
        <AlignJustify className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <Divider />

      {/* Lists + indent */}
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
      <ToolbarBtn title="Decrease indent" onClick={() => exec("outdent")}>
        <Outdent className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Increase indent" onClick={() => exec("indent")}>
        <Indent className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <Divider />

      {/* Link + clear */}
      <ToolbarBtn title="Insert link (Ctrl+K)" onClick={onInsertLink}>
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Clear formatting" onClick={() => exec("removeFormat")}>
        <RemoveFormatting className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Find and replace (Ctrl+F)" onClick={onFindOpen}>
        <Search className="w-3.5 h-3.5" />
      </ToolbarBtn>

      <Divider />

      {/* Undo / Redo / Restore */}
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
    </>
  );
}

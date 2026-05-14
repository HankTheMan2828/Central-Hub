"use client";

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
} from "lucide-react";
import {
  ToolbarBtn,
  Divider,
  DropdownButton,
  type FormatState,
} from "./shared";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "../pageOptions";

type Props = {
  exec: (cmd: string, value?: string) => void;
  applyHighlight: (color: string) => void;
  onHeading: (tag: "H1" | "H2" | "P" | "BLOCKQUOTE") => void;
  onInsertLink: () => void;
  formatState: FormatState;
  canRestoreBackup: boolean;
  onRestoreBackup: () => void;
};

export function HomeRibbon({
  exec,
  applyHighlight,
  onHeading,
  onInsertLink,
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

  return (
    <>
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

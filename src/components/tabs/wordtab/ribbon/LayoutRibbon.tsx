"use client";

import { FileText, Columns2, Palette, Rows3, Scissors } from "lucide-react";
import { DropdownButton } from "./shared";
import { PAGE_LAYOUTS, PAGE_COLORS, MARGIN_PRESETS } from "../pageOptions";

type Props = {
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
  onInsertPageBreak: () => void;
};

export function LayoutRibbon({
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
  onInsertPageBreak,
}: Props) {
  const pageLayout =
    PAGE_LAYOUTS.find((l) => l.id === pageLayoutId) ?? PAGE_LAYOUTS[0];
  const pageColor =
    PAGE_COLORS.find((c) => c.id === pageColorId) ?? PAGE_COLORS[0];
  const marginPreset =
    MARGIN_PRESETS.find((preset) => preset.id === marginsId) ?? MARGIN_PRESETS[0];

  return (
    <>
      <DropdownButton
        title="Margins"
        icon={<Rows3 className="w-3 h-3" />}
        label={marginPreset.label}
        panelClass="min-w-[210px]"
      >
        {(close) => (
          <>
            {MARGIN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  close();
                  onMarginsChange(preset.id);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left font-mono transition-colors ${
                  preset.id === marginPreset.id
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                <span className="text-[11px] truncate">{preset.label}</span>
                <span className="text-[9px] text-[var(--ch-text-faint)] shrink-0">
                  {preset.meta}
                </span>
              </button>
            ))}
          </>
        )}
      </DropdownButton>

      <DropdownButton
        title="Orientation"
        icon={<FileText className="w-3 h-3" />}
        label={orientation === "portrait" ? "Portrait" : "Landscape"}
        panelClass="min-w-[150px]"
      >
        {(close) => (
          <>
            {(["portrait", "landscape"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  close();
                  onOrientationChange(item);
                }}
                className={`w-full px-3 py-2 text-left text-[11px] font-mono capitalize transition-colors ${
                  item === orientation
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                {item}
              </button>
            ))}
          </>
        )}
      </DropdownButton>

      <DropdownButton
        title="Page size"
        icon={
          pageLayout.columns === 2 ? (
            <Columns2 className="w-3 h-3" />
          ) : (
            <FileText className="w-3 h-3" />
          )
        }
        label={pageLayout.label}
        panelClass="min-w-[250px]"
      >
        {(close) => (
          <>
            {PAGE_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                onClick={() => {
                  close();
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
          </>
        )}
      </DropdownButton>

      <DropdownButton
        title="Columns"
        icon={<Columns2 className="w-3 h-3" />}
        label={`${columns}`}
        panelClass="min-w-[120px]"
      >
        {(close) => (
          <>
            {([1, 2, 3] as const).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  close();
                  onColumnsChange(count);
                }}
                className={`w-full px-3 py-2 text-left text-[11px] font-mono transition-colors ${
                  count === columns
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                {count} {count === 1 ? "column" : "columns"}
              </button>
            ))}
          </>
        )}
      </DropdownButton>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInsertPageBreak}
        title="Insert page break"
        className="clouds-coding-dropdown-button flex items-center gap-1.5 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
      >
        <Scissors className="w-3 h-3" />
        Break
      </button>

      <DropdownButton
        title="Page color"
        icon={<Palette className="w-3 h-3" />}
        trailing={
          <span
            className="h-3 w-3 rounded-[2px] border border-[var(--ch-border-subtle)]"
            style={{ backgroundColor: pageColor.background }}
          />
        }
        label="Page Color"
        panelClass="min-w-[190px]"
      >
        {(close) => (
          <>
            {PAGE_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => {
                  close();
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
          </>
        )}
      </DropdownButton>

    </>
  );
}

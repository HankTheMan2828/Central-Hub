"use client";

import { FileText, Columns2, Palette } from "lucide-react";
import { DropdownButton } from "./shared";
import { PAGE_LAYOUTS, PAGE_COLORS } from "../pageOptions";

type Props = {
  pageLayoutId: string;
  onPageLayoutChange: (id: string) => void;
  pageColorId: string;
  onPageColorChange: (id: string) => void;
};

export function LayoutRibbon({
  pageLayoutId,
  onPageLayoutChange,
  pageColorId,
  onPageColorChange,
}: Props) {
  const pageLayout =
    PAGE_LAYOUTS.find((l) => l.id === pageLayoutId) ?? PAGE_LAYOUTS[0];
  const pageColor =
    PAGE_COLORS.find((c) => c.id === pageColorId) ?? PAGE_COLORS[0];

  return (
    <>
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

      <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono ml-2">
        Margins / Orientation / Columns / Breaks coming soon
      </span>
    </>
  );
}

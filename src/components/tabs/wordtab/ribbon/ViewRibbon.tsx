"use client";

import { Eye, Pilcrow } from "lucide-react";
import { DropdownButton } from "./shared";

export type PageFlow = "vertical" | "horizontal";

type Props = {
  pageFlow: PageFlow;
  onPageFlowChange: (flow: PageFlow) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showFormatting: boolean;
  onShowFormattingChange: (show: boolean) => void;
};

const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

export function ViewRibbon({
  pageFlow,
  onPageFlowChange,
  zoom,
  onZoomChange,
  showFormatting,
  onShowFormattingChange,
}: Props) {
  return (
    <>
      <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono mr-1">
        Page Flow
      </span>
      <div className="flex h-7 overflow-hidden rounded-sm border border-[var(--ch-border-subtle)]">
        <button
          type="button"
          title="Scroll pages vertically"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPageFlowChange("vertical")}
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
          onClick={() => onPageFlowChange("horizontal")}
          className={`border-l border-[var(--ch-border-subtle)] px-2 text-[10px] uppercase tracking-widest font-mono transition-colors ${
            pageFlow === "horizontal"
              ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
              : "text-[var(--ch-text-muted)] hover:text-[var(--ch-accent)]"
          }`}
        >
          Horizontal
        </button>
      </div>

      <DropdownButton
        title="Zoom"
        icon={<Eye className="w-3 h-3" />}
        label={`${zoom}%`}
        panelClass="min-w-[100px]"
      >
        {(close) => (
          <>
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => {
                  close();
                  onZoomChange(level);
                }}
                className={`w-full px-3 py-2 text-left text-[11px] font-mono transition-colors ${
                  level === zoom
                    ? "bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
                    : "text-[var(--ch-text)] hover:bg-[var(--ch-accent-5)] hover:text-[var(--ch-accent)]"
                }`}
              >
                {level}%
              </button>
            ))}
          </>
        )}
      </DropdownButton>

      <button
        type="button"
        title="Show formatting marks"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onShowFormattingChange(!showFormatting)}
        className={`h-7 w-7 flex items-center justify-center border rounded-sm transition-colors ${
          showFormatting
            ? "border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
            : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
        }`}
      >
        <Pilcrow className="w-3.5 h-3.5" />
      </button>
    </>
  );
}

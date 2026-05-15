"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

export type RibbonTabId = "home" | "layout" | "view";

const TABS: { id: RibbonTabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "layout", label: "Layout" },
  { id: "view", label: "View" },
];

type Props = {
  active: RibbonTabId;
  onChange: (id: RibbonTabId) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const BUTTON_ZOOM_STEP = 5;

export function RibbonTabs({ active, onChange, zoom, onZoomChange }: Props) {
  const zoomOut = () => {
    const nextZoom =
      zoom % BUTTON_ZOOM_STEP === 0
        ? zoom - BUTTON_ZOOM_STEP
        : Math.floor(zoom / BUTTON_ZOOM_STEP) * BUTTON_ZOOM_STEP;
    onZoomChange(Math.max(MIN_ZOOM, nextZoom));
  };
  const zoomIn = () => {
    const nextZoom =
      zoom % BUTTON_ZOOM_STEP === 0
        ? zoom + BUTTON_ZOOM_STEP
        : Math.ceil(zoom / BUTTON_ZOOM_STEP) * BUTTON_ZOOM_STEP;
    onZoomChange(Math.min(MAX_ZOOM, nextZoom));
  };

  return (
    <div className="px-3 pt-1.5 border-b border-[var(--ch-border-subtle)] flex items-center gap-1 shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(tab.id)}
          className={`relative px-3 h-7 -mb-px text-[10px] uppercase tracking-widest font-mono transition-colors ${
            active === tab.id
              ? "text-[var(--ch-accent)] border-b-[2px] border-[var(--ch-accent)]"
              : "text-[var(--ch-text-muted)] border-b-[2px] border-transparent hover:text-[var(--ch-accent)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
      <div className="ml-auto flex h-7 items-center gap-1.5 -mb-px shrink-0">
        <button
          type="button"
          title="Zoom out"
          onMouseDown={(e) => e.preventDefault()}
          onClick={zoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="clouds-coding-dropdown-button h-6 min-w-8 flex items-center justify-center gap-0.5 border border-[var(--ch-border-subtle)] rounded-sm px-1.5 text-[var(--ch-text-muted)] transition-colors hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomOut className="w-3 h-3" />
          <span className="text-[11px] leading-none font-mono">-</span>
        </button>
        <div className="clouds-coding-dropdown-button flex h-6 items-center gap-2 border border-[var(--ch-border-subtle)] rounded-sm px-2 text-[var(--ch-text-muted)]">
          <input
            type="range"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={1}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="ch-zoom-slider w-36"
          />
          <span className="min-w-[42px] text-right text-[10px] uppercase tracking-widest font-mono">
            {zoom}%
          </span>
        </div>
        <button
          type="button"
          title="Zoom in"
          onMouseDown={(e) => e.preventDefault()}
          onClick={zoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="clouds-coding-dropdown-button h-6 min-w-8 flex items-center justify-center gap-0.5 border border-[var(--ch-border-subtle)] rounded-sm px-1.5 text-[var(--ch-text-muted)] transition-colors hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomIn className="w-3 h-3" />
          <span className="text-[11px] leading-none font-mono">+</span>
        </button>
      </div>
    </div>
  );
}

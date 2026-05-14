"use client";

export type PageFlow = "vertical" | "horizontal";

type Props = {
  pageFlow: PageFlow;
  onPageFlowChange: (flow: PageFlow) => void;
};

export function ViewRibbon({ pageFlow, onPageFlowChange }: Props) {
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

      <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono ml-2">
        Zoom / Ruler / Formatting marks coming soon
      </span>
    </>
  );
}

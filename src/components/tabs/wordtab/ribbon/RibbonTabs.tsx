"use client";

export type RibbonTabId = "home" | "layout" | "view";

const TABS: { id: RibbonTabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "layout", label: "Layout" },
  { id: "view", label: "View" },
];

type Props = {
  active: RibbonTabId;
  onChange: (id: RibbonTabId) => void;
};

export function RibbonTabs({ active, onChange }: Props) {
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
    </div>
  );
}

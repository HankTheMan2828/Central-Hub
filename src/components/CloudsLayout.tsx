"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Menu, Settings } from "lucide-react";

interface CloudsLayoutProps {
  left?: ReactNode;
  main: ReactNode;
  right?: ReactNode;
  nav: ReactNode;
  onOpenMenu: () => void;
}

function BubblePanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-h-0 min-w-0 rounded-3xl border border-[var(--ch-border)] bg-[var(--ch-bg-base)] shadow-2xl overflow-hidden ${className}`}
    >
      {children}
    </section>
  );
}

export function CloudsLayout({
  left,
  main,
  right,
  nav,
  onOpenMenu,
}: CloudsLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);
  const hasLeft = Boolean(left);
  const hasRight = Boolean(right);

  const gridTemplateColumns = useMemo(() => {
    if (hasLeft && hasRight) {
      return "minmax(250px, 0.62fr) minmax(620px, 1.72fr) minmax(270px, 0.68fr)";
    }
    if (hasLeft) {
      return "minmax(250px, 0.62fr) minmax(620px, 1.75fr)";
    }
    if (hasRight) {
      return "minmax(620px, 1.75fr) minmax(270px, 0.68fr)";
    }
    return "minmax(620px, 1020px)";
  }, [hasLeft, hasRight]);

  return (
    <div className="fixed inset-0 bg-[var(--ch-bg-page)] text-[var(--ch-text)] no-drag overflow-hidden">
      <div className="absolute top-5 left-5 z-30 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          className="h-11 min-w-[112px] px-4 rounded-2xl border border-[var(--ch-border)] bg-[var(--ch-bg-base)] hover:bg-[var(--ch-bg-hover)] flex items-center gap-2 select-none shadow-xl"
        >
          <Menu className="w-4 h-4" />
          <span className="text-[10px] font-bold tracking-widest uppercase">
            Menu
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          className="h-11 w-11 rounded-full border border-[var(--ch-border)] bg-[var(--ch-bg-base)] hover:bg-[var(--ch-bg-hover)] flex items-center justify-center shadow-xl"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {navOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`absolute left-5 top-[76px] z-30 w-[286px] max-w-[86vw] rounded-[2rem] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] p-3 shadow-2xl overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out ${
          navOpen
            ? "max-h-[620px] opacity-100 scale-100 pointer-events-auto"
            : "max-h-0 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="min-h-0 flex flex-col">{nav}</div>
      </aside>

      <div className="h-full w-full px-8 pb-10 pt-20 flex items-center justify-center">
        <div
          className="grid w-full max-w-[1580px] items-center gap-9 min-h-0"
          style={{ gridTemplateColumns }}
        >
          {hasLeft && (
            <BubblePanel className="h-[min(58vh,590px)] self-center rounded-[2.25rem]">
              {left}
            </BubblePanel>
          )}
          <BubblePanel className="h-[min(88vh,900px)] max-h-[900px] flex flex-col rounded-[3.5rem]">
            {main}
          </BubblePanel>
          {hasRight && (
            <BubblePanel className="h-[min(58vh,590px)] self-center rounded-[2.25rem] [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0">
              {right}
            </BubblePanel>
          )}
        </div>
      </div>
    </div>
  );
}

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
  innerClassName = "",
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section
      className={`min-h-0 min-w-0 rounded-[3rem] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] shadow-2xl overflow-hidden p-4 ${className}`}
    >
      <div
        className={`h-full min-h-0 min-w-0 overflow-hidden rounded-[2.35rem] ${innerClassName}`}
      >
        {children}
      </div>
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
    const side = hasLeft || hasRight ? "minmax(300px, 0.58fr)" : "minmax(0, 1fr)";
    return `${side} minmax(980px, 1120px) ${side}`;
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
          className="grid w-full max-w-[1840px] items-center gap-9 min-h-0"
          style={{ gridTemplateColumns }}
        >
          {hasLeft && (
            <BubblePanel
              className="h-[min(62vh,620px)] self-center rounded-[2.5rem]"
              innerClassName="rounded-[1.85rem]"
            >
              {left}
            </BubblePanel>
          )}
          {!hasLeft && <div aria-hidden className="min-w-0" />}
          <BubblePanel
            className="h-[min(92vh,980px)] max-h-[980px] rounded-[3.5rem]"
            innerClassName="clouds-main-bubble flex flex-col rounded-[2.75rem]"
          >
            {main}
          </BubblePanel>
          {hasRight && (
            <BubblePanel
              className="h-[min(62vh,620px)] self-center rounded-[2.5rem]"
              innerClassName="rounded-[1.85rem] [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0"
            >
              {right}
            </BubblePanel>
          )}
          {!hasRight && <div aria-hidden className="min-w-0" />}
        </div>
      </div>

      <style jsx global>{`
        [data-layout="clouds"] .clouds-main-bubble :is(div, section, aside)[class*="rounded-sm"] {
          border-radius: 1.15rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-chat-tab-titles button {
          border-radius: 1.15rem !important;
        }
      `}</style>
    </div>
  );
}

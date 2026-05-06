"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Menu, Settings } from "lucide-react";

interface CloudsLayoutProps {
  left?: ReactNode;
  main: ReactNode;
  right?: ReactNode;
  rightStackTop?: ReactNode;
  rightStackBottom?: ReactNode;
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
  rightStackTop,
  rightStackBottom,
  nav,
  onOpenMenu,
}: CloudsLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);
  const hasLeft = Boolean(left);
  const hasRightStack = Boolean(rightStackTop || rightStackBottom);
  const hasRight = Boolean(right || hasRightStack);

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
        className={`clouds-menu-bubble absolute left-5 top-[76px] z-30 w-[286px] max-w-[86vw] rounded-[2rem] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] p-3 shadow-2xl overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out ${
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
              innerClassName="clouds-side-bubble rounded-[1.85rem]"
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
          {hasRightStack ? (
            <div className="h-[min(92vh,980px)] max-h-[980px] min-h-0 min-w-0 self-center flex flex-col gap-7">
              {rightStackTop && (
                <BubblePanel
                  className="h-[min(34vh,360px)] min-h-[310px] rounded-[2.35rem] p-3"
                  innerClassName="clouds-side-bubble clouds-side-bubble-square rounded-[1.6rem]"
                >
                  {rightStackTop}
                </BubblePanel>
              )}
              {rightStackBottom && (
                <BubblePanel
                  className="flex-1 rounded-[2.65rem] p-3"
                  innerClassName="clouds-side-bubble clouds-side-bubble-stack rounded-[1.9rem] [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0"
                >
                  {rightStackBottom}
                </BubblePanel>
              )}
            </div>
          ) : hasRight ? (
            <BubblePanel
              className="h-[min(62vh,620px)] self-center rounded-[2.5rem]"
              innerClassName="clouds-side-bubble rounded-[1.85rem] [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0"
            >
              {right}
            </BubblePanel>
          ) : null}
          {!hasRight && <div aria-hidden className="min-w-0" />}
        </div>
      </div>

      <style jsx global>{`
        [data-layout="clouds"] {
          --clouds-main-child-radius: 1.45rem;
          --clouds-side-child-radius: 1.25rem;
          --clouds-menu-child-radius: 1.15rem;
        }

        [data-layout="clouds"] .clouds-main-bubble :is(div, section, aside, button, input, textarea, select)[class*="rounded-sm"] {
          border-radius: var(--clouds-main-child-radius) !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-chat-tab-titles button {
          border-radius: 999px !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-chat-shell {
          border-radius: 1.85rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-chat-header {
          border-top-left-radius: 1.85rem !important;
          border-top-right-radius: 1.85rem !important;
          padding-left: 1.2rem !important;
          padding-right: 1.2rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-composer {
          border-radius: 1.35rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-composer select {
          border-radius: 999px !important;
          padding-left: 0.85rem !important;
          padding-right: 1.85rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-dropdown-button {
          border-radius: 999px !important;
          padding-left: 0.85rem !important;
          padding-right: 0.65rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-dropdown-panel {
          border-radius: 1.15rem !important;
          padding: 0.35rem !important;
        }

        [data-layout="clouds"] .clouds-main-bubble .clouds-coding-dropdown-panel button {
          border-radius: 0.85rem !important;
        }

        [data-layout="clouds"] .clouds-side-bubble :is(div, section, aside, button, input, textarea, select)[class*="rounded-sm"] {
          border-radius: var(--clouds-side-child-radius) !important;
        }

        [data-layout="clouds"] .clouds-side-bubble-square {
          --clouds-side-child-radius: 1.35rem;
        }

        [data-layout="clouds"] .clouds-side-bubble-stack {
          --clouds-side-child-radius: 1.2rem;
        }

        [data-layout="clouds"] .clouds-menu-bubble :is(nav, div, button)[class*="rounded-sm"] {
          border-radius: var(--clouds-menu-child-radius) !important;
        }

        [data-layout="clouds"] :is(.clouds-main-bubble, .clouds-side-bubble) ::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }

        [data-layout="clouds"] :is(.clouds-main-bubble, .clouds-side-bubble) ::-webkit-scrollbar-track {
          background: transparent;
          border: 0;
        }

        [data-layout="clouds"] :is(.clouds-main-bubble, .clouds-side-bubble) ::-webkit-scrollbar-thumb {
          background-color: var(--ch-border);
          background-clip: content-box;
          border: 4px solid transparent;
          border-radius: 999px;
        }

        [data-layout="clouds"] .clouds-side-bubble .overflow-y-auto {
          padding-right: 0.45rem !important;
          scrollbar-gutter: stable;
        }

        [data-layout="clouds"] .clouds-chat-header {
          min-height: 3.1rem;
          padding: 0.95rem 1.35rem 0.7rem !important;
          align-items: center;
        }

        [data-layout="clouds"] .clouds-section-title {
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }

        [data-layout="clouds"] .clouds-chat-scroll {
          padding: 1.35rem 1.5rem 1.5rem !important;
          gap: 0.85rem !important;
        }

        [data-layout="clouds"] .clouds-chat-empty {
          padding: 2rem;
          text-align: center;
        }

        [data-layout="clouds"] .clouds-chat-empty-icon {
          margin-bottom: 0.15rem;
        }

        [data-layout="clouds"] .clouds-chat-empty-text {
          max-width: 24rem;
          line-height: 1.45;
        }

        [data-layout="clouds"] .clouds-chat-message-bubble {
          padding: 0.85rem 1.1rem !important;
        }

        [data-layout="clouds"] .clouds-chat-composer {
          padding: 1rem 1.15rem 0.95rem !important;
        }

        [data-layout="clouds"] .clouds-chat-input {
          min-height: 4.6rem !important;
          padding: 0.1rem 0.25rem 0.65rem !important;
          line-height: 1.55;
        }

        [data-layout="clouds"] .clouds-chat-toolbar {
          align-items: center !important;
          margin-top: 0.45rem !important;
          padding-top: 0.75rem !important;
        }

        [data-layout="clouds"] .clouds-chat-icon-button {
          width: 2.15rem !important;
          height: 2.15rem !important;
          padding: 0 !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px !important;
        }

        [data-layout="clouds"] .clouds-chat-icon-button svg {
          width: 1rem;
          height: 1rem;
        }

        [data-layout="clouds"] .clouds-chat-send-button {
          min-width: 6.35rem;
          height: 2.15rem;
          justify-content: center;
          border-radius: 999px !important;
        }

        [data-layout="clouds"] .clouds-chat-right-rail {
          padding: 1rem !important;
          gap: 1.2rem !important;
        }

        [data-layout="clouds"] .clouds-metric-card {
          padding: 0.85rem 1rem !important;
        }

        [data-layout="clouds"] .clouds-history-list {
          gap: 0.55rem !important;
          padding-right: 0.3rem !important;
        }

        [data-layout="clouds"] .clouds-history-card {
          padding: 0.75rem 0.95rem !important;
        }
      `}</style>
    </div>
  );
}

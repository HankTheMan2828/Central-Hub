"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Menu, Settings } from "lucide-react";

interface CloudsLayoutProps {
  left?: ReactNode;
  main?: ReactNode;
  mainStackTop?: ReactNode;
  mainStackBottom?: ReactNode;
  right?: ReactNode;
  rightStackTop?: ReactNode;
  rightStackBottom?: ReactNode;
  mainSize?: "default" | "tall";
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
      className={`clouds-panel min-h-0 min-w-0 rounded-[3rem] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] overflow-hidden p-4 ${className}`}
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
  mainStackTop,
  mainStackBottom,
  right,
  rightStackTop,
  rightStackBottom,
  mainSize = "default",
  nav,
  onOpenMenu,
}: CloudsLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);
  const menuBubbleRef = useRef<HTMLElement>(null);
  const [menuCastHeight, setMenuCastHeight] = useState(0);
  const hasLeft = Boolean(left);
  const hasMainStack = Boolean(mainStackTop || mainStackBottom);
  const hasRightStack = Boolean(rightStackTop || rightStackBottom);
  const hasRight = Boolean(right || hasRightStack);
  const visibleSideCount = Number(hasLeft) + Number(hasRight);

  const gridTemplateColumns = useMemo(() => {
    const side = "minmax(min(220px, 20vw), 0.64fr)";
    const main = "minmax(min(calc(560px + 4in), 58vw), 2.5fr)";
    return [hasLeft ? side : null, main, hasRight ? side : null]
      .filter(Boolean)
      .join(" ");
  }, [hasLeft, hasRight]);

  const clusterMaxWidth = useMemo(() => {
    if (visibleSideCount === 2) return "calc(1840px + 4in)";
    if (visibleSideCount === 1) return "calc(1380px + 4in)";
    return "calc(1040px + 4in)";
  }, [visibleSideCount]);

  useEffect(() => {
    if (!navOpen || !menuBubbleRef.current) {
      setMenuCastHeight(0);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setMenuCastHeight(menuBubbleRef.current?.offsetHeight ?? 0);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [navOpen]);

  return (
    <div
      className={`clouds-shell ${
        mainSize === "tall" ? "clouds-shell-main-tall" : ""
      } fixed inset-0 bg-[var(--ch-bg-page)] text-[var(--ch-text)] no-drag overflow-hidden`}
    >
      <div aria-hidden className="clouds-chrome-shadow-layer absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-5 left-5 flex items-center gap-3">
          <div className="clouds-menu-button-cast clouds-chrome-cast h-11 min-w-[112px] rounded-2xl" />
          <div className="clouds-settings-button-cast clouds-chrome-cast h-11 w-11 rounded-full" />
        </div>
        <div
          className={`clouds-menu-bubble-cast clouds-chrome-cast absolute left-5 top-[76px] w-[286px] max-w-[86vw] rounded-[2rem] transition-[opacity,transform,height] duration-200 ease-out ${
            navOpen
              ? "opacity-100 scale-100"
              : "opacity-0 scale-95"
          }`}
          style={{ height: menuCastHeight }}
        />
      </div>

      <div className="absolute top-5 left-5 z-50 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          className="h-11 min-w-[112px] px-4 rounded-2xl border border-[var(--ch-border)] bg-[var(--ch-bg-base)] hover:bg-[var(--ch-bg-hover)] flex items-center gap-2 select-none"
        >
          <Menu className="w-4 h-4" />
          <span className="text-[10px] font-bold tracking-widest uppercase">
            Menu
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          className="h-11 w-11 rounded-full border border-[var(--ch-border)] bg-[var(--ch-bg-base)] hover:bg-[var(--ch-bg-hover)] flex items-center justify-center"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {navOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        ref={menuBubbleRef}
        className={`clouds-menu-bubble absolute left-5 top-[76px] z-50 w-[286px] max-w-[86vw] rounded-[2rem] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] p-3 overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out ${
          navOpen
            ? "max-h-[420px] opacity-100 scale-100 pointer-events-auto"
            : "max-h-0 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="min-h-0 flex flex-col">{nav}</div>
      </aside>

      <div className="clouds-stage relative z-20 h-full w-full box-border flex items-center justify-center">
        <div
          className="clouds-grid grid w-full items-center justify-center min-h-0"
          style={{ gridTemplateColumns, maxWidth: clusterMaxWidth }}
        >
          {hasLeft && (
            <BubblePanel
              className="clouds-left-panel clouds-side-panel self-center rounded-[2.5rem]"
              innerClassName="clouds-side-bubble rounded-[1.85rem]"
            >
              {left}
            </BubblePanel>
          )}
          {hasMainStack ? (
            <div className="clouds-main-stack clouds-main-height clouds-main-panel min-h-0 min-w-0 self-center flex flex-col">
              {mainStackTop && (
                <BubblePanel
                  className="clouds-main-stack-top rounded-[2.65rem] p-3"
                  innerClassName="clouds-main-bubble clouds-main-bubble-stack-top rounded-[1.9rem]"
                >
                  {mainStackTop}
                </BubblePanel>
              )}
              {mainStackBottom && (
                <BubblePanel
                  className="flex-1 rounded-[2.85rem] p-3"
                  innerClassName="clouds-main-bubble clouds-main-bubble-stack-bottom rounded-[2.05rem]"
                >
                  {mainStackBottom}
                </BubblePanel>
              )}
            </div>
          ) : (
            <BubblePanel
              className="clouds-main-panel rounded-[3.5rem]"
              innerClassName="clouds-main-bubble flex flex-col rounded-[2.75rem]"
            >
              {main}
            </BubblePanel>
          )}
          {hasRightStack ? (
            <div className="clouds-right-stack clouds-main-height min-h-0 min-w-0 self-center flex flex-col">
              {rightStackTop && (
                <BubblePanel
                  className="clouds-stack-top rounded-[2.35rem] p-3"
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
              className={`clouds-right-panel ${
                hasMainStack ? "clouds-main-height" : "clouds-side-panel"
              } self-center rounded-[2.5rem]`}
              innerClassName="clouds-side-bubble rounded-[1.85rem] [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0"
            >
              {right}
            </BubblePanel>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        [data-layout="clouds"] {
          --clouds-main-child-radius: 1.45rem;
          --clouds-side-child-radius: 1.25rem;
          --clouds-menu-child-radius: 1.15rem;
        }

        [data-layout="clouds"] .clouds-shell {
          --clouds-chrome-bottom: 4rem;
          --clouds-stage-x: 2rem;
          --clouds-stage-top: calc(var(--clouds-chrome-bottom) + var(--clouds-grid-gap));
          --clouds-stage-bottom: calc(var(--clouds-stage-top) - var(--clouds-shadow-gutter));
          --clouds-grid-gap: 2.25rem;
          --clouds-shadow-gutter: 3.2rem;
          --clouds-main-height: min(
            calc(
              100vh - var(--clouds-stage-top) - var(--clouds-stage-bottom) -
                var(--clouds-shadow-gutter)
            ),
            calc(980px + 1in)
          );
          --clouds-side-height: min(
            calc(72vh - var(--clouds-stage-top)),
            calc(620px + 1in)
          );
          --clouds-stack-gap: 1.75rem;
          --clouds-stack-top-height: min(34vh, 360px);
          --clouds-stack-top-min: 310px;
          --clouds-main-stack-top-height: min(18vh, 184px);
          --clouds-main-stack-top-min: 160px;
        }

        [data-layout="clouds"] .clouds-shell-main-tall {
          --clouds-main-vertical-margin: 1in;
          --clouds-stage-top: var(--clouds-main-vertical-margin);
          --clouds-stage-bottom: calc(
            var(--clouds-main-vertical-margin) - var(--clouds-shadow-gutter)
          );
          --clouds-main-height: calc(
            100vh - var(--clouds-stage-top) - var(--clouds-stage-bottom) -
              var(--clouds-shadow-gutter)
          );
        }

        [data-layout="clouds"] .clouds-stage {
          padding: var(--clouds-stage-top) var(--clouds-stage-x)
            var(--clouds-stage-bottom);
        }

        [data-layout="clouds"] .clouds-grid {
          gap: var(--clouds-grid-gap);
          padding-bottom: var(--clouds-shadow-gutter);
        }

        [data-layout="clouds"] .clouds-panel {
          box-shadow:
            0 72px 96px -28px rgba(77, 55, 20, 0.46),
            0 34px 52px -16px rgba(77, 55, 20, 0.31),
            0 12px 24px -10px rgba(77, 55, 20, 0.26);
        }

        [data-layout="clouds"] .clouds-chrome-cast {
          box-shadow:
            0 38px 58px -22px rgba(77, 55, 20, 0.46),
            0 18px 34px -16px rgba(77, 55, 20, 0.31),
            0 7px 16px -10px rgba(77, 55, 20, 0.26);
        }

        [data-layout="clouds"] .clouds-main-panel,
        [data-layout="clouds"] .clouds-main-height {
          height: var(--clouds-main-height);
          max-height: var(--clouds-main-height);
        }

        [data-layout="clouds"] .clouds-side-panel {
          height: var(--clouds-side-height);
        }

        [data-layout="clouds"] .clouds-right-stack {
          gap: var(--clouds-stack-gap);
        }

        [data-layout="clouds"] .clouds-stack-top {
          height: var(--clouds-stack-top-height);
          min-height: var(--clouds-stack-top-min);
        }

        [data-layout="clouds"] .clouds-main-stack {
          gap: var(--clouds-stack-gap);
        }

        [data-layout="clouds"] .clouds-main-stack-top {
          height: var(--clouds-main-stack-top-height);
          min-height: var(--clouds-main-stack-top-min);
        }

        @media (max-width: 1180px) {
          [data-layout="clouds"] .clouds-shell {
            overflow: auto;
          }

          [data-layout="clouds"] .clouds-stage {
            min-height: 100%;
            align-items: flex-start;
            padding-top: 4.8rem;
            padding-left: 1rem;
            padding-right: 1rem;
            padding-bottom: 4.8rem;
          }

          [data-layout="clouds"] .clouds-shell-main-tall .clouds-stage {
            padding-top: var(--clouds-main-vertical-margin);
            padding-bottom: var(--clouds-main-vertical-margin);
          }

          [data-layout="clouds"] .clouds-grid {
            padding-bottom: 2.45rem;
          }

          [data-layout="clouds"] .clouds-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            max-width: 760px;
          }

          [data-layout="clouds"] .clouds-main-panel {
            order: 1;
            height: min(72vh, 760px);
            max-height: none;
          }

          [data-layout="clouds"] .clouds-shell-main-tall .clouds-main-panel {
            height: var(--clouds-main-height);
          }

          [data-layout="clouds"] .clouds-left-panel {
            order: 2;
          }

          [data-layout="clouds"] .clouds-right-panel,
          [data-layout="clouds"] .clouds-right-stack {
            order: 3;
          }

          [data-layout="clouds"] .clouds-side-panel,
          [data-layout="clouds"] .clouds-right-stack {
            height: auto;
            max-height: none;
          }

          [data-layout="clouds"] .clouds-stack-top {
            height: auto;
            min-height: 220px;
          }

          [data-layout="clouds"] .clouds-main-stack-top {
            height: auto;
            min-height: 160px;
          }
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

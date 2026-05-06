"use client";

/* ------------------------------------------------------------------ */
/*  Clouds layout (placeholder)                                        */
/*                                                                     */
/*  This is a SCAFFOLD only — the real Clouds shell is to be filled    */
/*  in by Codex per the brief in HANDOFF.md / the PR description.      */
/*                                                                     */
/*  Intended final shape:                                              */
/*    - Page background visible around all UI                          */
/*    - Small rounded "menu" bubble in the top-left opens the LeftNav  */
/*      as a slide-in drawer overlay (with settings access).           */
/*    - Three rounded-3xl bubble columns floating in the middle:       */
/*        left side column · main bubble (largest) · right side column */
/*        (smaller). Each tab declares which side columns it shows —   */
/*        left, right, both, or neither — and unused columns are       */
/*        hidden so the main bubble fills the freed space.             */
/*    - No animations.                                                 */
/*                                                                     */
/*  All themes (`var(--ch-*)` tokens) must continue to apply.          */
/* ------------------------------------------------------------------ */

import { Menu } from "lucide-react";

interface CloudsLayoutProps {
  /** Open the existing settings/menu overlay (themes, settings, archive). */
  onOpenMenu: () => void;
}

export function CloudsLayout({ onOpenMenu }: CloudsLayoutProps) {
  return (
    <div className="fixed inset-0 bg-[var(--ch-bg-page)] text-[var(--ch-text)] no-drag">
      {/* Menu trigger bubble — top-left */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="absolute top-4 left-4 z-10 px-3 py-2 rounded-2xl border border-[var(--ch-border)] bg-[var(--ch-bg-base)] hover:bg-[var(--ch-bg-hover)] transition-colors flex items-center gap-2 select-none"
      >
        <Menu className="w-4 h-4" />
        <span className="text-[10px] font-bold tracking-widest uppercase">
          Menu
        </span>
      </button>

      {/* Placeholder centerpiece — Codex replaces this with the real bubbles */}
      <div className="absolute inset-0 flex items-center justify-center p-12 pointer-events-none">
        <div className="rounded-3xl border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-8 py-6 text-center max-w-md">
          <div className="text-[14px] font-bold mb-2">Clouds layout</div>
          <div className="text-[12px] text-[var(--ch-text-muted)] leading-relaxed">
            Scaffolded placeholder. The real layout — left side column, main
            bubble, smaller right side column — will live here.
          </div>
        </div>
      </div>
    </div>
  );
}

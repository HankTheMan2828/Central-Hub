"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronDown } from "lucide-react";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";

export function ToolbarBtn({
  title,
  onClick,
  children,
  active,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center border transition-colors ${
        active
          ? "rounded-full border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
          : "rounded-sm border-transparent hover:border-[#FFB347]/40 hover:bg-[var(--ch-accent-5)] text-[var(--ch-text-muted)] hover:text-[var(--ch-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <span className="w-px h-4 bg-[var(--ch-border-subtle)] mx-1" />;
}

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, ref]);
}

type DropdownButtonProps = {
  title: string;
  label?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  panelClass?: string;
  align?: "left" | "right";
  children: ReactNode | ((close: () => void) => ReactNode);
};

export function DropdownButton({
  title,
  label,
  icon,
  trailing,
  active,
  panelClass,
  align = "left",
  children,
}: DropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, open, () => setOpen(false));
  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        title={title}
        className={`clouds-coding-dropdown-button flex items-center gap-1.5 px-2 h-7 border rounded-sm text-[10px] uppercase tracking-widest font-mono transition-colors ${
          open || active
            ? "border-[#FFB347]/60 bg-[var(--ch-accent-5)] text-[var(--ch-accent)]"
            : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:border-[#FFB347]/40 hover:text-[var(--ch-accent)]"
        }`}
      >
        {icon}
        {label}
        {trailing}
        <ChevronDown className="w-3 h-3" />
      </button>
      <AnimatedDropdown
        open={open}
        className={`clouds-coding-dropdown-panel absolute top-full mt-1 z-30 border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl overflow-hidden ${
          align === "right" ? "right-0" : "left-0"
        } ${panelClass ?? "min-w-[180px]"}`}
      >
        {typeof children === "function" ? children(close) : children}
      </AnimatedDropdown>
    </div>
  );
}

export type FormatState = {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  isSub: boolean;
  isSuper: boolean;
  isUL: boolean;
  isOL: boolean;
  isH1: boolean;
  isH2: boolean;
  isP: boolean;
  isQuote: boolean;
  isAlignLeft: boolean;
  isAlignCenter: boolean;
  isAlignRight: boolean;
  isAlignJustify: boolean;
};

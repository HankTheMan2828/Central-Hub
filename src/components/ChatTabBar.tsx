"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";

interface ChatTab {
  id: string;
  title: string;
}

interface ChatTabBarProps {
  tabs: ChatTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  canAdd: boolean;
}

export function ChatTabBar({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  canAdd,
}: ChatTabBarProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Click outside cancels confirmation
  useEffect(() => {
    if (!confirmId) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setConfirmId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmId]);

  const handleCloseClick = (tabId: string) => {
    if (confirmId === tabId) {
      onRemove(tabId);
      setConfirmId(null);
    } else {
      setConfirmId(tabId);
    }
  };

  return (
    <div ref={barRef} className="flex items-center shrink-0 gap-0">
      {/* Tab buttons */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isConfirming = confirmId === tab.id;
        const isOnlyTab = tabs.length <= 1;

        return (
          <div key={tab.id} className="relative flex">
            <button
              className={`h-[28px] px-3 text-[11px] font-medium transition-colors flex items-center gap-2 border border-[var(--ch-border)] ${
                isActive
                  ? "bg-[var(--ch-bg-elevated)] text-[var(--ch-text)]"
                  : "bg-[var(--ch-bg-base)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)]"
              }`}
              onClick={() => {
                setConfirmId(null);
                onSelect(tab.id);
              }}
              title={tab.title}
            >
              <span className="truncate max-w-[140px]">{tab.title}</span>

              <span
                className={`shrink-0 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] leading-none transition-colors ${
                  isConfirming
                    ? "bg-[var(--ch-error-bg)] text-[var(--ch-error)]"
                    : "text-[var(--ch-text-faint)] hover:text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseClick(tab.id);
                }}
                title={
                  isConfirming
                    ? "Confirm"
                    : isOnlyTab
                    ? "Start new chat"
                    : "Close chat"
                }
              >
                <X className="w-2.5 h-2.5" />
              </span>
            </button>

            {/* Confirmation tooltip */}
            <AnimatedDropdown
              open={isConfirming}
              className="absolute top-full left-0 mt-1 z-50 border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm shadow-lg px-2.5 py-2 flex items-center gap-2 whitespace-nowrap"
            >
              <AlertTriangle className="w-3 h-3 text-[var(--ch-error)] shrink-0" />
              <span className="text-[11px] text-[var(--ch-error-text)]">
                {isOnlyTab ? "Start new chat?" : `Close ${tab.title}?`}
              </span>
              <button
                className="px-2 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-error-bg)] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tab.id);
                  setConfirmId(null);
                }}
              >
                Yes
              </button>
              <button
                className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(null);
                }}
              >
                No
              </button>
            </AnimatedDropdown>
          </div>
        );
      })}

      {/* Add-tab button */}
      {canAdd && (
        <button
          className="h-[28px] w-[28px] flex items-center justify-center border border-[var(--ch-border)] rounded-r-sm text-[var(--ch-text-faint)] hover:text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)] transition-colors shrink-0"
          onClick={onAdd}
          title={`New chat tab (${tabs.length}/8)`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

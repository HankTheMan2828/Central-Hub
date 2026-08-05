"use client";

import {
  MessageSquare,
  CloudSun,
  CodeXml,
  FileText,
  Keyboard,
  Search,
  BookOpen,
  Pencil,
  FolderOpen,
  Globe,
  Compass,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type TabId = "chat" | "word" | "typing" | "search" | "notes";
export type ChatSubTabId = "plain" | "coding";
export type WordSubTabId = "editor" | "saves";
export type WebSubTabId = "ai" | "reg";

interface SubTab {
  id: ChatSubTabId | WordSubTabId | WebSubTabId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavTab {
  id: TabId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  subTabs?: SubTab[];
}

const TABS: readonly NavTab[] = [
  {
    id: "chat",
    label: "AI Central",
    icon: MessageSquare,
    subTabs: [
      { id: "plain", label: "Plain Chat", icon: CloudSun },
      { id: "coding", label: "Coding Agent", icon: CodeXml },
    ],
  },
  {
    id: "word",
    label: "Docs Area",
    icon: FileText,
    subTabs: [
      { id: "saves", label: "Saves", icon: FolderOpen },
      { id: "editor", label: "Editor", icon: Pencil },
    ],
  },
  { id: "typing", label: "Typing Practice", icon: Keyboard },
  {
    id: "search",
    label: "The Web",
    icon: Globe,
    subTabs: [
      { id: "ai", label: "AI Search", icon: Search },
      { id: "reg", label: "Reg Web", icon: Compass },
    ],
  },
  { id: "notes", label: "Notes/Files", icon: BookOpen },
];

interface LeftNavProps {
  active: TabId;
  onSelect: (id: TabId) => void;
  chatSubTab: ChatSubTabId;
  onChatSubSelect: (id: ChatSubTabId) => void;
  wordSubTab: WordSubTabId;
  onWordSubSelect: (id: WordSubTabId) => void;
  webSubTab: WebSubTabId;
  onWebSubSelect: (id: WebSubTabId) => void;
  showWordSubTabs?: boolean;
}

export function LeftNav({
  active,
  onSelect,
  chatSubTab,
  onChatSubSelect,
  wordSubTab,
  onWordSubSelect,
  webSubTab,
  onWebSubSelect,
  showWordSubTabs = true,
}: LeftNavProps) {
  return (
    <nav
      aria-label="Application tabs"
      className="flex-1 flex flex-col bg-[var(--ch-bg-base)] border border-[var(--ch-border)] rounded-sm overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-[var(--ch-border)] text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ch-accent)] font-mono">
        Apps
      </div>
      <ul className="flex flex-col">
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          const showSubs =
            isActive &&
            tab.subTabs &&
            tab.subTabs.length > 0 &&
            (tab.id !== "word" || showWordSubTabs);
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative w-full flex items-center gap-2.5 px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  idx > 0 ? "border-t border-[var(--ch-border-faint)]" : ""
                } ${
                  isActive
                    ? "bg-[var(--ch-bg-elevated)] text-[var(--ch-accent)] -mr-2 pr-5 z-10"
                    : "text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] hover:bg-[var(--ch-bg-hover)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1">{tab.label}</span>
                {isActive && (
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full bg-[var(--ch-accent)] shrink-0"
                  />
                )}
              </button>
              {showSubs && (
                <ul className="bg-[var(--ch-bg-elevated)] -mr-2 pr-5 z-10 relative">
                  {tab.subTabs!.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive =
                      tab.id === "chat"
                        ? chatSubTab === sub.id
                        : tab.id === "word"
                        ? wordSubTab === sub.id
                        : tab.id === "search" && webSubTab === sub.id;
                    return (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (tab.id === "chat")
                              onChatSubSelect(sub.id as ChatSubTabId);
                            if (tab.id === "word")
                              onWordSubSelect(sub.id as WordSubTabId);
                            if (tab.id === "search")
                              onWebSubSelect(sub.id as WebSubTabId);
                          }}
                          aria-current={isSubActive ? "true" : undefined}
                          className={`w-full flex items-center gap-2 pl-9 pr-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest border-l-2 transition-colors ${
                            isSubActive
                              ? "border-[var(--ch-accent)] text-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                              : "border-transparent text-[var(--ch-text-faint)] hover:text-[var(--ch-accent)] hover:bg-[var(--ch-accent-5)]"
                          }`}
                        >
                          <SubIcon className="w-3 h-3 shrink-0" />
                          <span className="truncate flex-1">{sub.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

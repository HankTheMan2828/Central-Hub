"use client";

import { useState, useCallback } from "react";

export interface ChatTab {
  id: string;
  num: number;
  title: string;
  customTitle?: string;
}

const MAX_TABS = 8;

let tabSeq = 1;
function nextTabId() {
  return `tab-${tabSeq++}`;
}

/**
 * Pure tab-management hook — no chat logic.
 * Each tab's chat state lives in its own TabChatPanel component
 * which calls usePiChat() independently.
 */
export function useChatTabs() {
  const initialId = nextTabId();
  const [tabs, setTabs] = useState<ChatTab[]>([
    { id: initialId, num: 1, title: "Chat 1" },
  ]);
  const [activeId, setActiveId] = useState(initialId);

  const renumber = useCallback(
    (list: ChatTab[]) =>
      list.map((t, i) => ({
        ...t,
        num: i + 1,
        title: t.customTitle || `Chat ${i + 1}`,
      })),
    []
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveId(tabId);
  }, []);

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) return null;
    const id = nextTabId();
    const num = tabs.length + 1;
    const title = `Chat ${num}`;
    setTabs((p) => renumber([...p, { id, num, title }]));
    setActiveId(id);
    return id;
  }, [tabs, renumber]);

  const removeTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) return null;
      const idx = tabs.findIndex((t) => t.id === tabId);
      const remaining = renumber(tabs.filter((t) => t.id !== tabId));
      const newActiveId =
        tabId === activeId
          ? remaining[Math.min(idx, remaining.length - 1)].id
          : activeId;
      setTabs(remaining);
      setActiveId(newActiveId);
      return newActiveId;
    },
    [tabs, activeId, renumber]
  );

  const updateTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, title, customTitle: title } : tab
      )
    );
  }, []);

  return {
    tabs,
    activeId,
    switchTab,
    addTab,
    removeTab,
    updateTitle,
    canAdd: tabs.length < MAX_TABS,
  };
}

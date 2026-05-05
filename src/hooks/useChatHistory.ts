"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatMessage } from "./usePiChat";

export interface ChatHistoryEntry {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "centralhub-chat-history";
const MAX_ENTRIES = 50;

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content.trim()) return "Untitled Chat";

  const text = firstUser.content.trim();
  const words = text
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 4);

  if (words.length === 0) return "Untitled Chat";

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function loadHistory(): ChatHistoryEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatHistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: ChatHistoryEntry[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function useChatHistory() {
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const upsertEntry = useCallback((entryId: string, messages: ChatMessage[]): string => {
    if (messages.length === 0) return entryId;
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return entryId;

    const id = entryId || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setHistory((prev) => {
      const existingIdx = prev.findIndex((e) => e.id === id);
      const entry: ChatHistoryEntry = {
        id,
        title: generateTitle(messages),
        timestamp: existingIdx >= 0 ? prev[existingIdx].timestamp : Date.now(),
        messageCount: messages.length,
        messages: messages.map((m) => ({ ...m, isStreaming: false })),
      };

      let next: ChatHistoryEntry[];
      if (existingIdx >= 0) {
        next = prev.slice();
        next[existingIdx] = entry;
      } else {
        next = [entry, ...prev].slice(0, MAX_ENTRIES);
      }
      saveHistory(next);
      return next;
    });

    return id;
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const updateEntryTitle = useCallback((id: string, title: string) => {
    setHistory((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], title };
      saveHistory(next);
      return next;
    });
  }, []);

  return { history, upsertEntry, removeEntry, clearAll, updateEntryTitle };
}

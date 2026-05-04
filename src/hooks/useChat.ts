"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { usePiChat, type ChatMessage } from "@/hooks/usePiChat";

/* ------------------------------------------------------------------ */
/*  Simple wrapper around usePiChat that lets us snapshot + clear     */
/*  the active conversation.                                          */
/* ------------------------------------------------------------------ */
export function useChat() {
  const chat = usePiChat();
  const snapshotRef = useRef<ChatMessage[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // Merge saved snapshot with live messages from the current session
  const messages = useMemo(() => {
    return [...snapshotRef.current, ...chat.messages];
  }, [snapshotCount, chat.messages]);

  /** Freeze current live messages into the snapshot and clear the session */
  const startNew = useCallback(() => {
    if (chat.isStreaming) chat.abort().catch(() => {});
    snapshotRef.current = [...chat.messages];
    chat.clear();
    setSnapshotCount((c) => c + 1);
  }, [chat]);

  /** Wipe everything (hard reset) */
  const resetAll = useCallback(() => {
    if (chat.isStreaming) chat.abort().catch(() => {});
    snapshotRef.current = [];
    chat.clear();
    setSnapshotCount((c) => c + 1);
  }, [chat]);

  return {
    messages,
    chat,
    startNew,
    resetAll,
    hasHistory: snapshotRef.current.length > 0,
  };
}

"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Archive,
  Menu,
  Settings,
  Cpu,
  Clock,
  Eye,
  EyeOff,
  Check,
  Key,
  Loader2,
  Search,
  Ban,
  Star,
  Palette,
  MessageSquare,
  Trash2,
  X,
} from "lucide-react";
import { useChatTabs } from "@/hooks/useChatTabs";
import { useChatHistory, type ChatHistoryEntry } from "@/hooks/useChatHistory";
import { ChatTabBar } from "@/components/ChatTabBar";
import { ChatPanel, type ChatPanelMetrics } from "@/components/ChatPanel";
import {
  LeftNav,
  type ChatSubTabId,
  type TabId,
  type WordSubTabId,
} from "@/components/LeftNav";
import {
  CodingAgentPanel,
  CODING_WORKSPACES_UPDATED_EVENT,
  deleteArchivedWorkspace,
  loadArchivedWorkspaces,
  restoreArchivedWorkspace,
  type WorkspaceOption,
} from "@/components/CodingAgentPanel";
import { WordTab } from "@/components/tabs/WordTab";
import { TypingTab } from "@/components/tabs/TypingTab";
import { SearchTab } from "@/components/tabs/SearchTab";
import { SnippetsTab } from "@/components/tabs/SnippetsTab";
import {
  loadDefaultModelPreference,
  saveDefaultModelPreference,
  usePiChat,
  type StoredModelPreference,
} from "@/hooks/usePiChat";
import {
  useTheme,
  THEMES,
  LAYOUTS,
} from "@/components/ThemeProvider";
import { CloudsLayout } from "@/components/CloudsLayout";

type IpcInvokeResult = {
  success?: boolean;
  error?: string;
  configured?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function Home() {
  const { tabs, activeId, switchTab, addTab, removeTab, updateTitle, canAdd } =
    useChatTabs();
  const { history, upsertEntry, removeEntry, updateEntryTitle } =
    useChatHistory();

  const {
    theme,
    setTheme,
    layout,
    setLayout,
  } = useTheme();

  /* ---- menu state ---- */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<"themes" | "settings" | "archive">("themes");
  const [agentSpace, setAgentSpace] = useState<"workbench" | "terminal">("workbench");
  const [defaultModel, setDefaultModel] =
    useState<StoredModelPreference | null>(() => loadDefaultModelPreference());
  const [archivedWorkspaces, setArchivedWorkspaces] =
    useState<WorkspaceOption[]>(loadArchivedWorkspaces);
  const [confirmArchiveDelete, setConfirmArchiveDelete] = useState<string | null>(
    null
  );

  /* ---- API key state ---- */
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  /* ---- model selector state ---- */
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [defaultModelDropdownOpen, setDefaultModelDropdownOpen] = useState(false);
  const [defaultModelSearch, setDefaultModelSearch] = useState("");

  /* ---- Brave Search state ---- */
  const [braveKey, setBraveKey] = useState("");
  const [showBraveKey, setShowBraveKey] = useState(false);
  const [braveSaving, setBraveSaving] = useState(false);
  const [braveSaved, setBraveSaved] = useState(false);
  const [braveConfigured, setBraveConfigured] = useState(false);
  const [braveError, setBraveError] = useState<string | null>(null);

  /* ---- Active tab in the left-nav ---- */
  const [activeNavTab, setActiveNavTab] = useState<TabId>("chat");
  const [chatSubTab, setChatSubTab] = useState<ChatSubTabId>("plain");
  const [wordSubTab, setWordSubTab] = useState<WordSubTabId>("saves");

  // We need a shared chat reference for the settings panel (model selector, API keys)
  // The first tab's chat instance serves as the "global" reference for settings.
  // Model changes broadcast to all sessions via pi:broadcast-model.
  const sharedChat = usePiChat({
    disabled: chatSubTab !== "plain" && !(menuOpen && menuTab === "settings"),
  });

  /* ---- Metrics from the active chat tab (for right column) ---- */
  const [activeMetrics, setActiveMetrics] = useState<ChatPanelMetrics | null>(null);
  const [resumeEntry, setResumeEntry] = useState<ChatHistoryEntry | null>(null);
  const [historyPreview, setHistoryPreview] = useState<ChatHistoryEntry | null>(null);
  const [confirmHistoryDelete, setConfirmHistoryDelete] = useState<string | null>(null);

  // Stable ref for activeId so handleMetricsChange never changes reference.
  // This prevents every mounted ChatPanel's useEffect from re-firing on
  // tab switch (which is what caused the message-repeating bug).
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const handleMetricsChange = useCallback(
    (tabId: string, metrics: ChatPanelMetrics) => {
      // Only accept metrics from the currently-active tab
      if (tabId === activeIdRef.current) {
        setActiveMetrics(metrics);
      }
    },
    []
  );

  const handleSaveHistory = useCallback(
    (entryId: string, messages: Parameters<typeof upsertEntry>[1]) =>
      upsertEntry(entryId, messages),
    [upsertEntry]
  );

  const handleResumeHistory = useCallback(
    (entry: ChatHistoryEntry) => {
      if (activeMetrics?.hasMessages && canAdd) addTab();
      setResumeEntry(entry);
      setActiveNavTab("chat");
      setChatSubTab("plain");
    },
    [activeMetrics?.hasMessages, addTab, canAdd]
  );

  const refreshArchivedWorkspaces = useCallback(() => {
    setArchivedWorkspaces(loadArchivedWorkspaces());
  }, []);

  useEffect(() => {
    window.addEventListener(
      CODING_WORKSPACES_UPDATED_EVENT,
      refreshArchivedWorkspaces
    );
    return () => {
      window.removeEventListener(
        CODING_WORKSPACES_UPDATED_EVENT,
        refreshArchivedWorkspaces
      );
    };
  }, [refreshArchivedWorkspaces]);

  const handleRestoreArchivedWorkspace = useCallback(
    (workspace: WorkspaceOption) => {
      restoreArchivedWorkspace(workspace);
      setConfirmArchiveDelete(null);
      refreshArchivedWorkspaces();
    },
    [refreshArchivedWorkspaces]
  );

  const handleDeleteArchivedWorkspace = useCallback(
    (workspaceId: string) => {
      deleteArchivedWorkspace(workspaceId);
      setConfirmArchiveDelete(null);
      refreshArchivedWorkspaces();
    },
    [refreshArchivedWorkspaces]
  );

  /* ---- handlers ---- */
  const handleSaveApiKey = useCallback(async () => {
    if (!openRouterKey.trim()) return;
    setSavingKey(true);
    setKeySaved(false);
    try {
      await sharedChat.setApiKey("openrouter", openRouterKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 3000);
    } catch (e) {
      console.error("Failed to save API key:", e);
    } finally {
      setSavingKey(false);
    }
  }, [openRouterKey, sharedChat]);

  const handleSelectModel = useCallback(
    async (model: { provider: string; id: string }) => {
      setModelDropdownOpen(false);
      setModelSearch("");
      try {
        await sharedChat.setModel(model.provider, model.id);
      } catch (e) {
        console.error("Failed to set model:", e);
      }
    },
    [sharedChat]
  );

  // Brave IPC shim
  const braveInvoke = useCallback(
    async (channel: string, ...args: unknown[]) => {
      if (typeof window === "undefined")
        return { success: false, error: "Not running in Electron" };
      try {
        const electron = (0, eval)("require")("electron") as {
          ipcRenderer: {
            invoke: (c: string, ...a: unknown[]) => Promise<IpcInvokeResult>;
          };
        };
        return await electron.ipcRenderer.invoke(channel, ...args);
      } catch (e) {
        return { success: false, error: String(e) };
      }
    },
    []
  );

  const handleSaveBraveKey = useCallback(async () => {
    const trimmed = braveKey.trim();
    if (!trimmed) return;
    setBraveSaving(true);
    setBraveSaved(false);
    setBraveError(null);
    try {
      const res = await braveInvoke("brave:set-key", trimmed);
      if (res?.success) {
        try {
          window.localStorage.setItem("brave-api-key", trimmed);
        } catch {}
        setBraveSaved(true);
        setBraveConfigured(!!res.configured);
        setTimeout(() => setBraveSaved(false), 3000);
      } else {
        setBraveError(res?.error ?? "Unknown error");
      }
    } finally {
      setBraveSaving(false);
    }
  }, [braveKey, braveInvoke]);

  const modelKey = (m: { provider: string; id: string }) =>
    `${m.provider}:${m.id}`;

  const defaultModelName = defaultModel
    ? sharedChat.models.find((m) => modelKey(m) === modelKey(defaultModel))?.name ??
      defaultModel.id
    : "Use last selected model";

  const handleDefaultModelChange = useCallback(
    (nextModel: StoredModelPreference | null) => {
      setDefaultModel(nextModel);
      saveDefaultModelPreference(nextModel);
      setDefaultModelDropdownOpen(false);
      setDefaultModelSearch("");
    },
    []
  );

  const openSettingsMenu = useCallback(() => {
    setMenuTab("settings");
    setMenuOpen(true);
  }, []);

  const cloudsNavContent = (
    <LeftNav
      active={activeNavTab}
      onSelect={setActiveNavTab}
      chatSubTab={chatSubTab}
      onChatSubSelect={setChatSubTab}
      wordSubTab={wordSubTab}
      onWordSubSelect={setWordSubTab}
      showWordSubTabs={false}
    />
  );

  const chatMainContent = (
    <div className="h-full min-h-0 min-w-[400px] box-border flex flex-col gap-2 p-3">
      <div className="clouds-chat-tab-titles shrink-0">
        <ChatTabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={switchTab}
          onAdd={addTab}
          onRemove={removeTab}
          canAdd={canAdd}
        />
      </div>
      <div className="flex-1 min-h-0">
        {tabs.map((tab) => (
          <ChatPanel
            key={tab.id}
            tabId={tab.id}
            isActive={tab.id === activeId}
            onStartNew={() => {}}
            onMetricsChange={handleMetricsChange}
            onSaveHistory={handleSaveHistory}
            resumeEntry={tab.id === activeId ? resumeEntry : null}
            onResumeHandled={() => setResumeEntry(null)}
            onTitleChange={updateTitle}
            onHistoryTitleChange={updateEntryTitle}
          />
        ))}
      </div>
    </div>
  );

  const chatRightContent = (
    <div className="clouds-chat-right-rail h-full min-h-0 box-border overflow-y-auto flex flex-col gap-4 p-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60 mb-3">
          <Cpu className="w-3.5 h-3.5" />
          Model
        </div>
        <div className="relative">
          <button
            className="w-full flex items-center justify-between gap-2 border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-3 py-2 rounded-sm hover:bg-white/[0.04] text-left"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  activeMetrics?.isReady || sharedChat.isReady
                    ? "bg-[var(--ch-success)]"
                    : "bg-[var(--ch-text-faint)]"
                }`}
              />
              <span className="text-[12px] truncate">
                {activeMetrics?.currentModel
                  ? activeMetrics.currentModel.name
                  : sharedChat.currentModel
                  ? sharedChat.currentModel.name
                  : sharedChat.isReady
                  ? "Select model..."
                  : "No connection"}
              </span>
            </div>
          </button>

          {modelDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => {
                  setModelDropdownOpen(false);
                  setModelSearch("");
                }}
              />
              <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl z-40 max-h-[400px] overflow-hidden flex flex-col">
                <div className="px-2 py-1.5 border-b border-[var(--ch-border-subtle)] shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-25" />
                    <input
                      type="text"
                      className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border-subtle)] text-[11px] pl-6 pr-2 py-1.5 rounded-sm outline-none focus:border-[var(--ch-text-faint)]"
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[320px]">
                  {sharedChat.filteredModels.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-40" />
                      <span className="text-[11px] opacity-30">
                        Loading models...
                      </span>
                    </div>
                  ) : (
                    (() => {
                      const query = modelSearch.toLowerCase().trim();
                      const filtered = query
                        ? sharedChat.filteredModels.filter(
                            (m) =>
                              m.name.toLowerCase().includes(query) ||
                              m.id.toLowerCase().includes(query) ||
                              m.provider.toLowerCase().includes(query)
                          )
                        : sharedChat.filteredModels;

                      return filtered.map((m) => {
                        const key = modelKey(m);
                        const isActive =
                          sharedChat.currentModel?.provider === m.provider &&
                          sharedChat.currentModel?.id === m.id;
                        const isFav = sharedChat.favorites.includes(key);
                        return (
                          <button
                            key={key}
                            className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-white/[0.06] flex items-center gap-1.5 group ${
                              isActive ? "bg-white/[0.04]" : ""
                            }`}
                            onClick={() => handleSelectModel(m)}
                          >
                            <span
                              className="shrink-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                sharedChat.toggleFavorite(key);
                              }}
                            >
                              <Star
                                className={`w-3 h-3 ${
                                  isFav
                                    ? "text-[var(--ch-gold)] fill-[var(--ch-gold)]"
                                    : "opacity-0 group-hover:opacity-20 hover:!opacity-50"
                                }`}
                              />
                            </span>
                            <span className="truncate flex-1">{m.name}</span>
                            {isActive && (
                              <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                            )}
                            <span
                              className="shrink-0 opacity-0 group-hover:opacity-30 hover:!opacity-80 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                sharedChat.toggleBlock(key);
                              }}
                            >
                              <Ban className="w-3 h-3 text-[var(--ch-error)]" />
                            </span>
                          </button>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3 opacity-60">
          Session Metrics
        </div>
        <div className="flex flex-col gap-2">
          <div className="clouds-metric-card border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-wider opacity-35">
                Cost
              </span>
              <span className="text-[13px] font-mono font-bold text-[var(--ch-success)] tabular-nums">
                $
                {activeMetrics?.sessionStats
                  ? activeMetrics.sessionStats.cost.toFixed(3)
                  : "0.000"}
              </span>
            </div>
          </div>
          <div className="clouds-metric-card border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider opacity-35">
                  Input Tokens
                </span>
                <span className="text-[11px] font-mono tabular-nums opacity-60">
                  {activeMetrics?.sessionStats
                    ? activeMetrics.sessionStats.tokens.input
                    : 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider opacity-35">
                  Output Tokens
                </span>
                <span className="text-[11px] font-mono tabular-nums opacity-60">
                  {activeMetrics?.sessionStats
                    ? activeMetrics.sessionStats.tokens.output
                    : 0}
                </span>
              </div>
              <div className="border-t border-[var(--ch-border-faint)] pt-1.5 mt-0.5 flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider opacity-35 font-bold">
                  Total
                </span>
                <span className="text-[11px] font-mono tabular-nums opacity-70 font-bold">
                  {activeMetrics?.sessionStats
                    ? activeMetrics.sessionStats.tokens.total
                    : 0}
                </span>
              </div>
            </div>
          </div>
          {activeMetrics?.contextUsage &&
            activeMetrics.contextUsage.contextWindow > 0 && (
              <div className="clouds-metric-card border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-wider opacity-35">
                      Context Usage
                    </span>
                    <span className="text-[11px] font-mono tabular-nums opacity-60">
                      {activeMetrics.contextUsage.percent != null
                        ? `${Math.round(activeMetrics.contextUsage.percent)}%`
                        : "-"}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--ch-bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${activeMetrics.contextUsage.percent ?? 0}%`,
                        background:
                          (activeMetrics.contextUsage.percent ?? 0) > 80
                            ? "var(--ch-error)"
                            : (activeMetrics.contextUsage.percent ?? 0) > 50
                            ? "var(--ch-warning)"
                            : "var(--ch-success)",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>

      <div className="mt-2 flex flex-col min-h-0 flex-1">
        <div className="flex items-center mb-2 shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60">
            <Clock className="w-3.5 h-3.5" />
            History
          </div>
        </div>
        <div className="clouds-history-list flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
          {history.length === 0 && (
            <p className="text-[11px] opacity-20 italic">No past chats yet.</p>
          )}
          {history.map((entry) => (
            <div
              key={entry.id}
              className="clouds-history-card w-full text-left px-2.5 py-2 border border-[var(--ch-border-subtle)] rounded-sm hover:bg-white/[0.04] hover:border-[var(--ch-border)] group"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3 h-3 opacity-30 shrink-0" />
                <span className="text-[11px] truncate flex-1">
                  {entry.title}
                </span>
                {confirmHistoryDelete !== entry.id && (
                  <button
                    className="opacity-0 group-hover:opacity-40 hover:!opacity-80 hover:text-[var(--ch-error)] shrink-0"
                    onClick={() => setConfirmHistoryDelete(entry.id)}
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {confirmHistoryDelete === entry.id && (
                <div className="flex items-center gap-2 mt-1 ml-5">
                  <span className="text-[9px] text-[var(--ch-error-text)]">
                    Delete?
                  </span>
                  <button
                    className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-error)] text-[var(--ch-error)] hover:bg-[var(--ch-error)]/10 rounded-sm"
                    onClick={() => {
                      removeEntry(entry.id);
                      setConfirmHistoryDelete(null);
                    }}
                  >
                    Yes
                  </button>
                  <button
                    className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm"
                    onClick={() => setConfirmHistoryDelete(null)}
                  >
                    No
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between mt-1 ml-5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] opacity-25 font-mono">
                    {new Date(entry.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-[9px] opacity-20">
                    {entry.messageCount} msgs
                  </span>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm"
                    onClick={() => setHistoryPreview(entry)}
                  >
                    View
                  </button>
                  <button
                    className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm"
                    onClick={() => handleResumeHistory(entry)}
                  >
                    Resume
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const cloudsMainContent =
    activeNavTab === "chat" && chatSubTab === "plain" ? (
      chatMainContent
    ) : activeNavTab === "chat" && chatSubTab === "coding" ? (
      <div className="h-full min-h-0 box-border flex gap-2 p-3">
        <CodingAgentPanel
          theme="workbench"
          infoPortalId="clouds-coding-info-slot"
          workspacesPortalId="clouds-coding-workspaces-slot"
        />
      </div>
    ) : activeNavTab === "word" ? (
      <div className="h-full min-h-0 box-border flex flex-col p-3">
        <WordTab
          subTab={wordSubTab}
          onSubTabChange={setWordSubTab}
          aiPortalId="clouds-word-ai-slot"
          savesPortalId="clouds-word-saves-slot"
        />
      </div>
    ) : activeNavTab === "typing" ? (
      <div className="h-full min-h-0 box-border flex flex-col p-3">
        <TypingTab />
      </div>
    ) : activeNavTab === "search" ? undefined : (
      <div className="h-full min-h-0 box-border flex flex-col p-3">
        <SnippetsTab />
      </div>
    );

  const cloudsMainStackTop =
    activeNavTab === "search" ? (
      <div
        id="clouds-search-top-slot"
        className="h-full min-h-0 box-border p-3 [&>section]:h-full [&>section]:w-full [&>section]:border-0 [&>section]:rounded-[1.85rem]"
      />
    ) : undefined;

  const cloudsMainStackBottom =
    activeNavTab === "search" ? (
      <div className="h-full min-h-0 box-border p-3 flex flex-col">
        <div
          id="clouds-search-bottom-slot"
          className="flex-1 min-h-0 [&>section]:h-full [&>section]:w-full [&>section]:border-0 [&>section]:rounded-[1.85rem]"
        />
        <SearchTab
          topPortalId="clouds-search-top-slot"
          bottomPortalId="clouds-search-bottom-slot"
          deskPortalId="clouds-search-desk-slot"
        />
      </div>
    ) : undefined;

  const cloudsRightContent =
    activeNavTab === "chat" && chatSubTab === "plain" ? (
      chatRightContent
    ) : activeNavTab === "word" ? (
      <div
        id="clouds-word-ai-slot"
        className="h-full min-h-0 [&>aside]:h-full [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0 [&>aside]:border-0 [&>aside]:rounded-[1.85rem]"
      />
    ) : activeNavTab === "search" ? (
      <div
        id="clouds-search-desk-slot"
        className="h-full min-h-0 [&>aside]:h-full [&>aside]:w-full [&>aside]:max-w-none [&>aside]:min-w-0 [&>aside]:border-0 [&>aside]:rounded-[1.85rem]"
      />
    ) : undefined;

  const cloudsRightStackTop =
    activeNavTab === "chat" && chatSubTab === "coding" ? (
      <div
        id="clouds-coding-info-slot"
        className="h-full min-h-0 box-border p-3"
      />
    ) : undefined;

  const cloudsRightStackBottom =
    activeNavTab === "chat" && chatSubTab === "coding" ? (
      <div
        id="clouds-coding-workspaces-slot"
        className="h-full min-h-0 box-border p-3"
      />
    ) : undefined;

  const cloudsLeftContent =
    activeNavTab === "word" ? (
      <div
        id="clouds-word-saves-slot"
        className="h-full min-h-0 [&>div]:h-full [&>div]:min-w-0 [&>div]:border-0 [&>div]:rounded-[1.85rem]"
      />
    ) : undefined;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <div className="h-[calc(100vh-16px)] w-full flex text-[var(--ch-text)] font-[family-name:var(--font-sans)] text-[12px] p-2 gap-2 overflow-hidden items-stretch no-drag mt-4">
      {/* ============================================================ */}
      {/*  MENU OVERLAY                                                 */}
      {/* ============================================================ */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] pointer-events-none">
            <div className="pointer-events-auto w-[560px] max-h-[80vh] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-[var(--ch-border)] shrink-0">
                <button
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                    menuTab === "themes"
                      ? "bg-white/[0.04] text-[var(--ch-text)]"
                      : "text-[var(--ch-text-muted)] hover:text-[var(--ch-text)]"
                  }`}
                  onClick={() => setMenuTab("themes")}
                >
                  <Palette className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Theme Area
                </button>
                <button
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                    menuTab === "settings"
                      ? "bg-white/[0.04] text-[var(--ch-text)]"
                      : "text-[var(--ch-text-muted)] hover:text-[var(--ch-text)]"
                  }`}
                  onClick={() => setMenuTab("settings")}
                >
                  <Settings className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Settings
                </button>
                <button
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                    menuTab === "archive"
                      ? "bg-white/[0.04] text-[var(--ch-text)]"
                      : "text-[var(--ch-text-muted)] hover:text-[var(--ch-text)]"
                  }`}
                  onClick={() => setMenuTab("archive")}
                >
                  <Archive className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Archive
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {menuTab === "themes" && (
                  <div className="flex flex-col gap-6">
                    {/* Layout switcher — Foundations (current) vs Clouds (bubbles) */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Palette className="w-3.5 h-3.5" />
                        Layout
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {LAYOUTS.map((opt) => {
                          const isActive = layout === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setLayout(opt.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-sm text-left transition-colors ${
                                isActive
                                  ? "border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                                  : "border-[var(--ch-border-subtle)] hover:border-[#FFB347]/40 hover:bg-white/[0.02]"
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isActive
                                    ? "bg-[var(--ch-accent)]"
                                    : "bg-[var(--ch-border)]"
                                }`}
                              />
                              <span
                                className={`text-[12px] font-mono ${
                                  isActive
                                    ? "text-[var(--ch-accent)]"
                                    : "text-[var(--ch-text)]"
                                }`}
                              >
                                {opt.label}
                              </span>
                              {isActive && (
                                <Check className="w-3.5 h-3.5 text-[var(--ch-success)] ml-auto shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>


                    {/* Theme grid — dark left, light right */}
                    <div className="grid grid-cols-2 gap-4">
                      {(["dark", "light"] as const).map((mode) => (
                        <section key={mode}>
                          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                            <Palette className="w-3.5 h-3.5" />
                            {mode === "dark" ? "Dark" : "Light"}
                          </h3>
                          <div className="flex flex-col gap-1.5">
                            {THEMES.filter((t) => t.mode === mode).map((t) => {
                              const isActive = theme === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setTheme(t.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-sm text-left transition-colors ${
                                    isActive
                                      ? "border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                                      : "border-[var(--ch-border-subtle)] hover:border-[#FFB347]/40 hover:bg-white/[0.02]"
                                  }`}
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isActive ? "bg-[var(--ch-accent)]" : "bg-[var(--ch-border)]"
                                    }`}
                                  />
                                  <span
                                    className={`text-[12px] font-mono ${
                                      isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text)]"
                                    }`}
                                  >
                                    {t.label}
                                  </span>
                                  {isActive && (
                                    <Check className="w-3.5 h-3.5 text-[var(--ch-success)] ml-auto shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>

                    {/* Agent Space */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Cpu className="w-3.5 h-3.5" />
                        Agent Space
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: "workbench", label: "Workbench", swatch: "bg-[#4DA3FF]" },
                          { id: "terminal", label: "Terminal", swatch: "bg-[#49D17C]" },
                        ] as const).map((opt) => {
                          const isActive = agentSpace === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setAgentSpace(opt.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-sm text-left transition-colors ${
                                isActive
                                  ? "border-[var(--ch-accent)] bg-[var(--ch-accent-5)]"
                                  : "border-[var(--ch-border-subtle)] hover:border-[#FFB347]/40 hover:bg-white/[0.02]"
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.swatch}`} />
                              <span
                                className={`text-[12px] font-mono ${
                                  isActive ? "text-[var(--ch-accent)]" : "text-[var(--ch-text)]"
                                }`}
                              >
                                {opt.label}
                              </span>
                              {isActive && (
                                <Check className="w-3.5 h-3.5 text-[var(--ch-success)] ml-auto shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                )}

                {menuTab === "settings" && (
                  <div className="flex flex-col gap-6">
                    {/* Default Model */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Cpu className="w-3.5 h-3.5" />
                        Default Model
                      </h3>
                      <div className="flex flex-col gap-2">
                        <div className="relative">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-2 bg-[var(--ch-bg-elevated)] border border-[var(--ch-border)] text-[12px] px-3 py-2 rounded-sm outline-none hover:bg-white/[0.04] focus:border-[var(--ch-text-faint)] transition-colors text-left"
                            onClick={() =>
                              setDefaultModelDropdownOpen(
                                !defaultModelDropdownOpen
                              )
                            }
                          >
                            <span className="truncate">{defaultModelName}</span>
                          </button>

                          {defaultModelDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => {
                                  setDefaultModelDropdownOpen(false);
                                  setDefaultModelSearch("");
                                }}
                              />
                              <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl z-40 max-h-[340px] overflow-hidden flex flex-col">
                                <div className="px-2 py-1.5 border-b border-[var(--ch-border-subtle)] shrink-0">
                                  <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-25" />
                                    <input
                                      type="text"
                                      className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border-subtle)] text-[11px] pl-6 pr-2 py-1.5 rounded-sm outline-none focus:border-[var(--ch-text-faint)]"
                                      placeholder="Search models..."
                                      value={defaultModelSearch}
                                      onChange={(e) =>
                                        setDefaultModelSearch(e.target.value)
                                      }
                                      autoFocus
                                    />
                                  </div>
                                </div>
                                <div className="overflow-y-auto max-h-[280px]">
                                  <button
                                    type="button"
                                    className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-white/[0.06] flex items-center gap-1.5 ${
                                      !defaultModel ? "bg-white/[0.04]" : ""
                                    }`}
                                    onClick={() => handleDefaultModelChange(null)}
                                  >
                                    <span className="truncate flex-1">
                                      Use last selected model
                                    </span>
                                    {!defaultModel && (
                                      <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                                    )}
                                  </button>
                                  {sharedChat.filteredModels.length === 0 ? (
                                    <div className="px-3 py-4 text-center">
                                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-40" />
                                      <span className="text-[11px] opacity-30">
                                        Loading models...
                                      </span>
                                    </div>
                                  ) : (
                                    (() => {
                                      const query = defaultModelSearch
                                        .toLowerCase()
                                        .trim();
                                      const filtered = query
                                        ? sharedChat.filteredModels.filter(
                                            (m) =>
                                              m.name
                                                .toLowerCase()
                                                .includes(query) ||
                                              m.id
                                                .toLowerCase()
                                                .includes(query) ||
                                              m.provider
                                                .toLowerCase()
                                                .includes(query)
                                          )
                                        : sharedChat.filteredModels;

                                      return filtered.map((m) => {
                                        const key = modelKey(m);
                                        const isActive =
                                          defaultModel?.provider ===
                                            m.provider &&
                                          defaultModel?.id === m.id;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-white/[0.06] flex items-center gap-1.5 ${
                                              isActive ? "bg-white/[0.04]" : ""
                                            }`}
                                            onClick={() =>
                                              handleDefaultModelChange({
                                                provider: m.provider,
                                                id: m.id,
                                              })
                                            }
                                          >
                                            <span className="truncate flex-1">
                                              {m.name}
                                            </span>
                                            {isActive && (
                                              <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                                            )}
                                          </button>
                                        );
                                      });
                                    })()
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 py-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              defaultModel ? "bg-[var(--ch-success)]" : "bg-[var(--ch-text-faint)]"
                            }`}
                          />
                          <span className="text-[11px] opacity-50">
                            {defaultModel
                              ? "New chats start with this model"
                              : "New chats follow the last selected model"}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* AI Provider */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Cpu className="w-3.5 h-3.5" />
                        AI Provider
                      </h3>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider opacity-50 mb-1.5 block">
                            OpenRouter API Key
                          </label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type={showKey ? "text" : "password"}
                                value={openRouterKey}
                                onChange={(e) => {
                                  setOpenRouterKey(e.target.value);
                                  setKeySaved(false);
                                }}
                                placeholder="sk-or-v1-..."
                                className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border)] text-[12px] px-3 py-2 pr-9 rounded-sm outline-none focus:border-[var(--ch-text-faint)] transition-colors font-mono"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveApiKey();
                                }}
                              />
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
                                onClick={() => setShowKey(!showKey)}
                              >
                                {showKey ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <button
                              className="px-4 py-2 border border-[var(--ch-border)] hover:bg-white/[0.08] transition-colors rounded-sm flex items-center gap-1.5 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={handleSaveApiKey}
                              disabled={!openRouterKey.trim() || savingKey}
                            >
                              {savingKey ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : keySaved ? (
                                <Check className="w-3.5 h-3.5 text-[var(--ch-success)]" />
                              ) : (
                                <Key className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[11px] uppercase tracking-wider">
                                {savingKey ? "Saving…" : keySaved ? "Saved" : "Save"}
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 py-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              sharedChat.authProviders["openrouter"]
                                ? "bg-[var(--ch-success)]"
                                : "bg-[var(--ch-text-faint)]"
                            }`}
                          />
                          <span className="text-[11px] opacity-50">
                            {sharedChat.authProviders["openrouter"]
                              ? "OpenRouter key configured"
                              : "No API key set"}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Brave Search */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Search className="w-3.5 h-3.5" />
                        Brave Search
                      </h3>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider opacity-50 mb-1.5 block">
                            Brave API Key
                          </label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type={showBraveKey ? "text" : "password"}
                                value={braveKey}
                                onChange={(e) => {
                                  setBraveKey(e.target.value);
                                  setBraveSaved(false);
                                }}
                                placeholder="BSA…"
                                className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border)] text-[12px] px-3 py-2 pr-9 rounded-sm outline-none focus:border-[var(--ch-text-faint)] transition-colors font-mono"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveBraveKey();
                                }}
                              />
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
                                onClick={() => setShowBraveKey(!showBraveKey)}
                              >
                                {showBraveKey ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <button
                              className="px-4 py-2 border border-[var(--ch-border)] hover:bg-white/[0.08] transition-colors rounded-sm flex items-center gap-1.5 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={handleSaveBraveKey}
                              disabled={!braveKey.trim() || braveSaving}
                            >
                              {braveSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : braveSaved ? (
                                <Check className="w-3.5 h-3.5 text-[var(--ch-success)]" />
                              ) : (
                                <Key className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[11px] uppercase tracking-wider">
                                {braveSaving
                                  ? "Saving…"
                                  : braveSaved
                                  ? "Saved"
                                  : "Save"}
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 py-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              braveError
                                ? "bg-[var(--ch-error)]"
                                : braveConfigured
                                ? "bg-[var(--ch-success)]"
                                : "bg-[var(--ch-text-faint)]"
                            }`}
                          />
                          <span className="text-[11px] opacity-50">
                            {braveError
                              ? "Brave key save failed"
                              : braveConfigured
                              ? "Brave key configured"
                              : "No Brave key set"}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Blocked Models */}
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        Blocked Models
                      </h3>
                      {sharedChat.blocked.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic">
                          No models blocked.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {sharedChat.blocked.map((key) => {
                            const model = sharedChat.models.find(
                              (m) => `${m.provider}:${m.id}` === key
                            );
                            const name = model ? model.name : key;
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2 py-1.5 pl-2 border-b border-[var(--ch-border-faint)] group hover:bg-white/[0.02]"
                              >
                                <Ban className="w-3 h-3 text-[var(--ch-error)] shrink-0 opacity-50" />
                                <span className="flex-1 text-[12px] opacity-40 truncate">
                                  {name}
                                </span>
                                <button
                                  className="text-[10px] text-[var(--ch-success)] hover:text-[#66DD66] opacity-50 hover:opacity-100 transition-all shrink-0 uppercase tracking-wider"
                                  onClick={() => sharedChat.unblockModel(key)}
                                >
                                  Unblock
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {menuTab === "archive" && (
                  <div className="flex flex-col gap-6">
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Archive className="w-3.5 h-3.5" />
                        Archived Workspaces
                      </h3>
                      {archivedWorkspaces.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic">
                          No archived workspaces.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {archivedWorkspaces.map((workspace) => (
                            <div
                              key={workspace.id}
                              className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm p-3"
                            >
                              <div className="flex items-start gap-3">
                                <Archive className="w-3.5 h-3.5 mt-0.5 text-[var(--ch-text-faint)] shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12px] font-mono text-[var(--ch-text)] truncate">
                                    {workspace.name}
                                  </div>
                                  <div className="mt-0.5 text-[10px] font-mono text-[var(--ch-text-faint)] truncate">
                                    {workspace.path}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRestoreArchivedWorkspace(workspace)}
                                  className="h-[26px] px-2 flex items-center gap-1.5 border border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--ch-success)] hover:border-[var(--ch-success)] rounded-sm transition-colors shrink-0"
                                  title={`Restore ${workspace.name}`}
                                >
                                  <Check className="w-3 h-3" />
                                  <span className="text-[10px] uppercase tracking-wider">
                                    Restore
                                  </span>
                                </button>
                                {confirmArchiveDelete !== workspace.id && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmArchiveDelete(workspace.id)}
                                    className="h-[26px] w-[26px] flex items-center justify-center border border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--ch-error)] hover:border-[var(--ch-error)] rounded-sm transition-colors shrink-0"
                                    title={`Delete ${workspace.name}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {confirmArchiveDelete === workspace.id && (
                                <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                                  <span className="text-[var(--ch-error-text)]">
                                    Delete workspace and chats?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteArchivedWorkspace(workspace.id)}
                                    className="px-1.5 py-0.5 border border-[var(--ch-error)] text-[var(--ch-error)] hover:bg-[var(--ch-error)]/10 rounded-sm uppercase tracking-wider transition-colors"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmArchiveDelete(null)}
                                    className="px-1.5 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm uppercase tracking-wider transition-colors"
                                  >
                                    No
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {layout === "clouds" ? (
        <CloudsLayout
          nav={cloudsNavContent}
          left={cloudsLeftContent}
          main={cloudsMainContent}
          mainStackTop={cloudsMainStackTop}
          mainStackBottom={cloudsMainStackBottom}
          right={cloudsRightContent}
          rightStackTop={cloudsRightStackTop}
          rightStackBottom={cloudsRightStackBottom}
          onOpenMenu={openSettingsMenu}
        />
      ) : (
      <>
      {/* ==================== LEFT COLUMN ==================== */}
      <div className="w-1/5 max-w-[240px] min-w-[200px] flex flex-col gap-2 h-full">
        <div
          className="border border-[var(--ch-border)] p-3 flex justify-between items-center cursor-pointer hover:bg-[var(--ch-bg-hover)] transition-colors rounded-sm select-none"
          onClick={() => {
            if (!menuOpen) setMenuTab("settings");
            setMenuOpen(!menuOpen);
          }}
        >
          <span className="font-bold text-[10px] tracking-widest uppercase">
            Menu
          </span>
          <Menu className="w-4 h-4" />
        </div>
        <LeftNav
          active={activeNavTab}
          onSelect={setActiveNavTab}
          chatSubTab={chatSubTab}
          onChatSubSelect={setChatSubTab}
          wordSubTab={wordSubTab}
          onWordSubSelect={setWordSubTab}
        />
      </div>

      {/*
        Chat columns stay mounted on nav-tab switches so messages,
        attachments, and per-panel state survive a trip through Docs Area /
        Typing / Search / Snippets and back. `display: contents` keeps
        the wrapper invisible to flex layout when active; `display:
        none` fully hides while preserving the React subtree.
      */}
      <div
        style={{
          display:
            activeNavTab === "chat" && chatSubTab === "plain"
              ? "contents"
              : "none",
        }}
      >
          {/* ==================== CENTER COLUMN ==================== */}
          <div className="flex-1 min-h-0 min-w-[400px] flex flex-col gap-2">
            {/* Chat Tab Bar */}
            <ChatTabBar
              tabs={tabs}
              activeId={activeId}
              onSelect={switchTab}
              onAdd={addTab}
              onRemove={removeTab}
              canAdd={canAdd}
            />

            {/* Tab panels — each renders its own usePiChat instance */}
            <div className="flex-1 min-h-0">
              {tabs.map((tab) => (
                <ChatPanel
                  key={tab.id}
                  tabId={tab.id}
                  isActive={tab.id === activeId}
                  onStartNew={() => {}}
                  onMetricsChange={handleMetricsChange}
                  onSaveHistory={handleSaveHistory}
                  resumeEntry={tab.id === activeId ? resumeEntry : null}
                  onResumeHandled={() => setResumeEntry(null)}
                  onTitleChange={updateTitle}
                  onHistoryTitleChange={updateEntryTitle}
                />
              ))}
            </div>
          </div>

          {/* ==================== RIGHT COLUMN ==================== */}
          <div className="w-1/4 max-w-[300px] min-w-[200px] h-full border border-[var(--ch-border)] p-4 overflow-y-auto flex flex-col gap-4 rounded-sm">
            {/* Model Selector */}
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60 mb-3">
                <Cpu className="w-3.5 h-3.5" />
                Model
              </div>
              <div className="relative">
                <button
                  className="w-full flex items-center justify-between gap-2 border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-3 py-2 rounded-sm hover:bg-white/[0.04] transition-colors text-left"
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        (activeMetrics?.isReady || sharedChat.isReady) ? "bg-[var(--ch-success)]" : "bg-[var(--ch-text-faint)]"
                      }`}
                    />
                    <span className="text-[12px] truncate">
                      {activeMetrics?.currentModel
                        ? activeMetrics.currentModel.name
                        : sharedChat.currentModel
                        ? sharedChat.currentModel.name
                        : sharedChat.isReady
                        ? "Select model…"
                        : "No connection"}
                    </span>
                  </div>
                </button>

                {modelDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => {
                        setModelDropdownOpen(false);
                        setModelSearch("");
                      }}
                    />
                    <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl z-40 max-h-[400px] overflow-hidden flex flex-col">
                      <div className="px-2 py-1.5 border-b border-[var(--ch-border-subtle)] shrink-0">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-25" />
                          <input
                            type="text"
                            className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border-subtle)] text-[11px] pl-6 pr-2 py-1.5 rounded-sm outline-none focus:border-[var(--ch-text-faint)] transition-colors"
                            placeholder="Search models…"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-[320px]">
                        {sharedChat.filteredModels.length === 0 ? (
                          <div className="px-3 py-4 text-center">
                            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-40" />
                            <span className="text-[11px] opacity-30">
                              Loading models…
                            </span>
                          </div>
                        ) : (
                          <>
                            {(() => {
                              const query = modelSearch.toLowerCase().trim();
                              const filtered = query
                                ? sharedChat.filteredModels.filter(
                                    (m) =>
                                      m.name
                                        .toLowerCase()
                                        .includes(query) ||
                                      m.id.toLowerCase().includes(query) ||
                                      m.provider
                                        .toLowerCase()
                                        .includes(query)
                                  )
                                : sharedChat.filteredModels;

                              return filtered.map((m) => {
                                const key = modelKey(m);
                                const isActive =
                                  sharedChat.currentModel
                                    ?.provider === m.provider &&
                                  sharedChat.currentModel?.id === m.id;
                                const isFav =
                                  sharedChat.favorites.includes(key);
                                return (
                                  <button
                                    key={key}
                                    className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-white/[0.06] transition-colors flex items-center gap-1.5 group ${
                                      isActive ? "bg-white/[0.04]" : ""
                                    }`}
                                    onClick={() => handleSelectModel(m)}
                                  >
                                    <span
                                      className="shrink-0 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sharedChat.toggleFavorite(key);
                                      }}
                                    >
                                      <Star
                                        className={`w-3 h-3 transition-colors ${
                                          isFav
                                            ? "text-[var(--ch-gold)] fill-[var(--ch-gold)]"
                                            : "opacity-0 group-hover:opacity-20 hover:!opacity-50"
                                        }`}
                                      />
                                    </span>
                                    <span className="truncate flex-1">
                                      {m.name}
                                    </span>
                                    {isActive && (
                                      <Check className="w-3 h-3 text-[var(--ch-success)] shrink-0" />
                                    )}
                                    <span
                                      className="shrink-0 opacity-0 group-hover:opacity-30 hover:!opacity-80 cursor-pointer transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sharedChat.toggleBlock(key);
                                      }}
                                    >
                                      <Ban className="w-3 h-3 text-[var(--ch-error)]" />
                                    </span>
                                  </button>
                                );
                              });
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Model details */}
              {(activeMetrics?.currentModel || sharedChat.currentModel) && (
                <div className="mt-2 px-2 py-2 border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)]">
                  <div className="flex flex-col gap-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="opacity-35">Provider</span>
                      <span className="opacity-60 font-mono">
                        {(activeMetrics?.currentModel || sharedChat.currentModel)!.provider}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-35">Model ID</span>
                      <span className="opacity-60 font-mono truncate max-w-[140px]">
                        {(activeMetrics?.currentModel || sharedChat.currentModel)!.id}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Session Metrics — always visible */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-3 opacity-60">
                Session Metrics
              </div>
              <div className="flex flex-col gap-2">
                {/* Cost */}
                <div className="border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-wider opacity-35">
                      Cost
                    </span>
                    <span className="text-[13px] font-mono font-bold text-[var(--ch-success)] tabular-nums">
                      ${activeMetrics?.sessionStats ? activeMetrics.sessionStats.cost.toFixed(3) : "0.000"}
                    </span>
                  </div>
                </div>

                {/* Tokens */}
                <div className="border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider opacity-35">
                        Input Tokens
                      </span>
                      <span className="text-[11px] font-mono tabular-nums opacity-60">
                        {activeMetrics?.sessionStats ? activeMetrics.sessionStats.tokens.input : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider opacity-35">
                        Output Tokens
                      </span>
                      <span className="text-[11px] font-mono tabular-nums opacity-60">
                        {activeMetrics?.sessionStats ? activeMetrics.sessionStats.tokens.output : 0}
                      </span>
                    </div>
                    {activeMetrics?.sessionStats && (activeMetrics.sessionStats.tokens.cacheRead > 0 || activeMetrics.sessionStats.tokens.cacheWrite > 0) && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-wider opacity-35">
                            Cache Read
                          </span>
                          <span className="text-[11px] font-mono tabular-nums opacity-60">
                            {activeMetrics.sessionStats.tokens.cacheRead}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase tracking-wider opacity-35">
                            Cache Write
                          </span>
                          <span className="text-[11px] font-mono tabular-nums opacity-60">
                            {activeMetrics.sessionStats.tokens.cacheWrite}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="border-t border-[var(--ch-border-faint)] pt-1.5 mt-0.5 flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider opacity-35 font-bold">
                        Total
                      </span>
                      <span className="text-[11px] font-mono tabular-nums opacity-70 font-bold">
                        {activeMetrics?.sessionStats ? activeMetrics.sessionStats.tokens.total : 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Context Usage */}
                {activeMetrics?.contextUsage && activeMetrics.contextUsage.contextWindow > 0 && (
                  <div className="border border-[var(--ch-border-subtle)] rounded-sm bg-[var(--ch-bg-inset)] px-3 py-2.5">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider opacity-35">
                          Context Usage
                        </span>
                        <span className="text-[11px] font-mono tabular-nums opacity-60">
                          {activeMetrics.contextUsage.percent != null
                            ? `${Math.round(activeMetrics.contextUsage.percent)}%`
                            : "—"}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--ch-bg-elevated)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${activeMetrics.contextUsage.percent ?? 0}%`,
                            background: (activeMetrics.contextUsage.percent ?? 0) > 80
                              ? "var(--ch-error)"
                              : (activeMetrics.contextUsage.percent ?? 0) > 50
                              ? "var(--ch-warning)"
                              : "var(--ch-success)",
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[9px] opacity-30">
                        <span className="font-mono">
                          {activeMetrics.contextUsage.tokens != null ? activeMetrics.contextUsage.tokens.toLocaleString() : 0} tokens
                        </span>
                        <span className="font-mono">
                          {activeMetrics.contextUsage.contextWindow.toLocaleString()} max
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-col min-h-0" style={{ maxHeight: "40%" }}>
              <div className="flex items-center mb-2 shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60">
                  <Clock className="w-3.5 h-3.5" />
                  History
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
                {history.length === 0 && (
                  <p className="text-[11px] opacity-20 italic">No past chats yet.</p>
                )}
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="w-full text-left px-2.5 py-2 border border-[var(--ch-border-subtle)] rounded-sm hover:bg-white/[0.04] hover:border-[var(--ch-border)] transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 opacity-30 shrink-0" />
                      <span className="text-[11px] truncate flex-1">
                        {entry.title}
                      </span>
                      {confirmHistoryDelete !== entry.id && (
                        <button
                          className="opacity-0 group-hover:opacity-40 hover:!opacity-80 hover:text-[var(--ch-error)] transition-all shrink-0"
                          onClick={() => setConfirmHistoryDelete(entry.id)}
                          title="Delete"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {confirmHistoryDelete === entry.id && (
                      <div className="flex items-center gap-2 mt-1 ml-5">
                        <span className="text-[9px] text-[var(--ch-error-text)]">
                          Delete?
                        </span>
                        <button
                          className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-error)] text-[var(--ch-error)] hover:bg-[var(--ch-error)]/10 rounded-sm transition-colors"
                          onClick={() => {
                            removeEntry(entry.id);
                            setConfirmHistoryDelete(null);
                          }}
                        >
                          Yes
                        </button>
                        <button
                          className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm transition-colors"
                          onClick={() => setConfirmHistoryDelete(null)}
                        >
                          No
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1 ml-5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] opacity-25 font-mono">
                          {new Date(entry.timestamp).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" }
                          )}
                        </span>
                        <span className="text-[9px] opacity-20">
                          {entry.messageCount} msgs
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm transition-colors"
                          onClick={() => setHistoryPreview(entry)}
                        >
                          View
                        </button>
                        <button
                          className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm transition-colors"
                          onClick={() => handleResumeHistory(entry)}
                        >
                          Resume
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
      </div>

      <div
        style={{
          display:
            activeNavTab === "chat" && chatSubTab === "coding"
              ? "contents"
              : "none",
        }}
      >
        <CodingAgentPanel theme="workbench" />
      </div>

      {historyPreview && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setHistoryPreview(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
            <div className="pointer-events-auto w-[600px] max-h-[80vh] border border-[var(--ch-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ch-border)] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-4 h-4 opacity-40 shrink-0" />
                  <span className="text-[12px] font-bold truncate">
                    {historyPreview.title}
                  </span>
                  <span className="text-[10px] opacity-30 font-mono shrink-0">
                    {new Date(historyPreview.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 text-[10px] uppercase tracking-wider border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm transition-colors"
                    onClick={() => {
                      handleResumeHistory(historyPreview);
                      setHistoryPreview(null);
                    }}
                  >
                    Resume
                  </button>
                  <button
                    className="p-1 hover:bg-white/[0.08] rounded-sm transition-colors"
                    onClick={() => setHistoryPreview(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
                {historyPreview.messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] border border-[var(--ch-border)] bg-[var(--ch-bg-elevated)] px-4 py-2.5 rounded-sm">
                        <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ) : message.role === "assistant" ? (
                    <div key={message.id} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-40 ml-1">
                        PI
                      </span>
                      <div className="border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-4 py-2.5 rounded-sm">
                        <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ) : message.role === "tool" && message.content ? (
                    <div key={message.id} className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-30 ml-1">
                        {message.toolName}
                      </span>
                      <div className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all max-h-[100px] overflow-y-auto opacity-40">
                        {message.content}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/*
        Same persistence trick as the Chat columns above: keep WordTab
        mounted so the AIPanel's PI session and message history survive
        a nav-tab switch.
      */}
      <div style={{ display: activeNavTab === "word" ? "contents" : "none" }}>
        <WordTab subTab={wordSubTab} onSubTabChange={setWordSubTab} />
      </div>
      {activeNavTab === "typing" && <TypingTab />}
      {/*
        Keep SearchTab mounted while hidden so active AI search requests retain
        their stream listener, request id mapping, and in-memory result state.
      */}
      <div style={{ display: activeNavTab === "search" ? "contents" : "none" }}>
        <SearchTab />
      </div>
      {activeNavTab === "snippets" && <SnippetsTab />}
      </>
      )}
    </div>
  );
}

"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Menu,
  Settings,
  FolderOpen,
  Cpu,
  Eye,
  EyeOff,
  Check,
  Key,
  Loader2,
  Search,
  Ban,
  Star,
  Palette,
} from "lucide-react";
import { useChatTabs } from "@/hooks/useChatTabs";
import { ChatTabBar } from "@/components/ChatTabBar";
import { ChatPanel, type ChatPanelMetrics } from "@/components/ChatPanel";
import { LeftNav, type TabId, type WordSubTabId } from "@/components/LeftNav";
import { WordTab } from "@/components/tabs/WordTab";
import { TypingTab } from "@/components/tabs/TypingTab";
import { SearchTab } from "@/components/tabs/SearchTab";
import { SnippetsTab } from "@/components/tabs/SnippetsTab";
import { usePiChat } from "@/hooks/usePiChat";
import { useTheme, THEMES } from "@/components/ThemeProvider";

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function Home() {
  const { tabs, activeId, switchTab, addTab, removeTab, canAdd } =
    useChatTabs();

  // We need a shared chat reference for the settings panel (model selector, API keys)
  // The first tab's chat instance serves as the "global" reference for settings.
  // Model changes broadcast to all sessions via pi:broadcast-model.
  const sharedChat = usePiChat();

  const { theme, setTheme } = useTheme();

  /* ---- menu state ---- */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<"settings" | "documents">("settings");

  /* ---- API key state ---- */
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  /* ---- model selector state ---- */
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  /* ---- Brave Search state ---- */
  const [braveKey, setBraveKey] = useState("");
  const [showBraveKey, setShowBraveKey] = useState(false);
  const [braveSaving, setBraveSaving] = useState(false);
  const [braveSaved, setBraveSaved] = useState(false);
  const [braveConfigured, setBraveConfigured] = useState(false);
  const [braveError, setBraveError] = useState<string | null>(null);

  /* ---- Active tab in the left-nav ---- */
  const [activeNavTab, setActiveNavTab] = useState<TabId>("chat");
  const [wordSubTab, setWordSubTab] = useState<WordSubTabId>("saves");

  /* ---- Metrics from the active chat tab (for right column) ---- */
  const [activeMetrics, setActiveMetrics] = useState<ChatPanelMetrics | null>(null);

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

  /* ---- handlers ---- */
  const handleSaveApiKey = useCallback(async () => {
    if (!openRouterKey.trim()) return;
    setSavingKey(true);
    setKeySaved(false);
    try {
      await sharedChat.setApiKey("openrouter", openRouterKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 3000);
    } catch (e: any) {
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
      } catch (e: any) {
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
            invoke: (c: string, ...a: unknown[]) => Promise<any>;
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
                    menuTab === "documents"
                      ? "bg-white/[0.04] text-[var(--ch-text)]"
                      : "text-[var(--ch-text-muted)] hover:text-[var(--ch-text)]"
                  }`}
                  onClick={() => setMenuTab("documents")}
                >
                  <FolderOpen className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Documents &amp; Media
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {menuTab === "settings" && (
                  <div className="flex flex-col gap-6">
                    {/* Theme Selector */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Palette className="w-3.5 h-3.5" />
                        Theme
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {THEMES.map((t) => {
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
                            const name = model
                              ? `${model.provider}/${model.name}`
                              : key;
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

                {menuTab === "documents" && (
                  <div className="flex flex-col gap-6">
                    <p className="text-[12px] opacity-25 italic">
                      Document history displayed here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== LEFT COLUMN ==================== */}
      <div className="w-1/5 max-w-[240px] min-w-[200px] flex flex-col gap-2 h-full">
        <div
          className="border border-[var(--ch-border)] p-3 flex justify-between items-center cursor-pointer hover:bg-[var(--ch-bg-hover)] transition-colors rounded-sm select-none"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="font-bold text-[10px] tracking-widest uppercase">
            Menu
          </span>
          <Menu className="w-4 h-4" />
        </div>
        <LeftNav active={activeNavTab} onSelect={setActiveNavTab} wordSubTab={wordSubTab} onWordSubSelect={setWordSubTab} />
      </div>

      {/*
        Chat columns stay mounted on nav-tab switches so messages,
        attachments, and per-panel state survive a trip through Docs Area /
        Typing / Search / Snippets and back. `display: contents` keeps
        the wrapper invisible to flex layout when active; `display:
        none` fully hides while preserving the React subtree.
      */}
      <div style={{ display: activeNavTab === "chat" ? "contents" : "none" }}>
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

                              const grouped: Record<
                                string,
                                typeof filtered
                              > = {};
                              for (const m of filtered) {
                                if (!grouped[m.provider])
                                  grouped[m.provider] = [];
                                grouped[m.provider].push(m);
                              }
                              return Object.entries(grouped).map(
                                ([provider, providerModels]) => (
                                  <div key={provider}>
                                    <div className="px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] opacity-25 bg-white/[0.01]">
                                      {provider}
                                    </div>
                                    {providerModels.map((m) => {
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
                                            isActive
                                              ? "bg-white/[0.04]"
                                              : ""
                                          }`}
                                          onClick={() =>
                                            handleSelectModel(m)
                                          }
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
                                    })}
                                  </div>
                                )
                              );
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
          </div>
      </div>

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
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  Star,
  BookMarked,
  History,
  Loader2,
  Compass,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  <webview> JSX intrinsic (Electron-only, not in standard JSX)      */
/* ------------------------------------------------------------------ */

type WebviewElement = HTMLElement & {
  src: string;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  loadURL(url: string): Promise<void>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
          useragent?: string;
          httpreferrer?: string;
        },
        HTMLElement
      >;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RegTab {
  id: string;
  url: string;
  title: string;
}

interface Bookmark {
  id: string;
  url: string;
  title: string;
  addedAt: number;
}

interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

type SidebarView = "bookmarks" | "history" | null;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_TABS = "regweb-tabs-v1";
const STORAGE_BOOKMARKS = "regweb-bookmarks-v1";
const STORAGE_HISTORY = "regweb-history-v1";

const HOME_URL = "https://duckduckgo.com/";
const SEARCH_URL = (q: string) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;

const MAX_TABS = 8;
const MAX_HISTORY = 500;

const PARTITION = "persist:regweb";

// Spoof a current desktop Chrome UA so sites serve their normal desktop
// experience instead of the Electron build's UA (which some search engines
// and login flows treat as an unknown bot).
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isUrlish(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^about:|^file:|^chrome:/i.test(t)) return true;
  // looks like a domain (foo.bar, foo.bar/baz, with optional port)
  return /^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t);
}

function normalizeInput(input: string): string {
  const t = input.trim();
  if (!t) return HOME_URL;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^about:|^file:|^chrome:/i.test(t)) return t;
  if (isUrlish(t)) return `https://${t}`;
  return SEARCH_URL(t);
}

function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/*  localStorage hooks                                                 */
/* ------------------------------------------------------------------ */

function loadTabs(): RegTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_TABS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RegTab[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TABS) : [];
  } catch {
    return [];
  }
}

function loadBookmarks(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_BOOKMARKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Bookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

interface RegWebTabProps {
  // When provided, the side controls (bookmark star, bookmarks/history
  // toggles, clear-data) and any active sidebar panel render into the
  // element with this id instead of inline. Used in Clouds mode to host
  // them in their own left side cloud.
  sidePortalId?: string;
}

export function RegWebTab({ sidePortalId }: RegWebTabProps = {}) {
  /* ---- persisted state ---- */
  const [tabs, setTabs] = useState<RegTab[]>(() => {
    const stored = loadTabs();
    return stored.length > 0
      ? stored
      : [{ id: newId(), url: HOME_URL, title: "New tab" }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const stored = loadTabs();
    return stored[0]?.id ?? "";
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  /* ---- ephemeral UI state ---- */
  const [sidebar, setSidebar] = useState<SidebarView>("history");
  const [urlDraft, setUrlDraft] = useState("");
  const [editingUrl, setEditingUrl] = useState(false);
  const [loadingByTab, setLoadingByTab] = useState<Record<string, boolean>>({});
  const [canBackByTab, setCanBackByTab] = useState<Record<string, boolean>>({});
  const [canForwardByTab, setCanForwardByTab] = useState<
    Record<string, boolean>
  >({});
  /* ---- webview refs ---- */
  const webviewRefs = useRef<Record<string, WebviewElement | null>>({});

  /* ---- persistence effects ---- */
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_TABS, JSON.stringify(tabs));
    } catch {
      /* quota — ignore */
    }
  }, [tabs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_BOOKMARKS,
        JSON.stringify(bookmarks),
      );
    } catch {
      /* quota — ignore */
    }
  }, [bookmarks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_HISTORY,
        JSON.stringify(history.slice(0, MAX_HISTORY)),
      );
    } catch {
      /* quota — ignore */
    }
  }, [history]);

  /* ---- ensure activeTabId always points at a real tab ---- */
  useEffect(() => {
    if (tabs.length === 0) {
      const fresh = { id: newId(), url: HOME_URL, title: "New tab" };
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      return;
    }
    if (!tabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  /* ---- active tab + url bar sync ---- */
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  useEffect(() => {
    if (!editingUrl) {
      setUrlDraft(activeTab?.url ?? "");
    }
  }, [activeTab?.url, editingUrl]);

  /* ---- mutate helpers ---- */
  const updateTab = useCallback(
    (id: string, patch: Partial<RegTab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const addTab = useCallback(
    (url: string = HOME_URL) => {
      if (tabs.length >= MAX_TABS) return;
      const fresh = { id: newId(), url, title: "New tab" };
      setTabs((prev) => [...prev, fresh]);
      setActiveTabId(fresh.id);
    },
    [tabs.length],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fresh = { id: newId(), url: HOME_URL, title: "New tab" };
          setActiveTabId(fresh.id);
          return [fresh];
        }
        if (id === activeTabId) {
          setActiveTabId(next[next.length - 1].id);
        }
        return next;
      });
      delete webviewRefs.current[id];
    },
    [activeTabId],
  );

  /* ---- nav actions ---- */
  const goTo = useCallback(
    (rawUrl: string) => {
      if (!activeTab) return;
      const target = normalizeInput(rawUrl);
      const wv = webviewRefs.current[activeTab.id];
      if (wv) {
        try {
          wv.loadURL(target).catch(() => {
            wv.src = target;
          });
        } catch {
          wv.src = target;
        }
      }
      updateTab(activeTab.id, { url: target });
    },
    [activeTab, updateTab],
  );

  const goBack = useCallback(() => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    if (wv && wv.canGoBack()) wv.goBack();
  }, [activeTab]);

  const goForward = useCallback(() => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    if (wv && wv.canGoForward()) wv.goForward();
  }, [activeTab]);

  const reload = useCallback(() => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    if (wv) {
      const loading = loadingByTab[activeTab.id];
      if (loading) wv.stop();
      else wv.reload();
    }
  }, [activeTab, loadingByTab]);

  const goHome = useCallback(() => goTo(HOME_URL), [goTo]);

  /* ---- bookmarks ---- */
  const isBookmarked = useMemo(() => {
    if (!activeTab) return false;
    return bookmarks.some((b) => b.url === activeTab.url);
  }, [activeTab, bookmarks]);

  const toggleBookmark = useCallback(() => {
    if (!activeTab) return;
    setBookmarks((prev) => {
      const existing = prev.find((b) => b.url === activeTab.url);
      if (existing) return prev.filter((b) => b.id !== existing.id);
      return [
        {
          id: newId(),
          url: activeTab.url,
          title: activeTab.title || prettyHost(activeTab.url),
          addedAt: Date.now(),
        },
        ...prev,
      ];
    });
  }, [activeTab]);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  /* ---- silence benign webview-abort noise in dev ---- */
  // Webviews routinely log "GUEST_VIEW_MANAGER_CALL ... ERR_ABORTED (-3)"
  // when a page redirects mid-load (e.g. DuckDuckGo's funnel-tracking
  // hop on every search). It is harmless, but Next.js's dev overlay
  // catches every console.error as a runtime error. Downgrade just this
  // one pattern to console.warn so the overlay leaves it alone.
  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      const first = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
      if (
        first.includes("GUEST_VIEW_MANAGER_CALL") &&
        first.includes("ERR_ABORTED")
      ) {
        console.warn(...args);
        return;
      }
      original.apply(console, args as Parameters<typeof console.error>);
    };
    return () => {
      console.error = original;
    };
  }, []);

  /* ---- portal host for the side rail (Clouds mode) ---- */
  const [sideHost, setSideHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!sidePortalId) {
      setSideHost(null);
      return;
    }
    const find = () => setSideHost(document.getElementById(sidePortalId));
    find();
    // Slot may not be in the DOM on first render. Retry on the next tick
    // and again on a slight delay so we catch it after CloudsLayout mounts.
    const t1 = window.setTimeout(find, 0);
    const t2 = window.setTimeout(find, 100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sidePortalId]);

  /* ---- webview event wiring ---- */
  // Re-attach listeners whenever tabs change (new webview elements mount).
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const tab of tabs) {
      const wv = webviewRefs.current[tab.id];
      if (!wv) continue;

      const onStartLoading = () => {
        setLoadingByTab((m) => ({ ...m, [tab.id]: true }));
      };
      const onStopLoading = () => {
        setLoadingByTab((m) => ({ ...m, [tab.id]: false }));
        try {
          setCanBackByTab((m) => ({ ...m, [tab.id]: wv.canGoBack() }));
          setCanForwardByTab((m) => ({
            ...m,
            [tab.id]: wv.canGoForward(),
          }));
        } catch {
          /* webview not ready */
        }
      };
      const onNavigate = (e: Event) => {
        const url = (e as Event & { url?: string }).url;
        if (typeof url === "string" && url) {
          updateTab(tab.id, { url });
          setHistory((prev) => {
            const next = [
              { url, title: tab.title || prettyHost(url), visitedAt: Date.now() },
              ...prev.filter((h) => h.url !== url),
            ].slice(0, MAX_HISTORY);
            return next;
          });
        }
      };
      const onTitle = (e: Event) => {
        const title = (e as Event & { title?: string }).title;
        if (typeof title === "string" && title.trim()) {
          updateTab(tab.id, { title: title.trim() });
        }
      };
      const onFailLoad = (e: Event) => {
        const ev = e as Event & { errorCode?: number; errorDescription?: string };
        // -3 is ABORTED (user navigated away mid-load) — ignore.
        if (ev.errorCode === -3) return;
        setLoadingByTab((m) => ({ ...m, [tab.id]: false }));
      };
      const onNewWindow = (e: Event) => {
        const ev = e as Event & { url?: string; disposition?: string };
        const target = typeof ev.url === "string" ? ev.url : "";
        if (!target) return;
        // Prevent the default popup (which would silently fail in a webview)
        // and route everything into our own tab strip instead.
        e.preventDefault?.();
        setTabs((prev) => {
          if (prev.length >= MAX_TABS) {
            // Tab limit reached — load into the current tab as a fallback.
            try {
              wv.loadURL(target);
            } catch {
              wv.src = target;
            }
            return prev;
          }
          const fresh = { id: newId(), url: target, title: "New tab" };
          setActiveTabId(fresh.id);
          return [...prev, fresh];
        });
      };

      wv.addEventListener("did-start-loading", onStartLoading);
      wv.addEventListener("did-stop-loading", onStopLoading);
      wv.addEventListener("did-navigate", onNavigate);
      wv.addEventListener("did-navigate-in-page", onNavigate);
      wv.addEventListener("page-title-updated", onTitle);
      wv.addEventListener("did-fail-load", onFailLoad);
      wv.addEventListener("new-window", onNewWindow);

      cleanups.push(() => {
        wv.removeEventListener("did-start-loading", onStartLoading);
        wv.removeEventListener("did-stop-loading", onStopLoading);
        wv.removeEventListener("did-navigate", onNavigate);
        wv.removeEventListener("did-navigate-in-page", onNavigate);
        wv.removeEventListener("page-title-updated", onTitle);
        wv.removeEventListener("did-fail-load", onFailLoad);
        wv.removeEventListener("new-window", onNewWindow);
      });
    }
    return () => {
      for (const fn of cleanups) fn();
    };
  }, [tabs, updateTab]);

  /* ---- url bar submit ---- */
  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      goTo(urlDraft);
      setEditingUrl(false);
    },
    [goTo, urlDraft],
  );

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  const activeLoading = activeTab ? !!loadingByTab[activeTab.id] : false;
  const activeCanBack = activeTab ? !!canBackByTab[activeTab.id] : false;
  const activeCanForward = activeTab
    ? !!canForwardByTab[activeTab.id]
    : false;

  // The star (bookmark current page) lives in the address bar in both
  // modes — it's a per-page action and belongs next to the URL.
  const starButtonNode = (
    <button
      onClick={toggleBookmark}
      disabled={!activeTab}
      className="p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)]"
      style={isBookmarked ? { color: "var(--ch-accent)" } : undefined}
      title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
    >
      <Star
        className="w-3.5 h-3.5"
        fill={isBookmarked ? "currentColor" : "none"}
      />
    </button>
  );

  // The three workspace-level controls (bookmarks / history / clear data)
  // — rendered as compact icons in the workbench address row, or as a
  // larger sectioned vertical stack inside the clouds left side cloud.
  const inlineWorkbenchButtonsNode = (
    <>
      <button
        onClick={() =>
          setSidebar((v) => (v === "bookmarks" ? null : "bookmarks"))
        }
        className={`p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)] ${
          sidebar === "bookmarks" ? "bg-[var(--ch-bg-elevated)]" : ""
        }`}
        title="Bookmarks"
      >
        <BookMarked className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() =>
          setSidebar((v) => (v === "history" ? null : "history"))
        }
        className={`p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)] ${
          sidebar === "history" ? "bg-[var(--ch-bg-elevated)]" : ""
        }`}
        title="History"
      >
        <History className="w-3.5 h-3.5" />
      </button>
    </>
  );

  // The bookmarks / history panel body — used both in the workbench
  // right-side aside and inside the clouds side-rail.
  const panelHeaderNode = sidebar ? (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ch-border-faint)]">
      <span className="text-[10px] uppercase tracking-[0.2em] opacity-60">
        {sidebar === "bookmarks" ? "Bookmarks" : "History"}
      </span>
      <div className="flex items-center gap-1">
        {sidebar === "history" && history.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] opacity-50 hover:opacity-100"
            title="Clear history list"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => setSidebar(null)}
          className="opacity-50 hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  ) : null;

  const panelBodyNode =
    sidebar === "bookmarks" ? (
      bookmarks.length === 0 ? (
        <div className="p-4 text-[10px] uppercase tracking-widest text-[var(--ch-text-faint)] text-center opacity-60">
          No bookmarks yet
        </div>
      ) : (
        bookmarks.map((b) => (
          <div
            key={b.id}
            className="group flex items-start gap-2 px-3 py-2 border-b border-[var(--ch-border-faint)] hover:bg-[var(--ch-bg-elevated)] cursor-pointer"
            onClick={() => goTo(b.url)}
            role="button"
            tabIndex={0}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] truncate">{b.title}</div>
              <div className="text-[10px] opacity-50 truncate">
                {prettyHost(b.url)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeBookmark(b.id);
              }}
              className="opacity-0 group-hover:opacity-60 hover:opacity-100"
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))
      )
    ) : sidebar === "history" ? (
      history.length === 0 ? (
        <div className="p-4 text-[10px] uppercase tracking-widest text-[var(--ch-text-faint)] text-center opacity-60">
          No history yet
        </div>
      ) : (
        history.map((h, i) => (
          <div
            key={`${h.url}-${i}`}
            className="flex items-start gap-2 px-3 py-2 border-b border-[var(--ch-border-faint)] hover:bg-[var(--ch-bg-elevated)] cursor-pointer"
            onClick={() => goTo(h.url)}
            role="button"
            tabIndex={0}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] truncate">
                {h.title || prettyHost(h.url)}
              </div>
              <div className="text-[10px] opacity-50 truncate">
                {prettyHost(h.url)}
              </div>
            </div>
          </div>
        ))
      )
    ) : null;

  // Side rail layout used when portaled into the clouds left side cloud:
  // three sectioned buttons in a horizontal row across the top, with the
  // active panel (if any) expanding into the remaining cloud height below.
  // Shorter horizontal layout: icon next to label, single row, compact
  // vertical padding so the button strip is roughly half the height of
  // the previous icon-over-label sections.
  const sectionButtonClass =
    "flex-1 flex flex-row items-center justify-center gap-2 px-2 py-1.5 text-[11px] hover:bg-[var(--ch-bg-elevated)] transition-colors";
  const sectionLabelClass =
    "uppercase tracking-[0.15em] text-[9px] opacity-80";

  const sideRailNode = (
    <div className="h-full min-h-0 flex flex-col bg-[var(--ch-bg-base)] border border-[var(--ch-border)] rounded-sm overflow-hidden">
      <div className="flex border-b border-[var(--ch-border-faint)]">
        <button
          onClick={() =>
            setSidebar((v) => (v === "bookmarks" ? null : "bookmarks"))
          }
          className={`${sectionButtonClass} ${
            sidebar === "bookmarks" ? "bg-[var(--ch-bg-elevated)]" : ""
          }`}
        >
          <BookMarked className="w-4 h-4 opacity-80" />
          <span className={sectionLabelClass}>Bookmarks</span>
        </button>
        <button
          onClick={() =>
            setSidebar((v) => (v === "history" ? null : "history"))
          }
          className={`${sectionButtonClass} border-l border-[var(--ch-border-faint)] ${
            sidebar === "history" ? "bg-[var(--ch-bg-elevated)]" : ""
          }`}
        >
          <History className="w-4 h-4 opacity-80" />
          <span className={sectionLabelClass}>History</span>
        </button>
      </div>
      {sidebar && (
        <>
          {panelHeaderNode}
          <div className="flex-1 min-h-0 overflow-y-auto">{panelBodyNode}</div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex h-full min-w-[620px] gap-2 overflow-hidden">
      <div className="flex-1 flex flex-col h-full min-w-[360px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden">
        {/* Tab strip */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1 border-b border-[var(--ch-border-faint)] overflow-x-auto">
          {tabs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                className={`group flex items-center gap-1.5 max-w-[180px] min-w-[80px] px-2 py-1 text-[11px] rounded-sm border ${
                  active
                    ? "border-[var(--ch-border)] bg-[var(--ch-bg-elevated)]"
                    : "border-transparent hover:bg-[var(--ch-bg-elevated)] opacity-70"
                }`}
                title={t.title || t.url}
              >
                {loadingByTab[t.id] ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0 opacity-60" />
                ) : (
                  <Compass className="w-3 h-3 shrink-0 opacity-50" />
                )}
                <span className="truncate flex-1 text-left">
                  {t.title || prettyHost(t.url) || "New tab"}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      closeTab(t.id);
                    }
                  }}
                  className="opacity-40 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            );
          })}
          <button
            onClick={() => addTab()}
            disabled={tabs.length >= MAX_TABS}
            className="px-1.5 py-1 opacity-60 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed"
            title={
              tabs.length >= MAX_TABS
                ? `Tab limit reached (${MAX_TABS})`
                : "New tab"
            }
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address row */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--ch-border-faint)]">
          <button
            onClick={goBack}
            disabled={!activeCanBack}
            className="p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)] disabled:opacity-20 disabled:cursor-not-allowed"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={goForward}
            disabled={!activeCanForward}
            className="p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)] disabled:opacity-20 disabled:cursor-not-allowed"
            title="Forward"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={reload}
            className="p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)]"
            title={activeLoading ? "Stop" : "Reload"}
          >
            {activeLoading ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <RotateCw className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={goHome}
            className="p-1 rounded-sm hover:bg-[var(--ch-bg-elevated)]"
            title="Home (DuckDuckGo)"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          {starButtonNode}

          <form onSubmit={handleUrlSubmit} className="flex-1">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => {
                setEditingUrl(true);
                setUrlDraft(e.target.value);
              }}
              onFocus={(e) => {
                setEditingUrl(true);
                e.currentTarget.select();
              }}
              onBlur={() => setEditingUrl(false)}
              placeholder={"Search DuckDuckGo or enter URL"}
              className="w-full text-[11px] px-2.5 py-1.5 bg-[var(--ch-bg-inset)] border border-[var(--ch-border-faint)] rounded-sm focus:outline-none focus:border-[var(--ch-border)] caret-white"
              spellCheck={false}
              autoComplete="off"
            />
          </form>

          {!sidePortalId && inlineWorkbenchButtonsNode}
        </div>

        {/* Webview stack — all tabs mounted, only active visible */}
        <div className="flex-1 relative bg-[var(--ch-bg-page)]">
          {tabs.map((t) => (
            <webview
              key={t.id}
              ref={(el) => {
                webviewRefs.current[t.id] = el as WebviewElement | null;
              }}
              src={t.url}
              partition={PARTITION}
              useragent={DESKTOP_UA}
              style={{
                position: "absolute",
                inset: 0,
                display: t.id === activeTabId ? "flex" : "none",
                width: "100%",
                height: "100%",
              }}
            />
          ))}
        </div>
      </div>

      {/* Workbench-mode side panel — only when not portaled to a cloud */}
      {!sidePortalId && sidebar && (
        <aside className="w-[260px] h-full border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden flex flex-col">
          {panelHeaderNode}
          <div className="flex-1 overflow-y-auto">{panelBodyNode}</div>
        </aside>
      )}

      {/* Clouds-mode side rail — portaled into the left side cloud */}
      {sideHost && createPortal(sideRailNode, sideHost)}
    </div>
  );
}

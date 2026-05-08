"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Archive,
  Bot,
  ChevronDown,
  Code2,
  FolderOpen,
  History,
  Loader2,
  MessageSquarePlus,
  Search,
  Send,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/lib/markdown";
import { usePiChat, type ChatMessage, type PiModel } from "@/hooks/usePiChat";

type CodingAgentTheme = "workbench" | "terminal";
type EffortLevel = "minimal" | "low" | "medium" | "high" | "xhigh";
type SafetyLevel = "guarded" | "balanced" | "autonomous";

type CodingAgentPanelProps = {
  theme: CodingAgentTheme;
  infoPortalId?: string;
  workspacesPortalId?: string;
};

type ComposerDropdownId = "workspace" | "model" | "effort" | "safety";

type ComposerDropdownOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

export type WorkspaceOption = {
  id: string;
  name: string;
  path: string;
};

type DirectoryInputElement = HTMLInputElement & {
  directory?: boolean;
  webkitdirectory?: boolean;
};

type CodingAgentChatRecord = {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const NO_WORKSPACE: WorkspaceOption = {
  id: "no-workspace",
  name: "No workspace",
  path: "",
};

const WORKSPACES: WorkspaceOption[] = [
  NO_WORKSPACE,
  {
    id: "central-hub-main",
    name: "Central-Hub-main",
    path: "C:\\Users\\Henry D\\Documents\\Central-Hub-main",
  },
];

const LAST_WORKSPACE_KEY = "centralhub-coding-agent-last-workspace";
const CUSTOM_WORKSPACES_KEY = "centralhub-coding-agent-custom-workspaces";
const ARCHIVED_WORKSPACES_KEY = "centralhub-coding-agent-archived-workspaces";
const WORKSPACE_ORDER_KEY = "centralhub-coding-agent-workspace-order";
const CHAT_RECORDS_KEY = "centralhub-coding-agent-chats";
const MAX_CHAT_RECORDS = 18;
const MAX_CODING_AGENT_TABS = 8;
export const CODING_WORKSPACES_UPDATED_EVENT =
  "centralhub:coding-workspaces-updated";

type CodingAgentTab = {
  id: string;
  title: string;
  customTitle?: string;
};

type CodingAgentTabState = {
  tabs: CodingAgentTab[];
  activeId: string;
};

type CodingAgentTabPanelProps = CodingAgentPanelProps & {
  agentTabs: CodingAgentTab[];
  activeAgentTabId: string;
  pendingAgentTabCloseId: string | null;
  canAddAgentTab: boolean;
  onAgentTabSelect: (tabId: string) => void;
  onAgentTabAdd: () => void;
  onAgentTabCloseRequest: (tabId: string) => void;
  onAgentTabCloseConfirm: () => void;
  onAgentTabCloseCancel: () => void;
  onAgentTabTitleChange: (tabId: string, title: string) => void;
};

let codingAgentTabSeq = 1;

function nextCodingAgentTabId() {
  return `coding-tab-${codingAgentTabSeq++}`;
}

function makeCodingAgentTab(title = "Coding Workspace"): CodingAgentTab {
  return {
    id: nextCodingAgentTabId(),
    title,
  };
}

function renumberCodingAgentTabs(tabs: CodingAgentTab[]) {
  return tabs.map((tab, index) => ({
    ...tab,
    title:
      tab.customTitle ??
      (index === 0 ? "Coding Workspace" : `Coding Workspace ${index + 1}`),
  }));
}

function createCodingAgentTabState(): CodingAgentTabState {
  const tab = makeCodingAgentTab();
  return {
    tabs: [tab],
    activeId: tab.id,
  };
}

const EFFORTS: { id: EffortLevel; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
];

const SAFETY_LEVELS: {
  id: SafetyLevel;
  label: string;
  prompt: string;
}[] = [
  {
    id: "guarded",
    label: "Guarded",
    prompt:
      "Prefer read-only inspection first. Ask before risky edits, dependency changes, destructive commands, or broad refactors.",
  },
  {
    id: "balanced",
    label: "Balanced",
    prompt:
      "Make focused edits when the task is clear. Verify before finishing and avoid unrelated changes.",
  },
  {
    id: "autonomous",
    label: "Autonomous",
    prompt:
      "Proceed through implementation and verification for the selected workspace, while preserving project guardrails.",
  },
];

const THEME_STYLES: Record<CodingAgentTheme, CSSProperties> = {
  workbench: {
    "--agent-accent": "#4DA3FF",
    "--agent-accent-soft": "rgba(77, 163, 255, 0.12)",
    "--agent-border": "rgba(77, 163, 255, 0.38)",
  } as CSSProperties,
  terminal: {
    "--agent-accent": "#49D17C",
    "--agent-accent-soft": "rgba(73, 209, 124, 0.12)",
    "--agent-border": "rgba(73, 209, 124, 0.38)",
  } as CSSProperties,
};

function modelKey(model: { provider: string; id: string }) {
  return `${model.provider}:${model.id}`;
}

function splitModelKey(value: string) {
  const [provider, ...idParts] = value.split(":");
  return { provider, id: idParts.join(":") };
}

function formatTokens(total?: number) {
  if (!total) return "0";
  return new Intl.NumberFormat("en-US").format(total);
}

function renderModelName(model: PiModel) {
  return model.name;
}

function ComposerDropdown({
  id,
  label,
  valueLabel,
  options,
  openId,
  disabled,
  searchable,
  searchPlaceholder,
  onOpenChange,
  onSelect,
}: {
  id: ComposerDropdownId;
  label: string;
  valueLabel: string;
  options: ComposerDropdownOption[];
  openId: ComposerDropdownId | null;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onOpenChange: (id: ComposerDropdownId | null) => void;
  onSelect: (value: string) => void | Promise<void>;
}) {
  const isOpen = openId === id;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((option) =>
      (option.searchText ?? option.label).toLowerCase().includes(q)
    );
  }, [options, query, searchable]);
  const handleOpenChange = (nextId: ComposerDropdownId | null) => {
    if (nextId !== id) setQuery("");
    onOpenChange(nextId);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setQuery("");
      onOpenChange(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={dropdownRef} className="relative flex flex-col gap-1 min-w-0">
      <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--ch-text-faint)]">
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => handleOpenChange(isOpen ? null : id)}
        className="clouds-coding-dropdown-button h-[30px] min-w-0 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm px-2 text-[11px] outline-none focus:border-[var(--agent-border)] disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-1.5"
        title={valueLabel}
      >
        <span className="truncate">{valueLabel}</span>
        <ChevronDown
          className={`w-3 h-3 shrink-0 opacity-55 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <>
          <div className="clouds-coding-dropdown-panel absolute left-0 top-full z-20 mt-1.5 min-w-full w-max max-w-[280px] max-h-[260px] overflow-hidden border border-[var(--agent-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl p-1 flex flex-col">
            {searchable && (
              <div className="relative mb-1 shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-25" />
                <input
                  type="text"
                  className="w-full bg-[var(--ch-bg-elevated)] border border-[var(--ch-border-subtle)] text-[11px] pl-6 pr-2 py-1.5 rounded-sm outline-none focus:border-[var(--agent-border)]"
                  placeholder={searchPlaceholder ?? "Search..."}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  autoFocus
                />
              </div>
            )}
            <div className="overflow-y-auto min-h-0">
              {visibleOptions.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[11px] text-[var(--ch-text-faint)] italic">
                  No models found.
                </div>
              ) : (
                visibleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      handleOpenChange(null);
                      void onSelect(option.value);
                    }}
                    className="w-full max-w-[260px] text-left px-2.5 py-1.5 rounded-sm text-[11px] leading-snug text-[var(--ch-text)] hover:bg-[var(--agent-accent-soft)] disabled:opacity-45 disabled:cursor-not-allowed"
                    title={option.label}
                  >
                    <span className="block truncate">{option.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function customWorkspaceId(path: string) {
  return `folder:${path.toLowerCase()}`;
}

function workspaceNameFromPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || path || "Workspace";
}

function isWorkspaceOption(item: unknown): item is WorkspaceOption {
  return (
    typeof (item as WorkspaceOption)?.id === "string" &&
    typeof (item as WorkspaceOption)?.name === "string" &&
    typeof (item as WorkspaceOption)?.path === "string" &&
    (item as WorkspaceOption).path.trim().length > 0
  );
}

export function notifyCodingWorkspacesUpdated() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(CODING_WORKSPACES_UPDATED_EVENT));
  } catch {}
}

function prepareFolderInput(input: DirectoryInputElement) {
  input.directory = true;
  input.webkitdirectory = true;
  input.setAttribute("directory", "");
  input.setAttribute("webkitdirectory", "");
}

function getFilePath(file: File & { path?: string }) {
  if (file.path) return file.path;

  try {
    const electron = (0, eval)("require")("electron") as {
      webUtils?: {
        getPathForFile?: (file: File) => string;
      };
    };
    return electron.webUtils?.getPathForFile?.(file) ?? "";
  } catch {}

  return "";
}

export function loadCustomWorkspaces(): WorkspaceOption[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CUSTOM_WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkspaceOption);
  } catch {}
  return [];
}

function saveCustomWorkspaces(workspaces: WorkspaceOption[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CUSTOM_WORKSPACES_KEY, JSON.stringify(workspaces));
  } catch {}
}

export function loadArchivedWorkspaces(): WorkspaceOption[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(ARCHIVED_WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkspaceOption);
  } catch {}
  return [];
}

function saveArchivedWorkspaces(workspaces: WorkspaceOption[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ARCHIVED_WORKSPACES_KEY, JSON.stringify(workspaces));
  } catch {}
}

function loadWorkspaceOrder(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(WORKSPACE_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {}
  return [];
}

function saveWorkspaceOrder(workspaceIds: string[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(WORKSPACE_ORDER_KEY, JSON.stringify(workspaceIds));
  } catch {}
}

function loadLastWorkspaceId() {
  try {
    if (typeof localStorage === "undefined") return NO_WORKSPACE.id;
    const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
    const knownWorkspaces = [...WORKSPACES, ...loadCustomWorkspaces()];
    if (stored && knownWorkspaces.some((workspace) => workspace.id === stored)) {
      return stored;
    }
  } catch {}
  return NO_WORKSPACE.id;
}

function saveLastWorkspaceId(workspaceId: string) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  } catch {}
}

function saveChatRecords(records: CodingAgentChatRecord[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      CHAT_RECORDS_KEY,
      JSON.stringify(records.slice(0, MAX_CHAT_RECORDS))
    );
  } catch {}
}

export function restoreArchivedWorkspace(workspace: WorkspaceOption) {
  const customWorkspaces = loadCustomWorkspaces();
  const archivedWorkspaces = loadArchivedWorkspaces();
  const workspaceOrder = loadWorkspaceOrder();
  const nextCustomWorkspaces = [
    workspace,
    ...customWorkspaces.filter((item) => item.id !== workspace.id),
  ].slice(0, 12);
  const nextArchivedWorkspaces = archivedWorkspaces.filter(
    (item) => item.id !== workspace.id
  );
  const nextWorkspaceOrder = workspaceOrder.includes(workspace.id)
    ? workspaceOrder
    : [...workspaceOrder, workspace.id];

  saveCustomWorkspaces(nextCustomWorkspaces);
  saveArchivedWorkspaces(nextArchivedWorkspaces);
  saveWorkspaceOrder(nextWorkspaceOrder);
  notifyCodingWorkspacesUpdated();
}

export function deleteArchivedWorkspace(workspaceId: string) {
  const archivedWorkspaces = loadArchivedWorkspaces();
  const workspaceOrder = loadWorkspaceOrder();
  const chatRecords = loadChatRecords();

  saveArchivedWorkspaces(
    archivedWorkspaces.filter((workspace) => workspace.id !== workspaceId)
  );
  saveWorkspaceOrder(workspaceOrder.filter((id) => id !== workspaceId));
  saveChatRecords(
    chatRecords.filter((record) => record.workspaceId !== workspaceId)
  );

  const lastWorkspaceId =
    typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(LAST_WORKSPACE_KEY);
  if (lastWorkspaceId === workspaceId) {
    saveLastWorkspaceId(NO_WORKSPACE.id);
  }

  notifyCodingWorkspacesUpdated();
}

function loadChatRecords(): CodingAgentChatRecord[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CHAT_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (
          item
        ): item is Omit<CodingAgentChatRecord, "messages"> & {
          messages?: ChatMessage[];
        } =>
          typeof item?.id === "string" &&
          typeof item?.title === "string" &&
          typeof item?.workspaceId === "string" &&
          typeof item?.workspaceName === "string" &&
          typeof item?.workspacePath === "string" &&
          typeof item?.createdAt === "number" &&
          typeof item?.updatedAt === "number"
      )
      .map((item) => ({
        ...item,
        messages: Array.isArray(item.messages)
          ? sanitizeStoredMessages(item.messages)
          : [],
      }))
      .slice(0, MAX_CHAT_RECORDS);
  } catch {}
  return [];
}

function sanitizeStoredMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (message): message is ChatMessage =>
        typeof message?.id === "string" &&
        (message.role === "user" ||
          message.role === "assistant" ||
          message.role === "tool") &&
        typeof message.content === "string" &&
        typeof message.timestamp === "number"
    )
    .map((message) => ({ ...message, isStreaming: false }));
}

function formatChatTime(value: number) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(value);
  } catch {
    return "";
  }
}

function buildResumeContext(messages: ChatMessage[]) {
  const transcript = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) =>
      `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n\n");

  if (!transcript.trim()) return null;
  return `--- Prior coding-agent conversation (resume context) ---\n${transcript}\n--- End prior coding-agent conversation ---\n\nContinue from where we left off. The user's next message follows.`;
}

function CodingAgentTabPanel({
  theme,
  infoPortalId,
  workspacesPortalId,
  agentTabs,
  activeAgentTabId,
  pendingAgentTabCloseId,
  canAddAgentTab,
  onAgentTabSelect,
  onAgentTabAdd,
  onAgentTabCloseRequest,
  onAgentTabCloseConfirm,
  onAgentTabCloseCancel,
  onAgentTabTitleChange,
}: CodingAgentTabPanelProps) {
  const chat = usePiChat();
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const resumeContextRef = useRef<string | null>(null);
  const folderInputRef = useRef<DirectoryInputElement>(null);
  // Track which coding-agent chat records have already had an LLM-generated
  // title applied this session, so we don't re-fire pi:generate-title every
  // time the user sends another message in the same chat.
  const titledChatIdsRef = useRef<Set<string>>(new Set());
  const wasStreamingForTitleRef = useRef<boolean>(false);
  const [draft, setDraft] = useState("");
  const [customWorkspaces, setCustomWorkspaces] = useState(loadCustomWorkspaces);
  const [archivedWorkspaces, setArchivedWorkspaces] =
    useState(loadArchivedWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(loadLastWorkspaceId);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [chatRecords, setChatRecords] = useState(loadChatRecords);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [workspaceOrder, setWorkspaceOrder] = useState(loadWorkspaceOrder);
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(
    null
  );
  const [pendingNewChatGate, setPendingNewChatGate] = useState<string | null>(
    null
  );
  const [infoPortalTarget, setInfoPortalTarget] = useState<HTMLElement | null>(
    null
  );
  const [workspacesPortalTarget, setWorkspacesPortalTarget] =
    useState<HTMLElement | null>(null);
  const [openComposerMenu, setOpenComposerMenu] =
    useState<ComposerDropdownId | null>(null);
  const [effort, setEffort] = useState<EffortLevel>("medium");
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>("balanced");
  const [composerDocked, setComposerDocked] = useState(false);

  const archivedWorkspaceIds = useMemo(
    () => new Set(archivedWorkspaces.map((workspace) => workspace.id)),
    [archivedWorkspaces]
  );
  const workspaceOptions = useMemo(
    () =>
      [...WORKSPACES, ...customWorkspaces].filter(
        (workspace) => !archivedWorkspaceIds.has(workspace.id)
      ),
    [archivedWorkspaceIds, customWorkspaces]
  );
  const selectedWorkspace =
    workspaceOptions.find((workspace) => workspace.id === workspaceId) ??
    NO_WORKSPACE;
  const selectedSafety =
    SAFETY_LEVELS.find((item) => item.id === safetyLevel) ?? SAFETY_LEVELS[1];

  const thinkingModels = useMemo(
    () => chat.filteredModels.filter((model) => model.reasoning),
    [chat.filteredModels]
  );
  const workspaceDropdownOptions = useMemo(
    () =>
      workspaceOptions.map((workspace) => ({
        value: workspace.id,
        label: workspace.name,
      })),
    [workspaceOptions]
  );
  const modelDropdownOptions = useMemo<ComposerDropdownOption[]>(
    () =>
      thinkingModels.length === 0
        ? [{ value: "", label: "No thinking models", disabled: true }]
        : thinkingModels.map((model) => ({
            value: modelKey(model),
            label: renderModelName(model),
            searchText: `${model.name} ${model.id} ${model.provider}`,
          })),
    [thinkingModels]
  );
  const effortDropdownOptions = useMemo(
    () => EFFORTS.map((item) => ({ value: item.id, label: item.label })),
    []
  );
  const safetyDropdownOptions = useMemo(
    () => SAFETY_LEVELS.map((item) => ({ value: item.id, label: item.label })),
    []
  );

  const selectedThinkingModel = useMemo(() => {
    if (!chat.currentModel) return null;
    return (
      thinkingModels.find(
        (model) =>
          model.provider === chat.currentModel?.provider &&
          model.id === chat.currentModel?.id
      ) ?? null
    );
  }, [chat.currentModel, thinkingModels]);

  const needsThinkingModel =
    chat.isReady && thinkingModels.length > 0 && !selectedThinkingModel;
  const canSend =
    chat.isReady &&
    !chat.isStreaming &&
    !needsThinkingModel &&
    draft.trim().length > 0;

  const projectGroups = useMemo(() => {
    const groups = new Map<
      string,
      WorkspaceOption & { chats: CodingAgentChatRecord[] }
    >();

    for (const workspace of workspaceOptions) {
      groups.set(workspace.id, { ...workspace, chats: [] });
    }

    for (const record of chatRecords) {
      if (archivedWorkspaceIds.has(record.workspaceId)) continue;
      const existing =
        groups.get(record.workspaceId) ??
        ({
          id: record.workspaceId,
          name: record.workspaceName,
          path: record.workspacePath,
          chats: [],
        } satisfies WorkspaceOption & {
          chats: CodingAgentChatRecord[];
        });
      existing.chats.push(record);
      groups.set(record.workspaceId, existing);
    }

    const fallbackOrder = Array.from(groups.keys());
    const order = workspaceOrder.length > 0 ? workspaceOrder : fallbackOrder;
    return Array.from(groups.values()).sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return fallbackOrder.indexOf(a.id) - fallbackOrder.indexOf(b.id);
    });
  }, [archivedWorkspaceIds, chatRecords, workspaceOptions, workspaceOrder]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: chat.isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [chat.messages, chat.isStreaming]);

  useEffect(() => {
    if (folderInputRef.current) {
      prepareFolderInput(folderInputRef.current);
    }
  }, []);

  useEffect(() => {
    if (!infoPortalId) return;
    const syncTarget = () =>
      setInfoPortalTarget(document.getElementById(infoPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [infoPortalId]);

  useEffect(() => {
    if (!workspacesPortalId) return;
    const syncTarget = () =>
      setWorkspacesPortalTarget(document.getElementById(workspacesPortalId));
    const frame = window.requestAnimationFrame(syncTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [workspacesPortalId]);

  useEffect(() => {
    const refreshWorkspaces = () => {
      setCustomWorkspaces(loadCustomWorkspaces());
      setArchivedWorkspaces(loadArchivedWorkspaces());
      setWorkspaceOrder(loadWorkspaceOrder());
      setChatRecords(loadChatRecords());
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === CUSTOM_WORKSPACES_KEY ||
        event.key === ARCHIVED_WORKSPACES_KEY ||
        event.key === WORKSPACE_ORDER_KEY ||
        event.key === CHAT_RECORDS_KEY
      ) {
        refreshWorkspaces();
      }
    };

    window.addEventListener(CODING_WORKSPACES_UPDATED_EVENT, refreshWorkspaces);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(
        CODING_WORKSPACES_UPDATED_EVENT,
        refreshWorkspaces
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const activeId = activeChatIdRef.current;
    if (!activeId || chat.isStreaming || chat.messages.length === 0) return;
    if (!chat.messages.some((message) => message.role === "user")) return;

    const messages = sanitizeStoredMessages(chat.messages);
    const now = Date.now();
    setChatRecords((prev) => {
      const next = prev.map((record) =>
        record.id === activeId
          ? {
              ...record,
              messages,
              updatedAt: now,
            }
          : record
      );
      saveChatRecords(next);
      return next;
    });
  }, [chat.messages, chat.isStreaming]);

  /* Auto-generate a short tab title after the first user → assistant
   * exchange, mirroring ChatPanel's pi:generate-title flow. The default
   * title from recordCodingTurn() is a 54-char truncation of the user's
   * message; this upgrades it once per chat record. Costs ~20 output
   * tokens on qwen3-8b — cheap enough to do automatically. */
  useEffect(() => {
    const wasStreaming = wasStreamingForTitleRef.current;
    wasStreamingForTitleRef.current = chat.isStreaming;

    const activeId = activeChatIdRef.current;
    if (!activeId) return;
    if (!wasStreaming || chat.isStreaming) return;
    if (titledChatIdsRef.current.has(activeId)) return;

    const userMessage = chat.messages.find((m) => m.role === "user");
    const assistantMessage = chat.messages.find(
      (m) => m.role === "assistant" && !m.isStreaming
    );
    if (!userMessage || !assistantMessage) return;

    titledChatIdsRef.current.add(activeId);

    let ipc: { invoke: (channel: string, args: unknown) => Promise<unknown> } | null = null;
    try {
      ipc = (0, eval)("require")("electron").ipcRenderer;
    } catch {}
    ipc
      ?.invoke("pi:generate-title", {
        userMessage: userMessage.content,
        assistantMessage: assistantMessage.content,
      })
      .then((result) => {
        if (
          typeof result !== "object" ||
          result === null ||
          !("success" in result) ||
          !("title" in result) ||
          (result as { success?: unknown }).success !== true ||
          typeof (result as { title?: unknown }).title !== "string"
        ) {
          return;
        }
        const title = (result as { title: string }).title.trim();
        if (!title) return;

        // Update the active tab title (visible in the tab strip).
        onAgentTabTitleChange(activeAgentTabId, title);
        // Update the chat record so future loads / the chat list use it too.
        setChatRecords((prev) => {
          const next = prev.map((record) =>
            record.id === activeId ? { ...record, title } : record
          );
          saveChatRecords(next);
          return next;
        });
      })
      .catch(() => {
        // Non-fatal: keep the truncation-based default title.
        titledChatIdsRef.current.delete(activeId);
      });
  }, [chat.isStreaming, chat.messages, activeAgentTabId, onAgentTabTitleChange]);

  const handleModelChange = async (value: string) => {
    if (!value) return;
    const { provider, id } = splitModelKey(value);
    if (!provider || !id) return;
    try {
      await chat.setModel(provider, id);
    } catch (e) {
      console.warn("Failed to set Coding Agent model:", e);
    }
  };

  const handleWorkspaceChange = (value: string) => {
    setWorkspaceId(value);
    setWorkspaceError(null);
    setPendingNewChatGate(null);
    saveLastWorkspaceId(value);
  };

  const requestNewChat = (gateId: string) => {
    setPendingNewChatGate(gateId);
  };

  const cancelNewChat = () => {
    setPendingNewChatGate(null);
  };

  const confirmNewChat = async (nextWorkspaceId?: string) => {
    const targetWorkspaceId = nextWorkspaceId ?? workspaceId;
    setPendingNewChatGate(null);
    if (targetWorkspaceId !== workspaceId) {
      handleWorkspaceChange(targetWorkspaceId);
    }
    activeChatIdRef.current = null;
    resumeContextRef.current = null;
    setActiveChatId(null);
    setDraft("");
    setComposerDocked(false);
    const restarted = await chat.restart();
    if (!restarted) chat.clear();
  };

  const handleWorkspaceDrop = (targetWorkspaceId: string) => {
    if (!draggedWorkspaceId || draggedWorkspaceId === targetWorkspaceId) {
      setDraggedWorkspaceId(null);
      return;
    }

    const currentIds = projectGroups.map((project) => project.id);
    setWorkspaceOrder((prev) => {
      const normalized = [
        ...prev.filter((id) => currentIds.includes(id)),
        ...currentIds.filter((id) => !prev.includes(id)),
      ];
      const fromIndex = normalized.indexOf(draggedWorkspaceId);
      const toIndex = normalized.indexOf(targetWorkspaceId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...normalized];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveWorkspaceOrder(next);
      return next;
    });
    setDraggedWorkspaceId(null);
  };

  const handleArchiveWorkspace = (workspace: WorkspaceOption) => {
    const nextCustomWorkspaces = customWorkspaces.filter(
      (item) => item.id !== workspace.id
    );
    const nextArchivedWorkspaces = [
      workspace,
      ...archivedWorkspaces.filter((item) => item.id !== workspace.id),
    ].slice(0, 24);
    const nextWorkspaceOrder = workspaceOrder.filter(
      (id) => id !== workspace.id
    );

    setPendingNewChatGate(null);
    saveCustomWorkspaces(nextCustomWorkspaces);
    saveArchivedWorkspaces(nextArchivedWorkspaces);
    saveWorkspaceOrder(nextWorkspaceOrder);
    setCustomWorkspaces(nextCustomWorkspaces);
    setArchivedWorkspaces(nextArchivedWorkspaces);
    setWorkspaceOrder(nextWorkspaceOrder);
    if (workspaceId === workspace.id) {
      setWorkspaceId(NO_WORKSPACE.id);
      saveLastWorkspaceId(NO_WORKSPACE.id);
    }
    notifyCodingWorkspacesUpdated();
  };

  const handleChooseWorkspaceFolder = () => {
    const input = folderInputRef.current;
    if (!input) return;
    input.value = "";
    prepareFolderInput(input);
    input.click();
  };

  const handleFolderInputChange = (files: FileList | null) => {
    const first = files?.[0] as
      | (File & { path?: string; webkitRelativePath?: string })
      | undefined;
    if (!first) {
      setWorkspaceError("Choose a folder that contains at least one file.");
      return;
    }

    const filePath = getFilePath(first);
    const relativePath = first.webkitRelativePath;
    if (!filePath || !relativePath) {
      setWorkspaceError("CentralHub could not read that folder path.");
      return;
    }

    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const normalizedRelativePath = relativePath.replace(/\\/g, "/");
    const rootFolderName = normalizedRelativePath.split("/")[0];
    const basePath = normalizedFilePath.endsWith(normalizedRelativePath)
      ? normalizedFilePath.slice(0, -normalizedRelativePath.length)
      : "";
    const folderPath = `${basePath}${rootFolderName}`.replace(/\//g, "\\");
    if (!folderPath.trim()) {
      setWorkspaceError("CentralHub could not read that folder path.");
      return;
    }

    const workspace: WorkspaceOption = {
      id: customWorkspaceId(folderPath),
      name: workspaceNameFromPath(folderPath),
      path: folderPath,
    };
    const nextCustomWorkspaces = [
      workspace,
      ...customWorkspaces.filter((item) => item.id !== workspace.id),
    ].slice(0, 12);
    const nextArchivedWorkspaces = archivedWorkspaces.filter(
      (item) => item.id !== workspace.id
    );
    const nextWorkspaceOrder = workspaceOrder.includes(workspace.id)
      ? workspaceOrder
      : (() => {
          const existingIds = projectGroups.map((project) => project.id);
          return [
            ...workspaceOrder.filter((id) => existingIds.includes(id)),
            ...existingIds.filter((id) => !workspaceOrder.includes(id)),
            workspace.id,
          ];
        })();
    saveCustomWorkspaces(nextCustomWorkspaces);
    saveArchivedWorkspaces(nextArchivedWorkspaces);
    saveWorkspaceOrder(nextWorkspaceOrder);
    setCustomWorkspaces(nextCustomWorkspaces);
    setArchivedWorkspaces(nextArchivedWorkspaces);
    setWorkspaceOrder(nextWorkspaceOrder);
    setWorkspaceId(workspace.id);
    setWorkspaceError(null);
    saveLastWorkspaceId(workspace.id);
    notifyCodingWorkspacesUpdated();
  };

  const recordCodingTurn = (text: string, now: number) => {
    const title = text.replace(/\s+/g, " ").trim().slice(0, 54) || "Coding chat";

    // Decide new-vs-existing chat OUTSIDE the state updater so the updater
    // stays pure. React StrictMode invokes updaters twice in dev to detect
    // exactly the kind of side-effect-in-updater bug that used to live here
    // (setActiveChatId / onAgentTabTitleChange called from inside the
    // setChatRecords updater triggered a parent setState during a child's
    // render → "Cannot update a component while rendering a different one").
    const priorActiveId = activeChatIdRef.current;
    const priorRecord = priorActiveId
      ? chatRecords.find((record) => record.id === priorActiveId)
      : null;
    const isNewChat = !(priorActiveId && priorRecord);
    const resolvedId = isNewChat
      ? `coding-${now}-${Math.random().toString(36).slice(2, 7)}`
      : (priorActiveId as string);
    if (isNewChat) {
      activeChatIdRef.current = resolvedId;
    }

    setChatRecords((prev) => {
      const present = prev.some((record) => record.id === resolvedId);
      const nextRecords: CodingAgentChatRecord[] = present
        ? prev.map((record) =>
            record.id === resolvedId
              ? { ...record, updatedAt: now }
              : record
          )
        : [
            {
              id: resolvedId,
              title,
              workspaceId,
              workspaceName: selectedWorkspace.name,
              workspacePath: selectedWorkspace.path,
              createdAt: now,
              updatedAt: now,
              messages: [],
            },
            ...prev,
          ].slice(0, MAX_CHAT_RECORDS);
      saveChatRecords(nextRecords);
      return nextRecords;
    });

    if (isNewChat) {
      setActiveChatId(resolvedId);
      onAgentTabTitleChange(activeAgentTabId, title);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    const text = draft.trim();
    const workspaceContext = selectedWorkspace.path
      ? [
          `Selected coding workspace: ${selectedWorkspace.name}`,
          `Workspace path: ${selectedWorkspace.path}`,
        ]
      : [
          "Selected coding workspace: No workspace",
          "No workspace path is selected. Do not inspect, create, edit, delete, or run project files unless the user explicitly provides a path or chooses a folder.",
        ];
    const hiddenContext = [
      ...workspaceContext,
      `Requested thinking effort: ${effort}`,
      `Safety level: ${selectedSafety.label}`,
      selectedSafety.prompt,
      resumeContextRef.current,
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n");

    setComposerDocked(true);
    saveLastWorkspaceId(workspaceId);
    recordCodingTurn(text, new Date().getTime());
    resumeContextRef.current = null;
    setDraft("");
    await chat.sendMessage(text, undefined, hiddenContext);
  };

  const handleSelectChatRecord = async (record: CodingAgentChatRecord) => {
    const messages = sanitizeStoredMessages(record.messages);
    activeChatIdRef.current = record.id;
    setActiveChatId(record.id);
    handleWorkspaceChange(record.workspaceId);
    setDraft("");
    setComposerDocked(messages.length > 0);
    resumeContextRef.current = buildResumeContext(messages);

    const restarted = await chat.restart();
    if (!restarted) chat.clear();
    chat.setMessages(messages);
  };

  const composerIsFloating = !composerDocked && chat.messages.length === 0;
  const usePortalRail = Boolean(infoPortalId || workspacesPortalId);

  const infoPanel = (
    <div
      className="h-full min-h-0 text-[var(--ch-text-muted)] flex flex-col"
      style={THEME_STYLES[theme]}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60 mb-3 shrink-0">
        <Bot className="w-3.5 h-3.5" />
        Info
      </div>
      <div className="flex-1 min-h-0 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm p-3 text-[11px] leading-relaxed overflow-hidden">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Cost
            </div>
            <div className="font-mono tabular-nums">
              ${(chat.sessionStats?.cost ?? 0).toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Tokens
            </div>
            <div className="font-mono tabular-nums">
              {formatTokens(chat.sessionStats?.tokens.total)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Model
            </div>
            <div className="font-mono truncate">
              {selectedThinkingModel?.name ?? chat.currentModel?.name ?? "None"}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Effort
            </div>
            <div className="font-mono truncate">
              {selectedThinkingModel ? effort : "Required"}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Safety
            </div>
            <div className="font-mono truncate">{selectedSafety.label}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-45">
              Runtime
            </div>
            <div className="font-mono truncate">PI SDK</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--ch-border-subtle)]">
          {selectedSafety.prompt}
        </div>
      </div>
    </div>
  );

  const workspacesPanel = (
    <div
      className="h-full min-h-0 flex flex-col"
      style={THEME_STYLES[theme]}
    >
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60">
          <FolderOpen className="w-3.5 h-3.5" />
          Workspaces
        </div>
        <button
          type="button"
          onClick={handleChooseWorkspaceFolder}
          className="h-[24px] px-2 flex items-center gap-1.5 border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] hover:border-[var(--agent-border)] rounded-sm text-[10px] text-[var(--ch-text-muted)] hover:text-[var(--ch-text)] transition-colors"
          title="Add workspace"
        >
          <FolderOpen className="w-3 h-3" />
          Add workspace
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {projectGroups.map((project) => (
          <div
            key={project.id}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={() => handleWorkspaceDrop(project.id)}
            onDragEnd={() => setDraggedWorkspaceId(null)}
            className={`border rounded-sm px-2.5 py-2 text-left transition-colors ${
              project.id === workspaceId
                ? "border-[var(--agent-border)] bg-[var(--agent-accent-soft)]"
                : "border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)]"
            } ${project.id === draggedWorkspaceId ? "opacity-45" : ""}`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  setDraggedWorkspaceId(project.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", project.id);
                }}
                className="mt-0.5 h-[20px] w-[18px] flex flex-col items-center justify-center gap-1 text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] cursor-grab active:cursor-grabbing shrink-0"
                title="Drag to reorder workspace"
              >
                <span className="block h-px w-3 bg-current" />
                <span className="block h-px w-3 bg-current" />
              </button>
              <button
                type="button"
                onClick={() => handleWorkspaceChange(project.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-mono text-[var(--ch-text)] truncate">
                    {project.name}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--ch-text-muted)] tabular-nums">
                    {project.chats.length}
                  </span>
                </div>
                <span className="block mt-0.5 text-[10px] font-mono text-[var(--ch-text-faint)] truncate">
                  {project.path || "No folder selected"}
                </span>
              </button>
              {customWorkspaces.some((workspace) => workspace.id === project.id) && (
                <button
                  type="button"
                  onClick={() => handleArchiveWorkspace(project)}
                  className="h-[24px] w-[24px] flex items-center justify-center border border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--agent-accent)] hover:border-[var(--agent-border)] rounded-sm transition-colors shrink-0"
                  title={`Archive ${project.name}`}
                >
                  <Archive className="w-3 h-3" />
                </button>
              )}
              {pendingNewChatGate !== `workspace:${project.id}` && (
                <button
                  type="button"
                  onClick={() => requestNewChat(`workspace:${project.id}`)}
                  className="h-[24px] w-[24px] flex items-center justify-center border border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--agent-accent)] hover:border-[var(--agent-border)] rounded-sm transition-colors shrink-0"
                  title={`New chat in ${project.name}`}
                >
                  <MessageSquarePlus className="w-3 h-3" />
                </button>
              )}
            </div>

            {pendingNewChatGate === `workspace:${project.id}` && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                <span className="text-[var(--ch-error-text)]">New chat?</span>
                <button
                  type="button"
                  onClick={() => confirmNewChat(project.id)}
                  className="px-1.5 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm uppercase tracking-wider transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={cancelNewChat}
                  className="px-1.5 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm uppercase tracking-wider transition-colors"
                >
                  No
                </button>
              </div>
            )}

            <div className="mt-2 flex flex-col gap-1.5">
              {project.chats.length === 0 ? (
                <div className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] rounded-sm px-2 py-1.5 text-[10px] leading-relaxed text-[var(--ch-text-muted)]">
                  No chats yet.
                </div>
              ) : (
                project.chats.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      void handleSelectChatRecord(record);
                    }}
                    className={`border rounded-sm px-2 py-1.5 text-left transition-colors ${
                      record.id === activeChatId
                        ? "border-[var(--agent-border)] bg-[var(--agent-accent-soft)]"
                        : "border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--ch-text)] truncate">
                      <History className="w-3 h-3 shrink-0 opacity-45" />
                      <span className="truncate">{record.title}</span>
                    </span>
                    <span className="block mt-0.5 text-[10px] font-mono text-[var(--ch-text-faint)] truncate">
                      {formatChatTime(record.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="contents" style={THEME_STYLES[theme]}>
      <div className="flex-1 min-h-0 min-w-[400px] flex flex-col gap-2">
        <div className="flex items-center shrink-0 gap-0">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => handleFolderInputChange(event.target.files)}
          />
          {agentTabs.map((agentTab) => {
            const isActiveAgentTab = agentTab.id === activeAgentTabId;
            const isConfirmingClose =
              pendingAgentTabCloseId === agentTab.id;
            const isOnlyAgentTab = agentTabs.length <= 1;

            return (
              <div key={agentTab.id} className="relative flex">
                <button
                  type="button"
                  className={`h-[28px] px-3 text-[11px] font-medium transition-colors flex items-center gap-2 border rounded-sm ${
                    isActiveAgentTab
                      ? "border-[var(--agent-border)] bg-[var(--agent-accent-soft)] text-[var(--agent-accent)]"
                      : "border-[var(--ch-border)] bg-[var(--ch-bg-base)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)]"
                  }`}
                  onClick={() => onAgentTabSelect(agentTab.id)}
                  title={agentTab.title}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[140px]">
                    {agentTab.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] leading-none transition-colors ${
                      isConfirmingClose
                        ? "bg-[var(--ch-error-bg)] text-[var(--ch-error)]"
                        : "text-[var(--ch-text-faint)] hover:text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)]"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAgentTabCloseRequest(agentTab.id);
                    }}
                    title={
                      isOnlyAgentTab ? "Start new chat" : "Close chat"
                    }
                  >
                    <X className="w-2.5 h-2.5" />
                  </span>
                </button>

                {isConfirmingClose && (
                  <div className="absolute top-full left-0 mt-1 z-50 border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm shadow-lg px-2.5 py-2 flex items-center gap-2 whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3 text-[var(--ch-error)] shrink-0" />
                    <span className="text-[11px] text-[var(--ch-error-text)]">
                      {isOnlyAgentTab
                        ? "Start new chat?"
                        : `Close ${agentTab.title}?`}
                    </span>
                    <button
                      type="button"
                      onClick={onAgentTabCloseConfirm}
                      className="px-2 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-error-bg)] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={onAgentTabCloseCancel}
                      className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {canAddAgentTab && (
            <button
              type="button"
              onClick={onAgentTabAdd}
              className="h-[28px] px-2.5 flex items-center gap-1.5 border border-[var(--ch-border)] text-[var(--ch-text-faint)] hover:text-[var(--agent-accent)] hover:border-[var(--agent-border)] rounded-sm transition-colors shrink-0"
              title="New chat"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span className="text-[11px]">New chat</span>
            </button>
          )}
        </div>

        <div className="clouds-coding-chat-shell flex-1 min-h-0 border border-[var(--agent-border)] rounded-sm overflow-hidden bg-[var(--ch-bg-base)] flex flex-col relative">
          <div className="clouds-coding-chat-header shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--agent-accent)]">
              Coding Agent
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--ch-text-faint)] flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  chat.isReady ? "bg-[var(--ch-success)]" : "bg-[var(--ch-text-faint)]"
                }`}
              />
              {chat.isReady ? "Ready" : "Connecting"}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-[210px] flex flex-col gap-4">
            {chat.initError && (
              <div className="border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm p-4 flex items-start gap-3 text-[var(--ch-error-text)]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-[12px] leading-relaxed">{chat.initError}</p>
              </div>
            )}

            {!chat.initError && chat.messages.length === 0 && (
              <div className="flex-1 min-h-[240px] flex flex-col items-center justify-center gap-2 opacity-35">
                {chat.isReady ? (
                  <Code2 className="w-10 h-10" />
                ) : (
                  <Loader2 className="w-8 h-8 animate-spin" />
                )}
                <span className="text-[11px] uppercase tracking-widest mt-2">
                  {chat.isReady
                    ? "Choose a workspace or start without one"
                    : "Connecting to PI"}
                </span>
              </div>
            )}

            {chat.messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[82%] border border-[var(--agent-border)] bg-[var(--agent-accent-soft)] px-4 py-2.5 rounded-sm">
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    </div>
                  </div>
                );
              }

              if (message.role === "tool") {
                return (
                  <div key={message.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 ml-1 text-[10px] font-mono uppercase tracking-wider opacity-45">
                      <Wrench className="w-3 h-3" />
                      {message.toolName ?? "tool"}
                    </div>
                    <div className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[180px] overflow-y-auto text-[var(--ch-text-muted)]">
                      {message.content || "Running..."}
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-40 ml-1">
                    PI {message.isStreaming ? "responding" : ""}
                  </span>
                  <div className="border border-[var(--ch-border)] bg-[var(--ch-bg-base)] px-4 py-2.5 rounded-sm">
                    {message.thinking && (
                      <details className="mb-2">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wider opacity-35 hover:opacity-60 transition-opacity select-none">
                          Thinking
                        </summary>
                        <p className="mt-1 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--ch-text-faint)] italic">
                          {message.thinking}
                        </p>
                      </details>
                    )}
                    {message.isStreaming ? (
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {message.content || "\u200B"}
                      </p>
                    ) : (
                      <MarkdownContent
                        content={message.content}
                        className="markdown-body"
                      />
                    )}
                    {message.isStreaming && !message.content && !message.thinking && (
                      <span className="inline-block w-2 h-4 bg-[var(--ch-text)] animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={scrollAnchorRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className={`clouds-coding-composer absolute border border-[var(--agent-border)] bg-[var(--ch-bg-surface)] rounded-sm shadow-2xl p-3 flex flex-col gap-2 transition-[top,bottom,left,right,width,transform] duration-500 ease-out ${
              composerIsFloating
                ? "top-1/2 bottom-auto left-1/2 right-auto w-[56%] -translate-x-1/2 -translate-y-1/2"
                : "top-auto bottom-3 left-3 right-3 w-auto translate-x-0 translate-y-0"
            }`}
          >
            <div className="grid grid-cols-4 gap-2">
              <ComposerDropdown
                id="workspace"
                label="Workspace"
                valueLabel={selectedWorkspace.name}
                options={workspaceDropdownOptions}
                openId={openComposerMenu}
                onOpenChange={setOpenComposerMenu}
                onSelect={handleWorkspaceChange}
              />

              <ComposerDropdown
                id="model"
                label="Model"
                valueLabel={
                  selectedThinkingModel
                    ? renderModelName(selectedThinkingModel)
                    : thinkingModels.length === 0
                    ? "No thinking models"
                    : "Select thinking model"
                }
                options={modelDropdownOptions}
                openId={openComposerMenu}
                disabled={!chat.isReady || thinkingModels.length === 0}
                searchable
                searchPlaceholder="Search models..."
                onOpenChange={setOpenComposerMenu}
                onSelect={handleModelChange}
              />

              <ComposerDropdown
                id="effort"
                label="Effort"
                valueLabel={EFFORTS.find((item) => item.id === effort)?.label ?? effort}
                options={effortDropdownOptions}
                openId={openComposerMenu}
                disabled={!selectedThinkingModel}
                onOpenChange={setOpenComposerMenu}
                onSelect={(value) => setEffort(value as EffortLevel)}
              />

              <ComposerDropdown
                id="safety"
                label="Safety"
                valueLabel={selectedSafety.label}
                options={safetyDropdownOptions}
                openId={openComposerMenu}
                onOpenChange={setOpenComposerMenu}
                onSelect={(value) => setSafetyLevel(value as SafetyLevel)}
              />
            </div>

            {needsThinkingModel && (
              <div className="text-[10px] text-[var(--agent-accent)]">
                Choose a thinking-capable model before sending.
              </div>
            )}
            {workspaceError && (
              <div className="text-[10px] text-[var(--agent-accent)]">
                {workspaceError}
              </div>
            )}

            <div className="flex items-end gap-2">
              {pendingNewChatGate === "composer" ? (
                <div className="h-[38px] px-2 flex items-center gap-1.5 border border-[var(--ch-border)] bg-[var(--ch-bg-inset)] rounded-sm text-[10px] shrink-0">
                  <span className="text-[var(--ch-error-text)]">Confirm?</span>
                  <button
                    type="button"
                    onClick={() => confirmNewChat()}
                    className="px-1.5 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-success)]/10 rounded-sm uppercase tracking-wider transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={cancelNewChat}
                    className="px-1.5 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm uppercase tracking-wider transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => requestNewChat("composer")}
                  className="h-[38px] w-[38px] flex items-center justify-center border border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--agent-accent)] hover:border-[var(--agent-border)] bg-[var(--ch-bg-inset)] rounded-sm transition-colors shrink-0"
                  title="New chat"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                </button>
              )}
              <textarea
                className="flex-1 min-h-[62px] max-h-[120px] resize-none border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] rounded-sm px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-[var(--agent-border)]"
                placeholder="Ask the coding agent to inspect, edit, test, or explain..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {chat.isStreaming ? (
                <button
                  type="button"
                  onClick={chat.abort}
                  className="h-[38px] w-[38px] flex items-center justify-center border border-[var(--agent-border)] text-[var(--agent-accent)] bg-[var(--agent-accent-soft)] rounded-sm"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className="h-[38px] w-[38px] flex items-center justify-center border border-[var(--agent-border)] text-[var(--agent-accent)] bg-[var(--agent-accent-soft)] rounded-sm disabled:opacity-35 disabled:cursor-not-allowed"
                  title="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {!usePortalRail && (
        <aside className="w-1/4 max-w-[300px] min-w-[200px] h-full border border-[var(--agent-border)] p-3 overflow-hidden flex flex-col gap-3 rounded-sm bg-[var(--agent-accent-soft)]">
          <div className="shrink-0">{infoPanel}</div>
          <div className="flex-1 min-h-0">{workspacesPanel}</div>
        </aside>
      )}
      </div>
      {infoPortalId && infoPortalTarget
        ? createPortal(infoPanel, infoPortalTarget)
        : null}
      {workspacesPortalId && workspacesPortalTarget
        ? createPortal(workspacesPanel, workspacesPortalTarget)
        : null}
    </>
  );
}

export function CodingAgentPanel({
  theme,
  infoPortalId,
  workspacesPortalId,
}: CodingAgentPanelProps) {
  const [tabState, setTabState] = useState<CodingAgentTabState>(
    createCodingAgentTabState
  );
  const [pendingTabCloseId, setPendingTabCloseId] = useState<string | null>(
    null
  );

  const handleSelectTab = (tabId: string) => {
    setPendingTabCloseId(null);
    setTabState((prev) => ({ ...prev, activeId: tabId }));
  };

  const handleAddTab = () => {
    setPendingTabCloseId(null);
    setTabState((prev) => {
      if (prev.tabs.length >= MAX_CODING_AGENT_TABS) return prev;
      const nextTab = makeCodingAgentTab(
        `Coding Workspace ${prev.tabs.length + 1}`
      );
      return {
        tabs: renumberCodingAgentTabs([...prev.tabs, nextTab]),
        activeId: nextTab.id,
      };
    });
  };

  const handleCloseConfirm = () => {
    const tabId = pendingTabCloseId;
    if (!tabId) return;

    setPendingTabCloseId(null);
    setTabState((prev) => {
      if (prev.tabs.length <= 1) {
        return createCodingAgentTabState();
      }

      const tabIndex = prev.tabs.findIndex((tab) => tab.id === tabId);
      const remaining = renumberCodingAgentTabs(
        prev.tabs.filter((tab) => tab.id !== tabId)
      );
      const activeId =
        tabId === prev.activeId
          ? remaining[Math.min(Math.max(tabIndex, 0), remaining.length - 1)].id
          : prev.activeId;

      return {
        tabs: remaining,
        activeId,
      };
    });
  };

  const handleTitleChange = (tabId: string, title: string) => {
    setTabState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, title, customTitle: title } : tab
      ),
    }));
  };

  return (
    <>
      {tabState.tabs.map((tab) => {
        const isActive = tab.id === tabState.activeId;
        return (
          <div
            key={tab.id}
            style={{ display: isActive ? "contents" : "none" }}
          >
            <CodingAgentTabPanel
              theme={theme}
              infoPortalId={isActive ? infoPortalId : undefined}
              workspacesPortalId={isActive ? workspacesPortalId : undefined}
              agentTabs={tabState.tabs}
              activeAgentTabId={tabState.activeId}
              pendingAgentTabCloseId={pendingTabCloseId}
              canAddAgentTab={
                tabState.tabs.length < MAX_CODING_AGENT_TABS
              }
              onAgentTabSelect={handleSelectTab}
              onAgentTabAdd={handleAddTab}
              onAgentTabCloseRequest={setPendingTabCloseId}
              onAgentTabCloseConfirm={handleCloseConfirm}
              onAgentTabCloseCancel={() => setPendingTabCloseId(null)}
              onAgentTabTitleChange={handleTitleChange}
            />
          </div>
        );
      })}
    </>
  );
}

"use client";
import { useRef, useState, useCallback } from "react";
import {
  Menu,
  MessageSquare,
  FileText,
  Keyboard,
  Search,
  Image as ImageIcon,
  FileUp,
  Clipboard,
  Mic,
  Send,
  Settings,
  FolderOpen,
  X,
  Square,
  Terminal,
  FileCode,
  AlertTriangle,
  Loader2,
  Key,
  Cpu,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  ChevronDown,
  Star,
  Ban,
} from "lucide-react";
import { usePiChat } from "@/hooks/usePiChat";

/* ------------------------------------------------------------------ */
/*  Data types                                                        */
/* ------------------------------------------------------------------ */
interface ClipboardItem {
  id: string;
  text: string;
  timestamp: number;
}

interface DocumentItem {
  id: string;
  name: string;
  path: string;
  timestamp: number;
}

interface VoiceItem {
  id: string;
  name: string;
  path: string;
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
let nextId = 1;
const uid = () => String(nextId++);

const apps = [
  { name: "Agent Chat", icon: MessageSquare },
  { name: "Word Processor", icon: FileText },
  { name: "Typing Practice", icon: Keyboard },
  { name: "AI Search", icon: Search },
  { name: "Dev & Workflows", icon: FileUp },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function Home() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chat = usePiChat();

  /* ---- menu state ---- */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<"settings" | "documents">("settings");

  /* ---- settings state ---- */
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [fontSize, setFontSize] = useState(12);

  /* ---- API key state ---- */
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  /* ---- model selector state ---- */
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  /* ---- documents & media state ---- */
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [documentItems, setDocumentItems] = useState<DocumentItem[]>([]);
  const [voiceItems, setVoiceItems] = useState<VoiceItem[]>([]);

  /* ---- handlers ---- */
  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 400) + "px";
    }
  };

  const addClipboardText = () => {
    const text = textareaRef.current?.value?.trim();
    if (!text) return;
    setClipboardItems((prev) => [
      { id: uid(), text, timestamp: Date.now() },
      ...prev,
    ]);
    if (textareaRef.current) textareaRef.current.value = "";
  };

  const addDocumentPath = () => {
    const path = `C:\\Users\\DyckH\\Documents\\doc-${clipboardItems.length + documentItems.length + 1}.txt`;
    setDocumentItems((prev) => [
      { id: uid(), name: path.split("\\").pop() ?? path, path, timestamp: Date.now() },
      ...prev,
    ]);
  };

  const addVoiceRecording = () => {
    const name = `Recording-${voiceItems.length + 1}.wav`;
    setVoiceItems((prev) => [
      { id: uid(), name, path: `C:\\Users\\DyckH\\Recordings\\${name}`, timestamp: Date.now() },
      ...prev,
    ]);
  };

  const removeClipboard = (id: string) =>
    setClipboardItems((prev) => prev.filter((i) => i.id !== id));
  const removeDocument = (id: string) =>
    setDocumentItems((prev) => prev.filter((i) => i.id !== id));
  const removeVoice = (id: string) =>
    setVoiceItems((prev) => prev.filter((i) => i.id !== id));

  /* ---- API key handlers ---- */
  const handleSaveApiKey = useCallback(async () => {
    if (!openRouterKey.trim()) return;
    setSavingKey(true);
    setKeySaved(false);
    try {
      // setApiKey already destroys + recreates the session, including
      // refreshing models/auth. Do NOT call reinit() after — that would
      // create a second session on top of the one just created.
      await chat.setApiKey("openrouter", openRouterKey.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 3000);
    } catch (e: any) {
      console.error("Failed to save API key:", e);
    } finally {
      setSavingKey(false);
    }
  }, [openRouterKey, chat.setApiKey]);

  const handleSelectModel = useCallback(async (model: { provider: string; id: string }) => {
    setModelDropdownOpen(false);
    setModelSearch("");
    try {
      await chat.setModel(model.provider, model.id);
    } catch (e: any) {
      console.error("Failed to set model:", e);
    }
  }, [chat.setModel]);

  /* ---- model key helper ---- */
  const modelKey = (m: { provider: string; id: string }) => `${m.provider}:${m.id}`;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <div className="h-[calc(100vh-16px)] w-full flex text-black dark:text-[#E0E0E0] font-[family-name:var(--font-sans)] text-[12px] p-2 gap-2 overflow-hidden items-stretch no-drag mt-4">
      {/* ============================================================ */}
      {/*  MENU OVERLAY (blurred backdrop + large panel)               */}
      {/* ============================================================ */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md"
            onClick={() => setMenuOpen(false)}
          />

          {/* Panel */}
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] pointer-events-none">
            <div className="pointer-events-auto w-[560px] max-h-[80vh] border border-[#333333] bg-[#0c0c0c] rounded-sm shadow-2xl flex flex-col overflow-hidden">
              {/* ---- Tabs ---- */}
              <div className="flex border-b border-[#333333] shrink-0">
                <button
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                    menuTab === "settings"
                      ? "bg-white/[0.04] text-[#FFFFFF]"
                      : "text-[#777] hover:text-[#BBB]"
                  }`}
                  onClick={() => setMenuTab("settings")}
                >
                  <Settings className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Settings
                </button>
                <button
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                    menuTab === "documents"
                      ? "bg-white/[0.04] text-[#FFFFFF]"
                      : "text-[#777] hover:text-[#BBB]"
                  }`}
                  onClick={() => setMenuTab("documents")}
                >
                  <FolderOpen className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                  Documents &amp; Media
                </button>
              </div>

              {/* ---- Body (scrollable) ---- */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* ============== SETTINGS ============== */}
                {menuTab === "settings" && (
                  <div className="flex flex-col gap-6">
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
                                className="w-full bg-[#1a1a1a] border border-[#333] text-[12px] px-3 py-2 pr-9 rounded-sm outline-none focus:border-[#555] transition-colors font-mono"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveApiKey();
                                }}
                              />
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity"
                                onClick={() => setShowKey(!showKey)}
                              >
                                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <button
                              className="px-4 py-2 border border-[#333] hover:bg-white/[0.08] transition-colors rounded-sm flex items-center gap-1.5 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={handleSaveApiKey}
                              disabled={!openRouterKey.trim() || savingKey}
                            >
                              {savingKey ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : keySaved ? (
                                <Check className="w-3.5 h-3.5 text-[#4CAF50]" />
                              ) : (
                                <Key className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[11px] uppercase tracking-wider">
                                {savingKey ? "Saving…" : keySaved ? "Saved" : "Save"}
                              </span>
                            </button>
                          </div>
                          <p className="text-[10px] opacity-30 mt-1.5 leading-relaxed">
                            Get your key at{" "}
                            <span className="underline cursor-pointer hover:opacity-70">
                              openrouter.ai/keys
                            </span>
                          </p>
                        </div>

                        {/* Status indicator */}
                        <div className="flex items-center gap-2 py-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              chat.authProviders["openrouter"]
                                ? "bg-[#4CAF50]"
                                : "bg-[#555]"
                            }`}
                          />
                          <span className="text-[11px] opacity-50">
                            {chat.authProviders["openrouter"]
                              ? "OpenRouter key configured"
                              : "No API key set"}
                          </span>
                          {chat.isReady && (
                            <span className="text-[10px] text-[#4CAF50] opacity-60 ml-auto">
                              ● Connected
                            </span>
                          )}
                          {!chat.isReady && chat.authProviders["openrouter"] && (
                            <span className="text-[10px] text-[#FFA500] opacity-60 ml-auto">
                              ● Reconnecting…
                            </span>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Blocked Models */}
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        Blocked Models
                      </h3>
                      {chat.blocked.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic">
                          No models blocked. Block a model from the model selector dropdown by clicking the ⊘ icon.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {chat.blocked.map((key) => {
                            // Find model info from original models list (we need it even if blocked)
                            const model = chat.models.find(
                              (m) => `${m.provider}:${m.id}` === key
                            );
                            const name = model ? `${model.provider}/${model.name}` : key;
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2 py-1.5 pl-2 border-b border-[#1a1a1a] group hover:bg-white/[0.02]"
                              >
                                <Ban className="w-3 h-3 text-[#FF5555] shrink-0 opacity-50" />
                                <span className="flex-1 text-[12px] opacity-40 truncate">{name}</span>
                                <button
                                  className="text-[10px] text-[#4CAF50] hover:text-[#66DD66] opacity-50 hover:opacity-100 transition-all shrink-0 uppercase tracking-wider"
                                  onClick={() => chat.unblockModel(key)}
                                >
                                  Unblock
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* Appearance */}
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        Appearance
                      </h3>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] opacity-75">Theme</span>
                        <select
                          value={theme}
                          onChange={(e) => setTheme(e.target.value as "dark" | "light")}
                          className="bg-[#1a1a1a] border border-[#333] text-[12px] px-3 py-1.5 rounded-sm outline-none cursor-pointer"
                        >
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] opacity-75">Font size</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="w-7 h-7 border border-[#333] flex items-center justify-center hover:bg-white/[0.06] rounded-sm text-[13px] transition-colors"
                            onClick={() => setFontSize((s) => Math.max(8, s - 1))}
                          >
                            −
                          </button>
                          <span className="w-9 text-center text-[12px] tabular-nums font-mono">
                            {fontSize}px
                          </span>
                          <button
                            className="w-7 h-7 border border-[#333] flex items-center justify-center hover:bg-white/[0.06] rounded-sm text-[13px] transition-colors"
                            onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Editor */}
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        Editor
                      </h3>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <input type="checkbox" className="accent-white w-3.5 h-3.5" defaultChecked />
                        <span className="text-[12px] opacity-70">Auto-save sessions</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <input type="checkbox" className="accent-white w-3.5 h-3.5" />
                        <span className="text-[12px] opacity-70">Show line numbers</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <input type="checkbox" className="accent-white w-3.5 h-3.5" defaultChecked />
                        <span className="text-[12px] opacity-70">Word wrap</span>
                      </label>
                    </section>

                    {/* Data */}
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        Data &amp; Privacy
                      </h3>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <input type="checkbox" className="accent-white w-3.5 h-3.5" defaultChecked />
                        <span className="text-[12px] opacity-70">Store history locally only</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <input type="checkbox" className="accent-white w-3.5 h-3.5" />
                        <span className="text-[12px] opacity-70">Send anonymous usage stats</span>
                      </label>
                      <div className="mt-3 pt-3 border-t border-[#222]">
                        <button
                          className="text-[11px] text-[#FF5555] hover:text-[#FF7777] transition-colors"
                          onClick={() => {
                            setClipboardItems([]);
                            setDocumentItems([]);
                            setVoiceItems([]);
                          }}
                        >
                          Clear all stored documents &amp; media
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {/* ============== DOCUMENTS & MEDIA ============== */}
                {menuTab === "documents" && (
                  <div className="flex flex-col gap-6">
                    {/* Copied Text */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Clipboard className="w-3.5 h-3.5" />
                        Copied Text
                        <span className="ml-auto font-mono text-[11px] opacity-40 normal-case tracking-normal">
                          {clipboardItems.length} item{clipboardItems.length !== 1 ? "s" : ""}
                        </span>
                      </h3>
                      {clipboardItems.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic ml-5">
                          Nothing stored yet. Use the clipboard button in the input area to save text.
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {clipboardItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start gap-3 py-2 pl-5 border-b border-[#1a1a1a] group hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] opacity-65 leading-relaxed break-words whitespace-pre-wrap">
                                  {item.text}
                                </p>
                                <span className="text-[10px] opacity-25 mt-0.5 block">
                                  {new Date(item.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <button
                                className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#FF4444] transition-all shrink-0 mt-0.5"
                                onClick={() => removeClipboard(item.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Loaded Documents */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <FileText className="w-3.5 h-3.5" />
                        Documents
                        <span className="ml-auto font-mono text-[11px] opacity-40 normal-case tracking-normal">
                          {documentItems.length} item{documentItems.length !== 1 ? "s" : ""}
                        </span>
                      </h3>
                      {documentItems.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic ml-5">
                          No documents loaded. Use the attach button in the input area.
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {documentItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 py-2 pl-5 border-b border-[#1a1a1a] group hover:bg-white/[0.02] transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 opacity-35 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-[12px] opacity-60 truncate block">
                                  {item.name}
                                </span>
                                <span className="text-[10px] opacity-25 block truncate">
                                  {item.path}
                                </span>
                              </div>
                              <button
                                className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#FF4444] transition-all shrink-0"
                                onClick={() => removeDocument(item.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Voice Recordings */}
                    <section>
                      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-35 mb-3">
                        <Mic className="w-3.5 h-3.5" />
                        Voice Recordings
                        <span className="ml-auto font-mono text-[11px] opacity-40 normal-case tracking-normal">
                          {voiceItems.length} item{voiceItems.length !== 1 ? "s" : ""}
                        </span>
                      </h3>
                      {voiceItems.length === 0 ? (
                        <p className="text-[12px] opacity-25 italic ml-5">
                          No recordings. Use the mic button in the input area.
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {voiceItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 py-2 pl-5 border-b border-[#1a1a1a] group hover:bg-white/[0.02] transition-colors"
                            >
                              <Mic className="w-3.5 h-3.5 opacity-35 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-[12px] opacity-60 truncate block">
                                  {item.name}
                                </span>
                                <span className="text-[10px] opacity-25 block truncate">
                                  {item.path}
                                </span>
                              </div>
                              <button
                                className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#FF4444] transition-all shrink-0"
                                onClick={() => removeVoice(item.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
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

      {/* ==================== LEFT COLUMN ==================== */}
      <div className="w-1/5 max-w-[240px] min-w-[200px] flex flex-col gap-2 h-full">
        {/* ---- Menu button ---- */}
        <div
          className="border border-black dark:border-[#333333] p-3 flex justify-between items-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition-colors rounded-sm select-none"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="font-bold text-[10px] tracking-widest uppercase">
            Menu
          </span>
          <Menu className="w-4 h-4" />
        </div>

        {/* ---- Applications List ---- */}
        <div className="flex-1 border border-black dark:border-[#333333] p-3 flex flex-col gap-1 overflow-y-auto rounded-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-3 opacity-60">
            Applications
          </div>
          {apps.map((app) => (
            <div
              key={app.name}
              className="flex items-center gap-3 p-2 border border-transparent hover:border-black dark:hover:border-[#555555] cursor-pointer transition-colors"
            >
              <app.icon className="w-4 h-4" />
              <span>{app.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ==================== CENTER COLUMN ==================== */}
      <div className="flex-1 flex flex-col gap-2 h-full min-w-[400px]">
        {/* ---- Messages area ---- */}
        <div className="flex-1 border border-black dark:border-[#333333] rounded-sm overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Initialisation error */}
            {chat.initError && (
              <div className="flex items-start gap-3 p-4 border border-[#442222] bg-[#1a0a0a] rounded-sm">
                <AlertTriangle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[11px] text-[#FF5555] uppercase tracking-wider">
                    Connection Error
                  </span>
                  <p className="text-[12px] text-[#CC9999] leading-relaxed">
                    {chat.initError}
                  </p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!chat.initError && chat.messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30">
                <MessageSquare className="w-10 h-10" />
                <span className="text-[11px] uppercase tracking-widest mt-2">
                  {chat.isReady ? "Send a message to start" : "Connecting to PI…"}
                </span>
                {!chat.isReady && !chat.initError && (
                  <Loader2 className="w-4 h-4 animate-spin mt-1" />
                )}
              </div>
            )}

            {/* Messages */}
            {chat.messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] border border-[#333333] bg-[#111111] px-4 py-2.5 rounded-sm">
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              }

              if (msg.role === "assistant") {
                return (
                  <div key={msg.id} className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-40 ml-1">
                      PI {msg.isStreaming ? "• responding…" : ""}
                    </span>
                    <div className="border border-[#333333] bg-[#0a0a0a] px-4 py-2.5 rounded-sm">
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content || (msg.isStreaming ? "\u200B" : "")}
                      </p>
                      {msg.isStreaming && !msg.content && (
                        <span className="inline-block w-2 h-4 bg-[#E0E0E0] animate-pulse ml-0.5 align-middle" />
                      )}
                    </div>
                  </div>
                );
              }

              if (msg.role === "tool") {
                const ToolIcon =
                  msg.toolName === "bash" ? Terminal :
                  msg.toolName === "read" ? FileText :
                  msg.toolName === "edit" ? FileCode :
                  msg.toolName === "write" ? FileUp :
                  FileCode;

                return (
                  <div key={msg.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 ml-1">
                      <ToolIcon className="w-3 h-3 opacity-40" />
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-40">
                        {msg.toolName}
                      </span>
                      {msg.isToolError && (
                        <AlertTriangle className="w-3 h-3 text-[#FF5555]" />
                      )}
                    </div>
                    {msg.content && (
                      <div
                        className={`border rounded-sm px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto ${
                          msg.isToolError
                            ? "border-[#442222] bg-[#1a0a0a] text-[#CC8888]"
                            : "border-[#222222] bg-[#080808] text-[#999999]"
                        }`}
                      >
                        {msg.content}
                      </div>
                    )}
                    {!msg.content && (
                      <div className="border border-[#222222] bg-[#080808] rounded-sm px-3 py-2">
                        <Loader2 className="w-3 h-3 animate-spin text-[#666]" />
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })}

            <div ref={(el) => { if (el) el.scrollIntoView({ behavior: "smooth" }); }} />
          </div>
        </div>

        {/* ---- User Input Area ---- */}
        <div className="border border-black dark:border-[#333333] p-2 pl-3 flex flex-col transition-all rounded-sm">
          <textarea
            ref={textareaRef}
            onInput={handleInput}
            className="w-full bg-transparent resize-none outline-none min-h-[50px] overflow-y-auto leading-relaxed"
            placeholder="Type your input here..."
            rows={1}
            style={{ fontSize: `${fontSize}px` }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const text = textareaRef.current?.value?.trim();
                if (text && chat.isReady) {
                  chat.sendMessage(text);
                  if (textareaRef.current) {
                    textareaRef.current.value = "";
                    textareaRef.current.style.height = "auto";
                  }
                }
              }
            }}
          />

          <div className="flex justify-between items-end mt-2 pt-2 border-t border-black/10 dark:border-[#333333]">
            <div className="flex gap-2">
              <button
                className="p-2 border border-black dark:border-[#333333] hover:bg-black hover:text-white dark:hover:bg-[#333333] dark:hover:text-white transition-colors rounded-sm"
                title="Attach Image"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                className="p-2 border border-black dark:border-[#333333] hover:bg-black hover:text-white dark:hover:bg-[#333333] dark:hover:text-white transition-colors rounded-sm"
                title="Attach Document"
                onClick={addDocumentPath}
              >
                <FileUp className="w-4 h-4" />
              </button>
              <button
                className="p-2 border border-black dark:border-[#333333] hover:bg-black hover:text-white dark:hover:bg-[#333333] dark:hover:text-white transition-colors rounded-sm"
                title="Copy text to clipboard store"
                onClick={addClipboardText}
              >
                <Clipboard className="w-4 h-4" />
              </button>
              <button
                className="p-2 border border-black dark:border-[#333333] hover:bg-black hover:text-white dark:hover:bg-[#333333] dark:hover:text-white transition-colors rounded-sm"
                title="Start / store voice recording"
                onClick={addVoiceRecording}
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {chat.isStreaming && (
                <button
                  className="px-3 py-2 border border-[#442222] text-[#FF5555] hover:bg-[#331111] transition-colors font-bold flex items-center gap-1.5 rounded-sm text-[10px] uppercase tracking-widest"
                  onClick={() => chat.abort()}
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              )}
              {!chat.isReady && !chat.isStreaming && (
                <button
                  className="px-4 py-2 border border-[#4CAF50]/50 text-[#4CAF50] hover:bg-[#1a2a1a] transition-colors font-bold flex items-center gap-1.5 rounded-sm text-[10px] uppercase tracking-widest"
                  onClick={() => chat.reinit()}
                  title="Attempt to connect to PI"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Connect
                </button>
              )}
              {chat.isReady && (
                <button
                  className="px-6 py-2 border border-[#333333] hover:bg-white hover:text-black dark:hover:bg-[#333333] dark:hover:text-white bg-[#000000] transition-colors font-bold flex items-center gap-2 rounded-sm"
                  onClick={() => {
                    const text = textareaRef.current?.value?.trim();
                    if (text && chat.isReady) {
                      chat.sendMessage(text);
                      if (textareaRef.current) {
                        textareaRef.current.value = "";
                        textareaRef.current.style.height = "auto";
                      }
                    }
                  }}
                >
                  <span className="uppercase text-[10px] tracking-widest">
                    Send
                  </span>
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== RIGHT COLUMN ==================== */}
      <div className="w-1/4 max-w-[300px] min-w-[200px] h-full border border-black dark:border-[#333333] p-4 overflow-y-auto flex flex-col gap-4 rounded-sm">
        {/* ---- Model Selector ---- */}
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-60 mb-3">
            <Cpu className="w-3.5 h-3.5" />
            Model
          </div>

          {/* Current model display / dropdown trigger */}
          <div className="relative">
            <button
              className="w-full flex items-center justify-between gap-2 border border-[#333333] bg-[#0a0a0a] px-3 py-2 rounded-sm hover:bg-white/[0.04] transition-colors text-left"
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    chat.isReady ? "bg-[#4CAF50]" : "bg-[#555]"
                  }`}
                />
                <span className="text-[12px] truncate">
                  {chat.currentModel
                    ? chat.currentModel.name
                    : chat.isReady
                    ? "Select model…"
                    : "No connection"}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-40 shrink-0 transition-transform ${
                  modelDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown */}
            {modelDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => { setModelDropdownOpen(false); setModelSearch(""); }}
                />
                <div className="absolute top-full left-0 right-0 mt-1 border border-[#333333] bg-[#0c0c0c] rounded-sm shadow-2xl z-40 max-h-[400px] overflow-hidden flex flex-col">
                  {/* ---- Search input ---- */}
                  <div className="px-2 py-1.5 border-b border-[#222] shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-25" />
                      <input
                        type="text"
                        className="w-full bg-[#141414] border border-[#2a2a2a] text-[11px] pl-6 pr-2 py-1.5 rounded-sm outline-none focus:border-[#444] transition-colors"
                        placeholder="Search models…"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                      {modelSearch && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-70 transition-opacity"
                          onClick={() => setModelSearch("")}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scrollable list */}
                  <div className="overflow-y-auto max-h-[320px]">
                  {chat.filteredModels.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-40" />
                      <span className="text-[11px] opacity-30">
                        {chat.authProviders["openrouter"]
                          ? "Loading models…"
                          : "Configure an API key first"}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Refresh + count bar */}
                      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222]">
                        <span className="text-[10px] uppercase tracking-wider opacity-30">
                          {chat.filteredModels.length} model{chat.filteredModels.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          className="opacity-30 hover:opacity-70 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            chat.refreshModels();
                          }}
                          title="Refresh models"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Model list grouped by provider, with search + favorites */}
                      {(() => {
                        // Apply search filter
                        const query = modelSearch.toLowerCase().trim();
                        const filtered = query
                          ? chat.filteredModels.filter(
                              (m) =>
                                m.name.toLowerCase().includes(query) ||
                                m.id.toLowerCase().includes(query) ||
                                m.provider.toLowerCase().includes(query)
                            )
                          : chat.filteredModels;

                        if (filtered.length === 0 && query) {
                          return (
                            <div className="px-3 py-4 text-center">
                              <span className="text-[11px] opacity-30">No models match "{modelSearch}"</span>
                            </div>
                          );
                        }

                        const grouped: Record<string, typeof filtered> = {};
                        for (const m of filtered) {
                          if (!grouped[m.provider]) grouped[m.provider] = [];
                          grouped[m.provider].push(m);
                        }
                        return Object.entries(grouped).map(([provider, providerModels]) => (
                          <div key={provider}>
                            <div className="px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] opacity-25 bg-white/[0.01]">
                              {provider}
                            </div>
                            {providerModels.map((m) => {
                              const key = modelKey(m);
                              const isActive =
                                chat.currentModel?.provider === m.provider &&
                                chat.currentModel?.id === m.id;
                              const isFav = chat.favorites.includes(key);
                              return (
                                <button
                                  key={key}
                                  className={`w-full text-left px-2 py-1.5 text-[12px] hover:bg-white/[0.06] transition-colors flex items-center gap-1.5 group ${
                                    isActive ? "bg-white/[0.04]" : ""
                                  }`}
                                  onClick={() => handleSelectModel(m)}
                                >
                                  {/* Favorite star */}
                                  <span
                                    className="shrink-0 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      chat.toggleFavorite(key);
                                    }}
                                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <Star
                                      className={`w-3 h-3 transition-colors ${
                                        isFav
                                          ? "text-[#FFD700] fill-[#FFD700]"
                                          : "opacity-0 group-hover:opacity-20 hover:!opacity-50"
                                      }`}
                                    />
                                  </span>

                                  <span className="truncate flex-1">{m.name}</span>

                                  {isActive && (
                                    <Check className="w-3 h-3 text-[#4CAF50] shrink-0" />
                                  )}

                                  {/* Block button */}
                                  <span
                                    className="shrink-0 opacity-0 group-hover:opacity-30 hover:!opacity-80 cursor-pointer transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      chat.toggleBlock(key);
                                    }}
                                    title="Block model"
                                  >
                                    <Ban className="w-3 h-3 text-[#FF5555]" />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </>
                  )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Model details when selected */}
          {chat.currentModel && (
            <div className="mt-2 px-2 py-2 border border-[#222] rounded-sm bg-[#060606]">
              <div className="flex flex-col gap-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="opacity-35">Provider</span>
                  <span className="opacity-60 font-mono">{chat.currentModel.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-35">Model ID</span>
                  <span className="opacity-60 font-mono truncate max-w-[140px]">{chat.currentModel.id}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---- Divider ---- */}
        <div className="border-t border-[#222]" />

        {/* ---- Cost & Context Metrics ---- */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-3 opacity-60">
            Session Metrics
          </div>

          {chat.sessionStats ? (
            <div className="flex flex-col gap-3">
              {/* Cost */}
              <div className="border border-[#222] rounded-sm bg-[#060606] px-3 py-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider opacity-35">Cost</span>
                  <span className="text-[13px] font-mono font-bold text-[#4CAF50] tabular-nums">
                    ${chat.sessionStats.cost.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] opacity-25">
                  <span>Total tokens</span>
                  <span className="font-mono tabular-nums">{chat.sessionStats.tokens.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Token breakdown */}
              <div className="border border-[#222] rounded-sm bg-[#060606] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider opacity-35 mb-1.5">Tokens</div>
                <div className="flex flex-col gap-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="opacity-35">Input</span>
                    <span className="font-mono tabular-nums opacity-60">{chat.sessionStats.tokens.input.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-35">Output</span>
                    <span className="font-mono tabular-nums opacity-60">{chat.sessionStats.tokens.output.toLocaleString()}</span>
                  </div>
                  {chat.sessionStats.tokens.cacheRead > 0 && (
                    <div className="flex justify-between">
                      <span className="opacity-25">Cache read</span>
                      <span className="font-mono tabular-nums opacity-40">{chat.sessionStats.tokens.cacheRead.toLocaleString()}</span>
                    </div>
                  )}
                  {chat.sessionStats.tokens.cacheWrite > 0 && (
                    <div className="flex justify-between">
                      <span className="opacity-25">Cache write</span>
                      <span className="font-mono tabular-nums opacity-40">{chat.sessionStats.tokens.cacheWrite.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Context usage */}
              {chat.contextUsage && chat.contextUsage.tokens != null && (
                <div className="border border-[#222] rounded-sm bg-[#060606] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider opacity-35 mb-1">Context</div>
                  <div className="flex justify-between items-end">
                    <span className="text-[13px] font-mono font-bold tabular-nums">
                      {chat.contextUsage.tokens.toLocaleString()}
                      <span className="text-[10px] font-normal opacity-25 ml-1">
                        / {chat.contextUsage.contextWindow.toLocaleString()}
                      </span>
                    </span>
                    {chat.contextUsage.percent != null && (
                      <span className="text-[10px] font-mono tabular-nums opacity-35">
                        {chat.contextUsage.percent.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {/* Mini progress bar */}
                  {chat.contextUsage.percent != null && (
                    <div className="mt-1.5 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          chat.contextUsage.percent > 80
                            ? "bg-[#FF5555]"
                            : chat.contextUsage.percent > 50
                            ? "bg-[#FFA500]"
                            : "bg-[#4CAF50]"
                        }`}
                        style={{ width: `${Math.min(chat.contextUsage.percent, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="opacity-25 italic text-[11px] leading-relaxed">
              Send a message to see session cost and context usage metrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
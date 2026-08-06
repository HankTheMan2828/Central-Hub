"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/** Same workspace as this Grok Build session. */
const DEFAULT_CWD = "C:\\Users\\Henry D";

function getIpc() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron") as {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<any>;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (
          channel: string,
          listener: (...args: any[]) => void
        ) => void;
      };
    };
    return electron.ipcRenderer;
  } catch {
    return null;
  }
}

/** Wait until the host has a real layout box (FadeSwap / flex can be 0×0 briefly). */
function waitForHostSize(
  el: HTMLElement,
  timeoutMs = 2500
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w >= 80 && h >= 60) {
        resolve({ width: w, height: h });
        return;
      }
      if (performance.now() - start > timeoutMs) {
        resolve({ width: Math.max(w, 80), height: Math.max(h, 60) });
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Full-bleed in-app Grok Build TUI (xterm + node-pty).
 * Minimal chrome: floating restart only, so Grok owns the surface.
 */
export function GrokTerminalPanel() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const termIdRef = useRef<string | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [status, setStatus] = useState<"booting" | "ready" | "exited" | "error">(
    "booting"
  );
  const [error, setError] = useState<string | null>(null);
  const [cwd] = useState(DEFAULT_CWD);
  const [restartKey, setRestartKey] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);

  const destroyPty = useCallback(async () => {
    const ipc = getIpc();
    const id = termIdRef.current;
    termIdRef.current = null;
    if (ipc && id) {
      try {
        await ipc.invoke("grok:pty-destroy", { termId: id });
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dataHandler: ((...args: any[]) => void) | null = null;
    let exitHandler: ((...args: any[]) => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let onWinResize: (() => void) | null = null;
    let hideChromeTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let settleTimers: ReturnType<typeof setTimeout>[] = [];

    const boot = async () => {
      setStatus("booting");
      setError(null);
      setChromeVisible(true);
      lastSizeRef.current = null;

      const host = hostRef.current;
      const ipc = getIpc();
      if (!host) return;
      if (!ipc) {
        setStatus("error");
        setError("Not running inside Electron. Launch via npm run app:dev.");
        return;
      }

      // Avoid first-fit at 0×0 inside absolute FadeSwap / flex parents.
      await waitForHostSize(host);
      if (cancelled) return;

      // Font metrics must be ready or FitAddon under-counts cols (empty right band).
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (cancelled) return;

      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch {
          /* ignore */
        }
        termRef.current = null;
      }
      host.innerHTML = "";

      // Full-screen TUI options: no scrollback, no EOL munging, integer cells.
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily:
          'Cascadia Code, Consolas, "Courier New", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1,
        letterSpacing: 0,
        theme: {
          background: "#0c0c0c",
          foreground: "#d4d4d4",
          cursor: "#49D17C",
          cursorAccent: "#0c0c0c",
          selectionBackground: "#49D17C55",
          black: "#0c0c0c",
          red: "#f66",
          green: "#49D17C",
          yellow: "#e5c07b",
          blue: "#61afef",
          magenta: "#c678dd",
          cyan: "#56b6c2",
          white: "#d4d4d4",
          brightBlack: "#5c6370",
          brightRed: "#ff7b72",
          brightGreen: "#6ee7a0",
          brightYellow: "#f0d48a",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#76e3ea",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
        // convertEol breaks CSI absolute positioning in full-screen TUIs
        convertEol: false,
        scrollback: 0,
        // ConPTY wrapping / cursor quirks (xterm 6 windowsPty)
        windowsPty: { backend: "conpty" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      termRef.current = term;
      fitRef.current = fit;

      const applyFit = (): { cols: number; rows: number } | null => {
        if (!host.clientWidth || !host.clientHeight) return null;
        try {
          fit.fit();
        } catch {
          return null;
        }
        const cols = Math.max(20, term.cols || 80);
        const rows = Math.max(10, term.rows || 24);
        return { cols, rows };
      };

      // Double-fit after layout: first pass may use stale cell metrics.
      applyFit();
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;
      let size = applyFit() ?? { cols: 120, rows: 36 };
      lastSizeRef.current = size;

      const created = await ipc.invoke("grok:pty-create", {
        cwd,
        cols: size.cols,
        rows: size.rows,
        model: "grok-4.5",
      });

      if (cancelled) {
        if (created?.termId) {
          ipc
            .invoke("grok:pty-destroy", { termId: created.termId })
            .catch(() => {});
        }
        return;
      }

      if (!created?.success || !created.termId) {
        setStatus("error");
        setError(created?.error || "Failed to start Grok PTY");
        term.writeln(
          `\x1b[31mError: ${created?.error || "Failed to start Grok PTY"}\x1b[0m`
        );
        return;
      }

      termIdRef.current = created.termId;
      setStatus("ready");
      term.focus();
      // Fade chrome after Grok is up so the TUI owns the surface.
      hideChromeTimer = setTimeout(() => {
        if (!cancelled) setChromeVisible(false);
      }, 1800);

      dataHandler = (
        _event: unknown,
        payload: { termId?: string; data?: string }
      ) => {
        if (!payload || payload.termId !== termIdRef.current) return;
        if (payload.data) term.write(payload.data);
      };
      exitHandler = (
        _event: unknown,
        payload: { termId?: string; exitCode?: number | null }
      ) => {
        if (!payload || payload.termId !== termIdRef.current) return;
        termIdRef.current = null;
        setStatus("exited");
        setChromeVisible(true);
        term.writeln("");
        term.writeln(
          `\x1b[90m[process exited${
            payload.exitCode != null ? ` code ${payload.exitCode}` : ""
          }]\x1b[0m`
        );
      };

      ipc.on("grok:pty-data", dataHandler);
      ipc.on("grok:pty-exit", exitHandler);

      term.onData((data: string) => {
        const id = termIdRef.current;
        if (!id) return;
        ipc.invoke("grok:pty-write", { termId: id, data }).catch(() => {});
      });

      const doResize = () => {
        if (cancelled || !host.clientWidth || !host.clientHeight) return;
        const next = applyFit();
        if (!next) return;
        const id = termIdRef.current;
        if (!id) return;
        const prev = lastSizeRef.current;
        // Skip no-op resizes — spam makes full-screen TUIs redraw wonky.
        if (prev && prev.cols === next.cols && prev.rows === next.rows) return;
        lastSizeRef.current = next;
        ipc
          .invoke("grok:pty-resize", {
            termId: id,
            cols: next.cols,
            rows: next.rows,
          })
          .catch(() => {});
      };

      const scheduleResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(doResize, 40);
      };

      onWinResize = () => scheduleResize();
      window.addEventListener("resize", onWinResize);
      resizeObserver = new ResizeObserver(() => scheduleResize());
      resizeObserver.observe(host);

      // Settle after panel width expands (flush cloud) and fonts settle.
      for (const ms of [50, 150, 350]) {
        settleTimers.push(
          setTimeout(() => {
            if (!cancelled) doResize();
          }, ms)
        );
      }
    };

    boot().catch((e) => {
      if (!cancelled) {
        setStatus("error");
        setError(e?.message ?? String(e));
        setChromeVisible(true);
      }
    });

    return () => {
      cancelled = true;
      if (hideChromeTimer) clearTimeout(hideChromeTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      for (const t of settleTimers) clearTimeout(t);
      const ipc = getIpc();
      if (ipc && dataHandler) ipc.removeListener("grok:pty-data", dataHandler);
      if (ipc && exitHandler) ipc.removeListener("grok:pty-exit", exitHandler);
      if (onWinResize) window.removeEventListener("resize", onWinResize);
      if (resizeObserver) resizeObserver.disconnect();
      destroyPty();
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch {
          /* ignore */
        }
        termRef.current = null;
      }
    };
  }, [cwd, destroyPty, restartKey]);

  const handleRestart = () => {
    setRestartKey((k) => k + 1);
  };

  const showChrome =
    chromeVisible || status === "booting" || status === "error" || status === "exited";

  return (
    <div
      className="relative h-full min-h-0 w-full flex flex-col bg-[#0c0c0c] text-[#d4d4d4] overflow-hidden"
      onMouseEnter={() => setChromeVisible(true)}
      onMouseLeave={() => {
        if (status === "ready") setChromeVisible(false);
      }}
    >
      {/* Floating controls — no full title bar. Hover top-right to reveal. */}
      <div
        className={`pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 transition-opacity duration-200 ${
          showChrome ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 backdrop-blur-sm px-1.5 py-1 shadow-lg">
          {status === "booting" && (
            <span className="flex items-center gap-1 px-1.5 text-[9px] font-mono text-white/50">
              <Loader2 className="w-3 h-3 animate-spin" />
            </span>
          )}
          {status === "error" && (
            <span className="px-1.5 text-[9px] font-mono text-[#f66]">err</span>
          )}
          {status === "exited" && (
            <span className="px-1.5 text-[9px] font-mono text-white/40">
              exited
            </span>
          )}
          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-1 h-6 px-2 text-[9px] uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/10 rounded-full font-mono transition-colors"
            title="Restart Grok Build session"
          >
            <RefreshCw className="w-3 h-3" />
            Restart
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute top-10 left-3 right-3 z-20 px-3 py-2 text-[11px] text-[#f66] border border-[#f66]/30 bg-black/80 rounded-sm font-mono">
          {error}
        </div>
      )}

      <div
        ref={hostRef}
        className="grok-xterm-host flex-1 min-h-0 w-full overflow-hidden"
        onClick={() => termRef.current?.focus?.()}
      />
    </div>
  );
}

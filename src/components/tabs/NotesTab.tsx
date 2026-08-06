"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  CloudFog,
  CloudRain,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  Maximize2,
  PaintBucket,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AnimatedDropdown } from "@/components/AnimatedDropdown";
import {
  makeDir,
  pickFiles,
  pickFolder,
  pickSavePath,
  readFileBytes,
  readFileText,
  writeFileText,
} from "@/components/tabs/wordtab/docStore";

/* ------------------------------------------------------------------ */
/*  Types & storage                                                    */
/* ------------------------------------------------------------------ */

type ItemType = "file" | "folder";

type DesktopItem = {
  id: string;
  type: ItemType;
  name: string;
  /** null = desktop root */
  parentId: string | null;
  /** markdown body for files (cached; disk is source of truth when filePath set) */
  body: string;
  /** Absolute path on disk when item is backed by a real file/folder */
  filePath: string | null;
  col: number;
  row: number;
  createdAt: number;
  updatedAt: number;
};

type RemovePrompt = {
  id: string;
  x: number;
  y: number;
};

type PlaceItem = {
  kind: "file" | "folder";
  path: string;
  name: string;
  body: string;
};

type PlacePrompt = {
  items: PlaceItem[];
  defaultParentId: string | null;
};

type OpenDocTab = {
  /** desktop item id */
  id: string;
  title: string;
};

const STORAGE_DESKTOP = "notes-desktop-v1";
/** Absolute path of the notes desktop background image (or empty). */
const STORAGE_BG = "notes-desktop-bg-v1";
/** Legacy: "1" = frosted on (migrated to amount). */
const STORAGE_BG_FROSTED = "notes-desktop-bg-frosted-v1";
/** Frost intensity 0–100 (0 = off). */
const STORAGE_BG_FROST_AMOUNT = "notes-desktop-bg-frost-amount-v1";
/** Tint color (#rrggbb) and strength 0–100. */
const STORAGE_BG_TINT_COLOR = "notes-desktop-bg-tint-color-v1";
const STORAGE_BG_TINT_AMOUNT = "notes-desktop-bg-tint-amount-v1";
/** Rain intensity 0–100 (0 = off). */
const STORAGE_BG_RAIN_AMOUNT = "notes-desktop-bg-rain-amount-v1";
/** Rain wind: "left" | "straight" | "right". */
const STORAGE_BG_RAIN_DIR = "notes-desktop-bg-rain-dir-v1";
const LEGACY_NOTES = "notes-v1";
const LEGACY_SNIPPETS = "snippets-v1";

type RainDir = "left" | "straight" | "right";

/** Default frost when turning on via legacy toggle or first enable. */
const FROST_DEFAULT = 28;
const FROST_MAX_BLUR_PX = 14;
const FROST_MAX_WASH = 0.28;

const TINT_DEFAULT_COLOR = "#3d5a80";
const TINT_DEFAULT_AMOUNT = 32;
/** Max overlay opacity at 100% tint strength. */
const TINT_MAX_ALPHA = 0.55;
const TINT_PRESETS = [
  "#000000",
  "#1a2332",
  "#3d5a80",
  "#2d6a4f",
  "#7b2d3b",
  "#b08968",
  "#5e60ce",
  "#c9a227",
] as const;

const RAIN_DEFAULT = 40;
const RAIN_DROP_POOL = 90;

type RainDropSpec = {
  /** Start X as % of board width */
  leftPct: number;
  delay: number;
  duration: number;
  /** Streak length in board px */
  length: number;
  width: number;
  opacity: number;
  /**
   * Wind angle in degrees (0 = straight down). Positive = falls down-right.
   * CSS rotate uses the opposite sign of this (see RainOverlay) because
   * CSS positive rotation draws a `/` lean, not `\`.
   */
  windDeg: number;
  layer: "far" | "mid" | "near";
};

/**
 * Deterministic rain field. Fall distance is BOARD_H in *pixels*
 * (not % of streak height — that bug made “rain” hang at the top).
 */
const RAIN_DROPS: RainDropSpec[] = Array.from(
  { length: RAIN_DROP_POOL },
  (_, i) => {
    const layer: RainDropSpec["layer"] =
      i % 5 === 0 ? "near" : i % 3 === 0 ? "far" : "mid";
    const leftPct = ((i * 53 + 11) % 1100) / 10 - 5; // -5% … 105%
    const delay = ((i * 197) % 4200) / 1000;
    // Near streaks fall faster; far sheet rain is slower
    const durationBase =
      layer === "near" ? 0.55 : layer === "far" ? 1.35 : 0.85;
    const duration = durationBase + ((i * 41) % 50) / 100;
    const length =
      layer === "near"
        ? 52 + (i % 5) * 10
        : layer === "far"
          ? 28 + (i % 4) * 6
          : 38 + (i % 6) * 8;
    const width =
      layer === "near" ? 1.8 + (i % 2) * 0.4 : layer === "far" ? 1 : 1.35;
    const opacity =
      layer === "near"
        ? 0.55 + ((i * 7) % 30) / 100
        : layer === "far"
          ? 0.18 + ((i * 5) % 18) / 100
          : 0.32 + ((i * 9) % 28) / 100;
    // Down-right wind; streak lean is matched in RainOverlay via -windDeg CSS rotate
    const windDeg = 12 + (i % 7) * 0.85; // about 12° … 17°
    return {
      leftPct,
      delay,
      duration,
      length,
      width,
      opacity,
      windDeg,
      layer,
    };
  }
);

const HOME_TAB_ID = "home";
/** Home + up to 7 document tabs */
const MAX_TABS = 8;
const MAX_DOC_TABS = MAX_TABS - 1;

const CELL_W = 92;
const CELL_H = 100;
const PAD = 14;
/** Icon hit-box width used to keep right edge inside the board. */
const ICON_W = 84;
/** Approx icon + label height used to keep bottom edge inside the board. */
const ICON_H = 88;

/**
 * Fixed desktop board (logical space). Icons live on this grid permanently;
 * the viewport centers the board and the user zooms in/out instead of the
 * grid reflowing when the cloud resizes (which left uneven side margins).
 */
const BOARD_COLS = 12;
const BOARD_ROWS = 8;
/** Board pixel size: padding + cells, with last icon fully inside. */
const BOARD_W = PAD * 2 + (BOARD_COLS - 1) * CELL_W + ICON_W;
const BOARD_H = PAD * 2 + (BOARD_ROWS - 1) * CELL_H + ICON_H;

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
/** Inset when fitting so the board edge is not flush with the viewport. */
const FIT_INSET = 0.96;

const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
  },
  { name: "All files", extensions: ["*"] },
];

function uid(prefix = "n") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadBgPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_BG);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

function saveBgPath(path: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (path) window.localStorage.setItem(STORAGE_BG, path);
    else window.localStorage.removeItem(STORAGE_BG);
  } catch (err) {
    console.warn("Failed to save desktop background path:", err);
  }
}

function clampFrostAmount(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function loadBgFrostAmount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_BG_FROST_AMOUNT);
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampFrostAmount(n);
    }
    // Migrate legacy on/off flag → moderate amount
    if (window.localStorage.getItem(STORAGE_BG_FROSTED) === "1") {
      return FROST_DEFAULT;
    }
    return 0;
  } catch {
    return 0;
  }
}

function saveBgFrostAmount(amount: number) {
  if (typeof window === "undefined") return;
  try {
    const n = clampFrostAmount(amount);
    window.localStorage.setItem(STORAGE_BG_FROST_AMOUNT, String(n));
    // Keep legacy key in sync for older builds
    window.localStorage.setItem(STORAGE_BG_FROSTED, n > 0 ? "1" : "0");
  } catch (err) {
    console.warn("Failed to save frost amount:", err);
  }
}

function normalizeHexColor(raw: string, fallback = TINT_DEFAULT_COLOR): string {
  const s = raw.trim();
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h.toLowerCase()}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHexColor(hex).slice(1);
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function loadBgTintColor(): string {
  if (typeof window === "undefined") return TINT_DEFAULT_COLOR;
  try {
    const raw = window.localStorage.getItem(STORAGE_BG_TINT_COLOR);
    return raw ? normalizeHexColor(raw) : TINT_DEFAULT_COLOR;
  } catch {
    return TINT_DEFAULT_COLOR;
  }
}

function loadBgTintAmount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_BG_TINT_AMOUNT);
    if (raw == null || raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? clampFrostAmount(n) : 0;
  } catch {
    return 0;
  }
}

function saveBgTintColor(color: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_BG_TINT_COLOR,
      normalizeHexColor(color)
    );
  } catch (err) {
    console.warn("Failed to save tint color:", err);
  }
}

function saveBgTintAmount(amount: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_BG_TINT_AMOUNT,
      String(clampFrostAmount(amount))
    );
  } catch (err) {
    console.warn("Failed to save tint amount:", err);
  }
}

function loadBgRainAmount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_BG_RAIN_AMOUNT);
    if (raw == null || raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? clampFrostAmount(n) : 0;
  } catch {
    return 0;
  }
}

function saveBgRainAmount(amount: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_BG_RAIN_AMOUNT,
      String(clampFrostAmount(amount))
    );
  } catch (err) {
    console.warn("Failed to save rain amount:", err);
  }
}

function loadBgRainDir(): RainDir {
  if (typeof window === "undefined") return "right";
  try {
    const raw = window.localStorage.getItem(STORAGE_BG_RAIN_DIR);
    if (raw === "left" || raw === "straight" || raw === "right") return raw;
    return "right";
  } catch {
    return "right";
  }
}

function saveBgRainDir(dir: RainDir) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_BG_RAIN_DIR, dir);
  } catch (err) {
    console.warn("Failed to save rain direction:", err);
  }
}

/** Multiplier for windDeg: left = −1, straight = 0, right = +1. */
function rainDirSign(dir: RainDir): number {
  if (dir === "left") return -1;
  if (dir === "straight") return 0;
  return 1;
}

function RainOverlay({
  amount,
  direction,
}: {
  amount: number;
  direction: RainDir;
}) {
  const t = clampFrostAmount(amount) / 100;
  // Density curve: light drizzle early, heavy fill near 100%
  const count = Math.round(Math.pow(t, 0.85) * RAIN_DROP_POOL);
  if (count <= 0) return null;

  const drops = RAIN_DROPS.slice(0, count);
  const speedScale = 1.15 - t * 0.25; // heavier rain falls a bit faster
  const opacityScale = 0.75 + t * 0.45;
  // Path length along the fall (board + margin so streaks fully exit)
  const pathLen = BOARD_H + 120;
  const sign = rainDirSign(direction);

  return (
    <div className="notes-rain-layer z-0" aria-hidden>
      {drops.map((d, i) => {
        const op = Math.min(1, d.opacity * opacityScale);
        // sign: +1 right wind, −1 left wind, 0 straight down
        const wind = d.windDeg * sign;
        const rad = (wind * Math.PI) / 180;
        const dirX = Math.sin(rad);
        const dirY = Math.cos(rad);
        // CSS positive rotate draws `/`; negate so lean matches fall path.
        const cssAngleDeg = -wind;
        const fromX = dirX * -(d.length + 16);
        const fromY = dirY * -(d.length + 16);
        const toX = dirX * pathLen;
        const toY = dirY * pathLen;
        const staticT = (((i * 67) % 90) + 4) / 100;
        const layerClass =
          d.layer === "near"
            ? "is-near"
            : d.layer === "far"
              ? "is-far"
              : "";
        return (
          <span
            key={i}
            className={`notes-rain-drop ${layerClass}`}
            style={
              {
                left: `${d.leftPct}%`,
                animationDuration: `${d.duration * speedScale}s`,
                animationDelay: `${-d.delay}s`,
                ["--notes-rain-len" as string]: `${d.length}px`,
                ["--notes-rain-width" as string]: `${d.width}px`,
                ["--notes-rain-angle" as string]: `${cssAngleDeg}deg`,
                ["--notes-rain-opacity" as string]: String(op),
                ["--notes-rain-from-x" as string]: `${fromX.toFixed(1)}px`,
                ["--notes-rain-from-y" as string]: `${fromY.toFixed(1)}px`,
                ["--notes-rain-to-x" as string]: `${toX.toFixed(1)}px`,
                ["--notes-rain-to-y" as string]: `${toY.toFixed(1)}px`,
                ["--notes-rain-static-x" as string]: `${(toX * staticT).toFixed(1)}px`,
                ["--notes-rain-static-y" as string]: `${(toY * staticT).toFixed(1)}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function mimeFromPath(filePath: string): string {
  const ext = (filePath.split(/[/\\]/).pop() || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function loadDesktopItems(): DesktopItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_DESKTOP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (it) =>
              it &&
              typeof it.id === "string" &&
              (it.type === "file" || it.type === "folder") &&
              typeof it.name === "string"
          )
          .map((it) => ({
            id: it.id,
            type: it.type as ItemType,
            name: it.name,
            parentId:
              typeof it.parentId === "string" || it.parentId === null
                ? it.parentId
                : null,
            body: typeof it.body === "string" ? it.body : "",
            filePath:
              typeof it.filePath === "string" && it.filePath
                ? it.filePath
                : null,
            col: typeof it.col === "number" ? it.col : 0,
            row: typeof it.row === "number" ? it.row : 0,
            createdAt:
              typeof it.createdAt === "number" ? it.createdAt : Date.now(),
            updatedAt:
              typeof it.updatedAt === "number" ? it.updatedAt : Date.now(),
          }));
      }
    }

    // Migrate flat notes/snippets → root desktop files
    const legacyRaw =
      window.localStorage.getItem(LEGACY_NOTES) ??
      window.localStorage.getItem(LEGACY_SNIPPETS);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw);
    if (!Array.isArray(legacy)) return [];
    return legacy
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.title === "string" &&
          typeof s.body === "string"
      )
      .map((s, i) => ({
        id: s.id,
        type: "file" as const,
        name: s.title || "Untitled",
        parentId: null,
        body: s.body,
        filePath: null as string | null,
        col: i % 8,
        row: Math.floor(i / 8),
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
        updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function basenameNoExt(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() || "Untitled";
  return base.replace(/\.[^.]+$/, "") || "Untitled";
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${name}`;
}

function saveDesktopItems(items: DesktopItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_DESKTOP, JSON.stringify(items));
  } catch (err) {
    console.warn("Failed to save notes desktop:", err);
  }
}

function displayName(name: string, type: ItemType): string {
  if (type === "file" && !name.toLowerCase().endsWith(".md")) {
    return name;
  }
  return name;
}

function stripMdExt(name: string): string {
  return name.replace(/\.md$/i, "");
}

/* ------------------------------------------------------------------ */
/*  Grid helpers                                                       */
/* ------------------------------------------------------------------ */

function cellKey(col: number, row: number) {
  return `${col},${row}`;
}

function occupiedSet(
  items: DesktopItem[],
  parentId: string | null,
  exceptId?: string
): Set<string> {
  const set = new Set<string>();
  for (const it of items) {
    if (it.parentId !== parentId) continue;
    if (exceptId && it.id === exceptId) continue;
    set.add(cellKey(it.col, it.row));
  }
  return set;
}

function clampGrid(
  col: number,
  row: number,
  maxCols: number,
  maxRows: number
): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(Math.max(1, maxCols) - 1, col)),
    row: Math.max(0, Math.min(Math.max(1, maxRows) - 1, row)),
  };
}

function findFreeCell(
  items: DesktopItem[],
  parentId: string | null,
  maxCols: number,
  maxRows: number,
  prefer?: { col: number; row: number },
  exceptId?: string
): { col: number; row: number } {
  const taken = occupiedSet(items, parentId, exceptId);
  const cols = Math.max(1, maxCols);
  const rows = Math.max(1, maxRows);

  if (prefer) {
    const pref = clampGrid(prefer.col, prefer.row, cols, rows);
    if (!taken.has(cellKey(pref.col, pref.row))) return pref;

    // Prefer nearest free cell to the hover snap (not a full top-left scan)
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (taken.has(cellKey(col, row))) continue;
        const dist =
          (col - pref.col) * (col - pref.col) +
          (row - pref.row) * (row - pref.row);
        if (dist < bestDist) {
          bestDist = dist;
          best = { col, row };
        }
      }
    }
    if (best) return best;
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!taken.has(cellKey(col, row))) return { col, row };
    }
  }
  // Board full — stay on last cell (may stack; better than growing the board)
  return { col: cols - 1, row: rows - 1 };
}

/** Snap ghost top-left to the grid cell under the hover (not icon center). */
function snapPoint(
  x: number,
  y: number,
  maxCols: number,
  maxRows: number
): { col: number; row: number } {
  const col = Math.round((x - PAD) / CELL_W);
  const row = Math.round((y - PAD) / CELL_H);
  return clampGrid(col, row, maxCols, maxRows);
}

/** Pixel bounds for icon top-left so the full icon stays inside the surface. */
function clampGhostPos(
  x: number,
  y: number,
  surfaceW: number,
  surfaceH: number
): { x: number; y: number } {
  const maxX = Math.max(PAD, surfaceW - PAD - ICON_W);
  const maxY = Math.max(PAD, surfaceH - PAD - ICON_H);
  return {
    x: Math.max(PAD, Math.min(maxX, x)),
    y: Math.max(PAD, Math.min(maxY, y)),
  };
}

/* ------------------------------------------------------------------ */
/*  Tab bar (Home fixed + document tabs)                               */
/* ------------------------------------------------------------------ */

function NotesTabBar({
  openTabs,
  activeId,
  onSelect,
  onClose,
  canOpenMore,
}: {
  openTabs: OpenDocTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  canOpenMore: boolean;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmId) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setConfirmId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmId]);

  const tabs: { id: string; title: string; closable: boolean }[] = [
    { id: HOME_TAB_ID, title: "Home", closable: false },
    ...openTabs.map((t) => ({
      id: t.id,
      title: stripMdExt(t.title) || "Untitled",
      closable: true,
    })),
  ];

  return (
    <div
      ref={barRef}
      className="flex items-center shrink-0 gap-0 px-2 pt-2 pb-1 border-b border-[var(--ch-border-subtle)]"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isConfirming = confirmId === tab.id;

        return (
          <div key={tab.id} className="relative flex">
            <button
              type="button"
              className={`h-[28px] px-3 text-[11px] font-medium transition-colors flex items-center gap-2 border border-[var(--ch-border)] ${
                isActive
                  ? "bg-[var(--ch-bg-elevated)] text-[var(--ch-text)]"
                  : "bg-[var(--ch-bg-base)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)]"
              } ${tab.id === HOME_TAB_ID ? "rounded-l-sm" : ""}`}
              onClick={() => {
                setConfirmId(null);
                onSelect(tab.id);
              }}
              title={tab.title}
            >
              {tab.id === HOME_TAB_ID ? (
                <Home className="w-3 h-3 shrink-0 text-[var(--ch-accent)]" />
              ) : (
                <FileText className="w-3 h-3 shrink-0 opacity-70" />
              )}
              <span className="truncate max-w-[140px]">{tab.title}</span>
              {tab.closable && (
                <span
                  role="button"
                  tabIndex={0}
                  className={`shrink-0 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] leading-none transition-colors ${
                    isConfirming
                      ? "bg-[var(--ch-error-bg)] text-[var(--ch-error)]"
                      : "text-[var(--ch-text-faint)] hover:text-[var(--ch-error)] hover:bg-[var(--ch-error-bg)]"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmId === tab.id) {
                      onClose(tab.id);
                      setConfirmId(null);
                    } else {
                      setConfirmId(tab.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirmId === tab.id) {
                        onClose(tab.id);
                        setConfirmId(null);
                      } else {
                        setConfirmId(tab.id);
                      }
                    }
                  }}
                  title={isConfirming ? "Confirm close" : "Close"}
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
            </button>

            <AnimatedDropdown
              open={isConfirming}
              className="absolute top-full left-0 mt-1 z-50 border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm shadow-lg px-2.5 py-2 flex items-center gap-2 whitespace-nowrap"
            >
              <AlertTriangle className="w-3 h-3 text-[var(--ch-error)] shrink-0" />
              <span className="text-[11px] text-[var(--ch-error-text)]">
                Close {tab.title}?
              </span>
              <button
                type="button"
                className="px-2 py-0.5 border border-[var(--ch-success)] text-[var(--ch-success)] hover:bg-[var(--ch-error-bg)] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                  setConfirmId(null);
                }}
              >
                Yes
              </button>
              <button
                type="button"
                className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(null);
                }}
              >
                No
              </button>
            </AnimatedDropdown>
          </div>
        );
      })}

      <span
        className="ml-auto pr-1 text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]"
        title={
          canOpenMore
            ? `${openTabs.length + 1}/${MAX_TABS} tabs`
            : "Tab limit reached"
        }
      >
        {openTabs.length + 1}/{MAX_TABS}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop canvas                                                     */
/* ------------------------------------------------------------------ */

function DesktopIconFace({
  item,
  dimmed,
}: {
  item: DesktopItem;
  dimmed?: boolean;
}) {
  return (
    <>
      <span
        className={`w-11 h-11 rounded-md border flex items-center justify-center ${
          item.type === "folder"
            ? "border-[var(--ch-border)] bg-[var(--ch-bg-elevated)] text-[var(--ch-accent)]"
            : "border-[var(--ch-border-subtle)] bg-[var(--ch-bg-page)] text-[var(--ch-text)]"
        } ${dimmed ? "opacity-40" : ""}`}
      >
        {item.type === "folder" ? (
          <Folder className="w-6 h-6" />
        ) : (
          <FileText className="w-6 h-6" />
        )}
      </span>
      <span
        className={`text-[10px] leading-tight text-center font-mono line-clamp-2 w-full px-0.5 text-[var(--ch-text)] ${
          dimmed ? "opacity-40" : ""
        }`}
      >
        {item.type === "file" ? `${stripMdExt(item.name)}.md` : item.name}
      </span>
    </>
  );
}

function clampZoom(z: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function fitScaleFor(vw: number, vh: number) {
  if (vw < 1 || vh < 1) return 1;
  return Math.min(vw / BOARD_W, vh / BOARD_H) * FIT_INSET;
}

function DesktopCanvas({
  items,
  folderId,
  folderTrail,
  selectedId,
  removePrompt,
  onSelect,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
  onOpenFile,
  onOpenFolder,
  onMoveItem,
  onCreateFile,
  onCreateFolder,
  onAddMdFile,
  onAddFolderFromPc,
  onNavigateUp,
  onNavigateTo,
  tabLimitHit,
}: {
  items: DesktopItem[];
  folderId: string | null;
  folderTrail: DesktopItem[];
  selectedId: string | null;
  removePrompt: RemovePrompt | null;
  onSelect: (id: string | null) => void;
  onRequestRemove: (id: string, x: number, y: number) => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onOpenFile: (item: DesktopItem) => void;
  onOpenFolder: (item: DesktopItem) => void;
  onMoveItem: (id: string, col: number, row: number) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  /** Pick existing .md from PC, then place on Home or a desktop folder. */
  onAddMdFile: () => void;
  /** Pick existing folder from PC, then place on Home or a desktop folder. */
  onAddFolderFromPc: () => void;
  onNavigateUp: () => void;
  onNavigateTo: (folderId: string | null) => void;
  tabLimitHit: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  /** Skip the click-to-deselect that would fire after a pan gesture. */
  const didPanRef = useRef(false);
  const bgObjectUrlRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  /** When true, scale tracks the viewport so the fixed board stays centered and fully visible. */
  const [fitMode, setFitMode] = useState(true);
  /** Absolute scale (1 = board CSS pixels). Used when not in fit mode. */
  const [manualZoom, setManualZoom] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bgMenuOpen, setBgMenuOpen] = useState(false);
  /** Absolute path of chosen desktop background image. */
  const [bgPath, setBgPath] = useState<string | null>(() =>
    typeof window !== "undefined" ? loadBgPath() : null
  );
  /** Frost intensity 0–100 (blur + wash over the board background). */
  const [frostAmount, setFrostAmount] = useState(() =>
    typeof window !== "undefined" ? loadBgFrostAmount() : 0
  );
  /** Color wash over the board (independent of frost). */
  const [tintColor, setTintColor] = useState(() =>
    typeof window !== "undefined" ? loadBgTintColor() : TINT_DEFAULT_COLOR
  );
  const [tintAmount, setTintAmount] = useState(() =>
    typeof window !== "undefined" ? loadBgTintAmount() : 0
  );
  /** Rain intensity 0–100. */
  const [rainAmount, setRainAmount] = useState(() =>
    typeof window !== "undefined" ? loadBgRainAmount() : 0
  );
  const [rainDir, setRainDir] = useState<RainDir>(() =>
    typeof window !== "undefined" ? loadBgRainDir() : "right"
  );
  /** Object URL for CSS background (loaded from bgPath). */
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  /** Empty-space grab-to-pan is active. */
  const [panning, setPanning] = useState(false);
  /** Free-drag ghost: board-local pixel position under cursor until drop snap. */
  const [dragging, setDragging] = useState<{
    id: string;
    x: number;
    y: number;
    grabOffsetX: number;
    grabOffsetY: number;
  } | null>(null);

  const visible = useMemo(
    () => items.filter((it) => it.parentId === folderId),
    [items, folderId]
  );

  const dragItem = dragging
    ? visible.find((it) => it.id === dragging.id) ?? null
    : null;

  const removeTarget = removePrompt
    ? items.find((it) => it.id === removePrompt.id) ?? null
    : null;

  const fitScale = useMemo(
    () => fitScaleFor(viewport.w, viewport.h),
    [viewport.w, viewport.h]
  );
  const scale = fitMode ? fitScale : manualZoom;
  const scaledW = BOARD_W * scale;
  const scaledH = BOARD_H * scale;
  const stageW = Math.max(viewport.w, scaledW);
  const stageH = Math.max(viewport.h, scaledH);
  const zoomPct = Math.round(scale * 100);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load background image bytes → object URL for the board
  useEffect(() => {
    let cancelled = false;
    if (bgObjectUrlRef.current) {
      URL.revokeObjectURL(bgObjectUrlRef.current);
      bgObjectUrlRef.current = null;
    }
    setBgUrl(null);
    if (!bgPath) return;

    void (async () => {
      try {
        const bytes = await readFileBytes(bgPath);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy], { type: mimeFromPath(bgPath) });
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        bgObjectUrlRef.current = url;
        setBgUrl(url);
      } catch (err) {
        console.warn("Could not load desktop background:", err);
        if (!cancelled) setBgUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (bgObjectUrlRef.current) {
        URL.revokeObjectURL(bgObjectUrlRef.current);
        bgObjectUrlRef.current = null;
      }
    };
  }, [bgPath]);

  // Keep icons on the fixed board (e.g. after migrating older layouts)
  useEffect(() => {
    for (const it of visible) {
      const clamped = clampGrid(it.col, it.row, BOARD_COLS, BOARD_ROWS);
      if (clamped.col !== it.col || clamped.row !== it.row) {
        onMoveItem(it.id, clamped.col, clamped.row);
      }
    }
  }, [visible, onMoveItem]);

  const pickBackground = useCallback(async () => {
    setBgMenuOpen(false);
    try {
      const paths = await pickFiles({ filters: IMAGE_FILTERS });
      const path = paths[0];
      if (!path) return;
      setBgPath(path);
      saveBgPath(path);
    } catch (err) {
      console.warn("Pick background failed:", err);
    }
  }, []);

  const clearBackground = useCallback(() => {
    setBgMenuOpen(false);
    setBgPath(null);
    saveBgPath(null);
  }, []);

  const setFrost = useCallback((amount: number) => {
    const n = clampFrostAmount(amount);
    setFrostAmount(n);
    saveBgFrostAmount(n);
  }, []);

  const setTintStrength = useCallback((amount: number) => {
    const n = clampFrostAmount(amount);
    setTintAmount(n);
    saveBgTintAmount(n);
  }, []);

  const setTintHue = useCallback((color: string) => {
    const hex = normalizeHexColor(color);
    setTintColor(hex);
    saveBgTintColor(hex);
  }, []);

  const setRain = useCallback((amount: number) => {
    const n = clampFrostAmount(amount);
    setRainAmount(n);
    saveBgRainAmount(n);
  }, []);

  const setRainDirection = useCallback((dir: RainDir) => {
    setRainDir(dir);
    saveBgRainDir(dir);
  }, []);

  const frostT = frostAmount / 100;
  const frostBlurPx = frostT * FROST_MAX_BLUR_PX;
  const frostWash = frostT * FROST_MAX_WASH;
  /** Expand the image under a blur so soft edges stay clipped inside the board. */
  const frostBleed = frostAmount > 0 ? Math.ceil(frostBlurPx * 2.2) : 0;
  const tintAlpha = (tintAmount / 100) * TINT_MAX_ALPHA;
  const tintCss =
    tintAmount > 0 ? hexToRgba(tintColor, tintAlpha) : "transparent";

  const applyZoom = useCallback((next: number) => {
    setFitMode(false);
    setManualZoom(clampZoom(next));
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      const base = fitMode ? fitScale : manualZoom;
      applyZoom(base + delta);
    },
    [fitMode, fitScale, manualZoom, applyZoom]
  );

  const zoomToFit = useCallback(() => {
    setFitMode(true);
  }, []);

  // Scroll wheel zooms the board (intercept so the viewport doesn't pan-scroll instead)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const base = fitMode ? fitScale : manualZoom;
      // Smooth trackpads send small deltas; step proportionally, snap to ZOOM_STEP min
      const raw = -e.deltaY;
      const steps =
        Math.sign(raw) *
        Math.max(ZOOM_STEP, Math.min(0.25, Math.abs(raw) / 400));
      applyZoom(base + steps);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fitMode, fitScale, manualZoom, applyZoom]);

  /** Map client pointer → board-local coords (accounts for scale + transform). */
  const clientToBoard = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const rect = board.getBoundingClientRect();
    const s = rect.width / BOARD_W || 1;
    return {
      x: (clientX - rect.left) / s,
      y: (clientY - rect.top) / s,
    };
  }, []);

  /**
   * Click-drag empty space (not an icon) to pan the viewport.
   * Icons stopPropagation on pointerdown, so their drags never reach here.
   */
  const handlePanPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore icon / control hits (icons also stopPropagation; belt-and-suspenders).
    if ((e.target as HTMLElement).closest("button")) return;

    const vp = viewportRef.current;
    if (!vp) return;

    e.preventDefault();
    setMenuOpen(false);
    setBgMenuOpen(false);
    onCancelRemove();

    const startX = e.clientX;
    const startY = e.clientY;
    const startScrollLeft = vp.scrollLeft;
    const startScrollTop = vp.scrollTop;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      didPanRef.current = true;
      setPanning(true);
      // Grab-style pan: content follows the cursor
      vp.scrollLeft = startScrollLeft - dx;
      vp.scrollTop = startScrollTop - dy;
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setPanning(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handlePointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    item: DesktopItem
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.id);
    setMenuOpen(false);
    setBgMenuOpen(false);
    onCancelRemove();

    const iconLeft = PAD + item.col * CELL_W;
    const iconTop = PAD + item.row * CELL_H;
    const start = clientToBoard(e.clientX, e.clientY);
    const grabOffsetX = start.x - iconLeft;
    const grabOffsetY = start.y - iconTop;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const local = clientToBoard(ev.clientX, ev.clientY);
      const dx = local.x - start.x;
      const dy = local.y - start.y;
      if (!moved && Math.hypot(dx, dy) < 5 / Math.max(scale, 0.01)) return;
      moved = true;
      onCancelRemove();
      const rawX = local.x - grabOffsetX;
      const rawY = local.y - grabOffsetY;
      const pos = clampGhostPos(rawX, rawY, BOARD_W, BOARD_H);
      setDragging({
        id: item.id,
        x: pos.x,
        y: pos.y,
        grabOffsetX,
        grabOffsetY,
      });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (moved) {
        const local = clientToBoard(ev.clientX, ev.clientY);
        const rawX = local.x - grabOffsetX;
        const rawY = local.y - grabOffsetY;
        const pos = clampGhostPos(rawX, rawY, BOARD_W, BOARD_H);
        const snapped = snapPoint(pos.x, pos.y, BOARD_COLS, BOARD_ROWS);
        const free = findFreeCell(
          items,
          folderId,
          BOARD_COLS,
          BOARD_ROWS,
          snapped,
          item.id
        );
        onMoveItem(item.id, free.col, free.row);
      }
      setDragging(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleDoubleClick = (item: DesktopItem) => {
    onCancelRemove();
    if (item.type === "folder") onOpenFolder(item);
    else onOpenFile(item);
  };

  const handleContextMenu = (
    e: ReactMouseEvent<HTMLButtonElement>,
    item: DesktopItem
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.id);
    setMenuOpen(false);
    onRequestRemove(item.id, e.clientX, e.clientY);
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Path strip */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--ch-text-faint)] border-b border-[var(--ch-border-faint)]">
        <button
          type="button"
          onClick={() => onNavigateTo(null)}
          className={`hover:text-[var(--ch-accent)] transition-colors ${
            folderId === null ? "text-[var(--ch-accent)]" : ""
          }`}
        >
          Desktop
        </button>
        {folderTrail.map((f) => (
          <span key={f.id} className="flex items-center gap-1.5">
            <span className="opacity-40">/</span>
            <button
              type="button"
              onClick={() => onNavigateTo(f.id)}
              className={`hover:text-[var(--ch-accent)] transition-colors ${
                folderId === f.id ? "text-[var(--ch-accent)]" : ""
              }`}
            >
              {f.name}
            </button>
          </span>
        ))}
        {folderId !== null && (
          <button
            type="button"
            onClick={onNavigateUp}
            className="ml-2 px-1.5 py-0.5 border border-[var(--ch-border-subtle)] rounded-sm hover:border-[var(--ch-border)] hover:text-[var(--ch-text)] transition-colors"
          >
            Up
          </button>
        )}
        {tabLimitHit && (
          <span className="ml-auto text-[var(--ch-warning)] normal-case tracking-normal">
            Tab limit ({MAX_TABS}) — close one to open more
          </span>
        )}
      </div>

      {/* Viewport + fixed board; zoom/center keeps even margins */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pt-2 pb-1 gap-1.5">
        <div
          ref={viewportRef}
          className={`relative flex-1 min-h-0 overflow-auto select-none rounded-sm border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-page)]/30 ${
            panning ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={handlePanPointerDown}
          onClick={() => {
            if (didPanRef.current) {
              didPanRef.current = false;
              return;
            }
            onSelect(null);
            onCancelRemove();
            setMenuOpen(false);
          }}
        >
          {/* Stage: at least viewport-sized so flex can center; grows when zoomed in */}
          <div
            className="relative flex items-center justify-center"
            style={{
              width: stageW || "100%",
              height: stageH || "100%",
              minWidth: "100%",
              minHeight: "100%",
            }}
          >
            {/*
              Layout box = scaled board size.
              Content is clipped inside; a thicker screen-space frame sits on top
              so rain/frost/blur hard-edges read as glass behind a window border
              instead of looking cut off.
            */}
            <div
              className="relative shrink-0"
              style={{
                width: scaledW || BOARD_W,
                height: scaledH || BOARD_H,
              }}
            >
              {/* Clip only the board surface (not the outer frame stroke) */}
              <div className="absolute inset-0 overflow-hidden rounded-md">
                <div
                  ref={boardRef}
                  className="absolute top-0 left-0 origin-top-left bg-[var(--ch-bg-base)]/40"
                  style={{
                    width: BOARD_W,
                    height: BOARD_H,
                    transform: `scale(${scale})`,
                  }}
                >
                {/* Clip layer: keeps filter:blur edges inside the board (no backdrop-filter bleed) */}
                <div
                  aria-hidden
                  className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
                >
                  {bgUrl && (
                    <div
                      className="absolute"
                      style={{
                        top: -frostBleed,
                        right: -frostBleed,
                        bottom: -frostBleed,
                        left: -frostBleed,
                        backgroundImage: `url(${bgUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        filter:
                          frostBlurPx > 0.05
                            ? `blur(${frostBlurPx.toFixed(2)}px)`
                            : undefined,
                      }}
                    />
                  )}
                  {/* Rain behind the glass: under frost wash */}
                  <RainOverlay amount={rainAmount} direction={rainDir} />
                  {frostAmount > 0 && (
                    <div
                      className="absolute inset-0 z-[1]"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--ch-bg-base) ${Math.round(
                          frostWash * 100
                        )}%, transparent)`,
                      }}
                    />
                  )}
                  {tintAmount > 0 && (
                    <div
                      className="absolute inset-0 z-[1]"
                      style={{ backgroundColor: tintCss }}
                    />
                  )}
                </div>
                {visible.map((item) => {
                  const isDragSource = dragging?.id === item.id;
                  const isSelected = selectedId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="absolute z-10"
                      style={{
                        left: PAD + item.col * CELL_W,
                        top: PAD + item.row * CELL_H,
                      }}
                    >
                      <button
                        type="button"
                        onPointerDown={(e) => handlePointerDown(e, item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDoubleClick(item);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex flex-col items-center gap-1 w-[84px] p-1 rounded-sm outline-none transition-colors ${
                          isSelected && !isDragSource
                            ? "bg-[var(--ch-accent-10)] ring-1 ring-[var(--ch-accent)]/40"
                            : "hover:bg-[var(--ch-bg-hover)]"
                        } ${isDragSource ? "cursor-grabbing" : "cursor-pointer"}`}
                        title={
                          item.type === "folder"
                            ? item.filePath || `${item.name} (folder)`
                            : item.filePath ||
                              `${displayName(item.name, item.type)}.md`
                        }
                      >
                        <DesktopIconFace item={item} dimmed={isDragSource} />
                      </button>
                    </div>
                  );
                })}

                {/* Free-floating drag ghost (board-local; scale applies via parent) */}
                {dragging && dragItem && (
                  <div
                    className="absolute z-30 pointer-events-none flex flex-col items-center gap-1 w-[84px] p-1 rounded-sm bg-[var(--ch-bg-base)]/80 shadow-xl ring-1 ring-[var(--ch-accent)]/50 backdrop-blur-sm"
                    style={{
                      left: dragging.x,
                      top: dragging.y,
                    }}
                  >
                    <DesktopIconFace item={dragItem} />
                  </div>
                )}

                {visible.length === 0 && (
                  <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
                    <p className="text-[12px] text-[var(--ch-text-faint)] italic text-center px-8">
                      Empty desktop — use + New to add notes, folders, or files
                      from your PC
                    </p>
                  </div>
                )}
                </div>
              </div>

              {/* Thick desktop frame — screen-space so it stays crisp at any zoom */}
              <div
                aria-hidden
                className="notes-desktop-frame absolute inset-0 z-20 pointer-events-none rounded-md"
              />
            </div>
          </div>

          {/* Remove prompt — portaled above every cloud/chrome layer */}
          {typeof document !== "undefined" &&
            removePrompt &&
            removeTarget &&
            createPortal(
              <div
                className="fixed inset-0 z-[99999]"
                onClick={onCancelRemove}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCancelRemove();
                }}
              >
                <div
                  role="dialog"
                  aria-label="Remove item"
                  className="fixed z-[100000] border border-[var(--ch-error-border)] bg-[var(--ch-error-bg)] rounded-sm shadow-2xl px-2.5 py-2 flex items-center gap-2 whitespace-nowrap pointer-events-auto"
                  style={{
                    left: Math.min(removePrompt.x, window.innerWidth - 320),
                    top: Math.min(removePrompt.y, window.innerHeight - 56),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <AlertTriangle className="w-3 h-3 text-[var(--ch-error)] shrink-0" />
                  <span className="text-[11px] text-[var(--ch-error-text)]">
                    Remove{" "}
                    {removeTarget.type === "file"
                      ? stripMdExt(removeTarget.name)
                      : removeTarget.name}
                    ?
                  </span>
                  <button
                    type="button"
                    className="px-2 py-0.5 border border-[var(--ch-error)] text-[var(--ch-error)] hover:bg-black/10 rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmRemove();
                    }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="px-2 py-0.5 border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-white/[0.06] rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelRemove();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>

        {/* + New + zoom controls below the viewport */}
        <div className="shrink-0 relative flex items-center gap-2 pl-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => {
              setBgMenuOpen(false);
              setMenuOpen((o) => !o);
            }}
            className="flex items-center gap-1.5 h-9 pl-2.5 pr-3.5 rounded-full bg-[var(--ch-accent)] text-black shadow-lg hover:brightness-110 transition-[filter] select-none"
            title="Add to desktop"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              New
            </span>
          </button>

          <div
            className="flex items-center gap-0.5 h-8 px-1 rounded-full border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)]/80"
            title="Desktop zoom — scroll wheel also works"
          >
            <button
              type="button"
              onClick={() => zoomBy(-ZOOM_STEP)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--ch-text-muted)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] transition-colors"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomToFit}
              className={`min-w-[3.25rem] h-7 px-1.5 text-[10px] font-mono tabular-nums rounded-sm transition-colors ${
                fitMode
                  ? "text-[var(--ch-accent)]"
                  : "text-[var(--ch-text-faint)] hover:text-[var(--ch-text)]"
              }`}
              title={fitMode ? "Fitted to view" : "Click to fit board in view"}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--ch-text-muted)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] transition-colors"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomToFit}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--ch-text-muted)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] transition-colors"
              title="Fit board in view"
              aria-label="Fit board in view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setBgMenuOpen((o) => !o);
              }}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full border transition-colors ${
                bgPath || frostAmount > 0 || tintAmount > 0 || rainAmount > 0
                  ? "border-[var(--ch-accent)]/50 text-[var(--ch-accent)] bg-[var(--ch-accent-10)]"
                  : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] bg-[var(--ch-bg-base)]/80 hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
              }`}
              title={
                bgPath
                  ? "Desktop background (image, frost, tint, rain)"
                  : "Desktop background"
              }
              aria-label="Desktop background"
              aria-expanded={bgMenuOpen}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono uppercase tracking-wider">
                Bg
              </span>
            </button>

            <AnimatedDropdown
              open={bgMenuOpen}
              originY="bottom"
              className="absolute bottom-full left-0 mb-1.5 min-w-[220px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-xl overflow-hidden z-40"
            >
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors"
                onClick={() => {
                  void pickBackground();
                }}
              >
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                {bgPath ? "Change image…" : "Choose image…"}
              </button>
              <div
                className="px-3 py-2.5 border-t border-[var(--ch-border-subtle)]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <CloudFog className="w-3.5 h-3.5 shrink-0 text-[var(--ch-text-muted)]" />
                  <span className="flex-1 text-[11px] font-mono text-[var(--ch-text)]">
                    Frosted
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-[var(--ch-text-faint)]">
                    {frostAmount}%
                  </span>
                </div>
                <div className="h-5 flex items-center">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={frostAmount}
                    onChange={(e) => setFrost(Number(e.target.value))}
                    className="ch-zoom-slider w-full"
                    aria-label="Frost intensity"
                    title="0 = sharp · 100 = max frost"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9px] font-mono uppercase tracking-wider text-[var(--ch-text-faint)]">
                  <span>Off</span>
                  <button
                    type="button"
                    className="hover:text-[var(--ch-accent)] transition-colors"
                    onClick={() =>
                      setFrost(frostAmount > 0 ? 0 : FROST_DEFAULT)
                    }
                  >
                    {frostAmount > 0 ? "Clear" : `Set ${FROST_DEFAULT}%`}
                  </button>
                  <span>Max</span>
                </div>
              </div>
              <div
                className="px-3 py-2.5 border-t border-[var(--ch-border-subtle)]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <PaintBucket className="w-3.5 h-3.5 shrink-0 text-[var(--ch-text-muted)]" />
                  <span className="flex-1 text-[11px] font-mono text-[var(--ch-text)]">
                    Tint
                  </span>
                  <label
                    className="relative w-5 h-5 rounded-sm border border-[var(--ch-border)] overflow-hidden shrink-0 cursor-pointer"
                    title="Pick tint color"
                  >
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: tintColor }}
                    />
                    <input
                      type="color"
                      value={normalizeHexColor(tintColor)}
                      onChange={(e) => {
                        setTintHue(e.target.value);
                        if (tintAmount === 0) {
                          setTintStrength(TINT_DEFAULT_AMOUNT);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      aria-label="Tint color"
                    />
                  </label>
                  <span className="text-[10px] font-mono tabular-nums text-[var(--ch-text-faint)] w-8 text-right">
                    {tintAmount}%
                  </span>
                </div>
                <div className="h-5 flex items-center">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={tintAmount}
                    onChange={(e) => setTintStrength(Number(e.target.value))}
                    className="ch-zoom-slider w-full"
                    aria-label="Tint strength"
                    title="0 = no tint · 100 = strong wash"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TINT_PRESETS.map((hex) => {
                    const active =
                      normalizeHexColor(tintColor) === hex && tintAmount > 0;
                    return (
                      <button
                        key={hex}
                        type="button"
                        title={hex}
                        onClick={() => {
                          setTintHue(hex);
                          if (tintAmount === 0) {
                            setTintStrength(TINT_DEFAULT_AMOUNT);
                          }
                        }}
                        className={`w-4 h-4 rounded-sm border transition-shadow ${
                          active
                            ? "border-[var(--ch-accent)] ring-1 ring-[var(--ch-accent)]/50"
                            : "border-[var(--ch-border-subtle)] hover:border-[var(--ch-border)]"
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={`Tint ${hex}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] font-mono uppercase tracking-wider text-[var(--ch-text-faint)]">
                  <span>Off</span>
                  <button
                    type="button"
                    className="hover:text-[var(--ch-accent)] transition-colors"
                    onClick={() =>
                      setTintStrength(
                        tintAmount > 0 ? 0 : TINT_DEFAULT_AMOUNT
                      )
                    }
                  >
                    {tintAmount > 0 ? "Clear" : `Set ${TINT_DEFAULT_AMOUNT}%`}
                  </button>
                  <span>Max</span>
                </div>
              </div>
              <div
                className="px-3 py-2.5 border-t border-[var(--ch-border-subtle)]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <CloudRain className="w-3.5 h-3.5 shrink-0 text-[var(--ch-text-muted)]" />
                  <span className="flex-1 text-[11px] font-mono text-[var(--ch-text)]">
                    Rain
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-[var(--ch-text-faint)]">
                    {rainAmount}%
                  </span>
                </div>
                <div className="h-5 flex items-center">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={rainAmount}
                    onChange={(e) => setRain(Number(e.target.value))}
                    className="ch-zoom-slider w-full"
                    aria-label="Rain intensity"
                    title="0 = dry · 100 = heavy rain"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9px] font-mono uppercase tracking-wider text-[var(--ch-text-faint)]">
                  <span>Off</span>
                  <button
                    type="button"
                    className="hover:text-[var(--ch-accent)] transition-colors"
                    onClick={() =>
                      setRain(rainAmount > 0 ? 0 : RAIN_DEFAULT)
                    }
                  >
                    {rainAmount > 0 ? "Clear" : `Set ${RAIN_DEFAULT}%`}
                  </button>
                  <span>Max</span>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ch-text-faint)] mr-1">
                    Dir
                  </span>
                  {(
                    [
                      {
                        id: "left" as const,
                        label: "Down-left",
                        Icon: ArrowDownLeft,
                      },
                      {
                        id: "straight" as const,
                        label: "Straight down",
                        Icon: ArrowDown,
                      },
                      {
                        id: "right" as const,
                        label: "Down-right",
                        Icon: ArrowDownRight,
                      },
                    ] as const
                  ).map(({ id, label, Icon }) => {
                    const active = rainDir === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={active}
                        onClick={() => setRainDirection(id)}
                        className={`flex-1 h-7 flex items-center justify-center rounded-sm border transition-colors ${
                          active
                            ? "border-[var(--ch-accent)] text-[var(--ch-accent)] bg-[var(--ch-accent-10)]"
                            : "border-[var(--ch-border-subtle)] text-[var(--ch-text-muted)] hover:text-[var(--ch-text)] hover:border-[var(--ch-border)]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              {bgPath && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-error)] transition-colors border-t border-[var(--ch-border-subtle)]"
                  onClick={clearBackground}
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  Remove background
                </button>
              )}
            </AnimatedDropdown>
          </div>

          <AnimatedDropdown
            open={menuOpen}
            originY="bottom"
            className="absolute bottom-full left-0 mb-1.5 min-w-[180px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-xl overflow-hidden z-40"
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors"
              onClick={() => {
                setMenuOpen(false);
                onCreateFile();
              }}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              New .md note
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors border-t border-[var(--ch-border-subtle)]"
              onClick={() => {
                setMenuOpen(false);
                onAddMdFile();
              }}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              Add .md file…
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors border-t border-[var(--ch-border-subtle)]"
              onClick={() => {
                setMenuOpen(false);
                onAddFolderFromPc();
              }}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              Add folder from PC…
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors border-t border-[var(--ch-border-subtle)]"
              onClick={() => {
                setMenuOpen(false);
                onCreateFolder();
              }}
            >
              <FolderPlus className="w-3.5 h-3.5 shrink-0" />
              New folder
            </button>
          </AnimatedDropdown>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Note editor                                                        */
/* ------------------------------------------------------------------ */

function NoteEditorPane({
  item,
  onChange,
}: {
  item: DesktopItem;
  onChange: (patch: Partial<Pick<DesktopItem, "name" | "body">>) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-[var(--ch-accent)] shrink-0" />
        <input
          type="text"
          value={stripMdExt(item.name)}
          onChange={(e) => onChange({ name: e.target.value.trim() || "Untitled" })}
          className="flex-1 bg-transparent text-[12px] font-mono text-[var(--ch-accent)] placeholder:text-[var(--ch-text-faint)] focus:outline-none"
          placeholder="Note title"
        />
        <span className="text-[9px] uppercase tracking-widest font-mono text-[var(--ch-text-faint)]">
          .md
        </span>
      </div>
      <textarea
        value={item.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Write markdown…"
        spellCheck={false}
        className="flex-1 w-full min-h-0 bg-[var(--ch-bg-page)] text-[12px] font-mono text-[var(--ch-text)] placeholder:text-[var(--ch-border)] p-4 resize-none focus:outline-none leading-relaxed"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main NotesTab                                                      */
/* ------------------------------------------------------------------ */

export function NotesTab() {
  const [items, setItems] = useState<DesktopItem[]>(() =>
    typeof window !== "undefined" ? loadDesktopItems() : []
  );
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removePrompt, setRemovePrompt] = useState<RemovePrompt | null>(null);
  /** Open document tab ids only — titles come from `items`. */
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [tabLimitHit, setTabLimitHit] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{
    type: ItemType;
  } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  /** After picking/creating file(s): where on the notes desktop to place them. */
  const [placePrompt, setPlacePrompt] = useState<PlacePrompt | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const persistReady = useRef(false);
  const bodySaveTimer = useRef<number | null>(null);

  useEffect(() => {
    // Skip the first paint so we don't rewrite storage with SSR empty state.
    if (!persistReady.current) {
      persistReady.current = true;
      // Persist a one-time migration from notes-v1 / snippets-v1.
      try {
        if (
          items.length > 0 &&
          !window.localStorage.getItem(STORAGE_DESKTOP)
        ) {
          saveDesktopItems(items);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    saveDesktopItems(items);
  }, [items]);

  useEffect(() => {
    if (!namePrompt) return;
    const t = window.setTimeout(() => nameInputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [namePrompt]);

  const openTabs: OpenDocTab[] = useMemo(() => {
    const out: OpenDocTab[] = [];
    for (const id of openTabIds) {
      const item = items.find((i) => i.id === id && i.type === "file");
      if (item) out.push({ id: item.id, title: item.name });
    }
    return out;
  }, [openTabIds, items]);

  const resolvedActiveTabId = useMemo(() => {
    if (activeTabId === HOME_TAB_ID) return HOME_TAB_ID;
    if (openTabs.some((t) => t.id === activeTabId)) return activeTabId;
    return HOME_TAB_ID;
  }, [activeTabId, openTabs]);

  const folderTrail = useMemo(() => {
    const trail: DesktopItem[] = [];
    let cur = folderId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      const folder = items.find((i) => i.id === cur && i.type === "folder");
      if (!folder) break;
      trail.unshift(folder);
      cur = folder.parentId;
    }
    return trail;
  }, [items, folderId]);

  const activeFile = useMemo(() => {
    if (resolvedActiveTabId === HOME_TAB_ID) return null;
    return (
      items.find((i) => i.id === resolvedActiveTabId && i.type === "file") ??
      null
    );
  }, [items, resolvedActiveTabId]);

  const openFile = useCallback(async (item: DesktopItem) => {
    if (item.type !== "file") return;
    // Refresh body from disk when backed by a real path
    if (item.filePath) {
      try {
        const content = await readFileText(item.filePath);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, body: content, updatedAt: Date.now() }
              : it
          )
        );
      } catch (err) {
        console.warn("Could not reload note from disk:", err);
      }
    }
    setOpenTabIds((prev) => {
      if (prev.includes(item.id)) {
        setActiveTabId(item.id);
        setTabLimitHit(false);
        return prev;
      }
      if (prev.length >= MAX_DOC_TABS) {
        setTabLimitHit(true);
        return prev;
      }
      setActiveTabId(item.id);
      setTabLimitHit(false);
      return [...prev, item.id];
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setOpenTabIds((prev) => prev.filter((tid) => tid !== id));
    setTabLimitHit(false);
    setActiveTabId((cur) => (cur === id ? HOME_TAB_ID : cur));
  }, []);

  const moveItem = useCallback((id: string, col: number, row: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, col, row, updatedAt: Date.now() } : it
      )
    );
  }, []);

  const updateItem = useCallback(
    (id: string, patch: Partial<Pick<DesktopItem, "name" | "body">>) => {
      setItems((prev) => {
        const current = prev.find((it) => it.id === id);
        if (!current) return prev;
        const nextItem = { ...current, ...patch, updatedAt: Date.now() };
        if (patch.name !== undefined && current.type === "file") {
          nextItem.name = stripMdExt(patch.name) || "Untitled";
        }
        // Debounced write to disk when body changes and path exists
        if (
          patch.body !== undefined &&
          current.filePath &&
          current.type === "file"
        ) {
          if (bodySaveTimer.current != null) {
            window.clearTimeout(bodySaveTimer.current);
          }
          const path = current.filePath;
          const body = nextItem.body;
          bodySaveTimer.current = window.setTimeout(() => {
            bodySaveTimer.current = null;
            writeFileText(path, body).catch((err) => {
              console.warn("Failed to write note to disk:", err);
            });
          }, 400);
        }
        return prev.map((it) => (it.id === id ? nextItem : it));
      });
    },
    []
  );

  const addDesktopItem = useCallback(
    (partial: Omit<DesktopItem, "col" | "row" | "createdAt" | "updatedAt"> & {
      parentId?: string | null;
    }) => {
      setItems((prev) => {
        const parent =
          partial.parentId !== undefined ? partial.parentId : folderId;
        const cell = findFreeCell(prev, parent, BOARD_COLS, BOARD_ROWS);
        const now = Date.now();
        return [
          ...prev,
          {
            ...partial,
            parentId: parent,
            col: cell.col,
            row: cell.row,
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
    },
    [folderId]
  );

  /** All desktop folders (for placement picker). */
  const desktopFolders = useMemo(
    () => items.filter((it) => it.type === "folder"),
    [items]
  );

  /**
   * New .md note:
   * 1) Save dialog → real path on PC
   * 2) Place picker → Home or a desktop folder
   */
  const createMarkdownOnDisk = useCallback(async () => {
    try {
      const savePath = await pickSavePath({
        defaultName: "Untitled.md",
        title: "Save new note on your PC",
        filters: [
          { name: "Markdown", extensions: ["md", "markdown"] },
          { name: "Text", extensions: ["txt"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!savePath) return;
      const name = basenameNoExt(savePath);
      const body = `# ${name}\n\n`;
      await writeFileText(savePath, body);
      setPlacePrompt({
        items: [{ kind: "file", path: savePath, name, body }],
        defaultParentId: folderId,
      });
    } catch (err) {
      console.warn("Create markdown failed:", err);
    }
  }, [folderId]);

  /**
   * Add existing .md from PC:
   * 1) Pick file(s)
   * 2) Place picker → Home or a desktop folder (links path, no copy)
   */
  const addMdFromPc = useCallback(async () => {
    try {
      const sources = await pickFiles({
        filters: [
          { name: "Markdown", extensions: ["md", "markdown"] },
          { name: "Text", extensions: ["txt", "text"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!sources.length) return;

      const items: PlaceItem[] = [];
      for (const filePath of sources) {
        const name = basenameNoExt(filePath);
        let body = "";
        try {
          body = await readFileText(filePath);
        } catch (err) {
          console.warn("Could not read file:", filePath, err);
          body = "";
        }
        items.push({ kind: "file", path: filePath, name, body });
      }
      if (!items.length) return;
      setPlacePrompt({ items, defaultParentId: folderId });
    } catch (err) {
      console.warn("Add .md failed:", err);
    }
  }, [folderId]);

  /**
   * Add existing folder from PC:
   * 1) Select Folder dialog
   * 2) Place picker → Home or a desktop folder
   */
  const addFolderFromPc = useCallback(async () => {
    try {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 40);
      });
      const dir = await pickFolder({
        title: "Select Folder",
        buttonLabel: "Select Folder",
        updateWorkingDir: false,
      });
      if (!dir) return;
      const name = dir.split(/[/\\]/).pop() || "Folder";
      setPlacePrompt({
        items: [{ kind: "folder", path: dir, name, body: "" }],
        defaultParentId: folderId,
      });
    } catch (err) {
      console.warn("Add folder from PC failed:", err);
    }
  }, [folderId]);

  const commitPlace = useCallback(
    (parentId: string | null) => {
      if (!placePrompt) return;
      for (const item of placePrompt.items) {
        if (item.kind === "folder") {
          addDesktopItem({
            id: uid("folder"),
            type: "folder",
            name: item.name,
            body: "",
            filePath: item.path,
            parentId,
          });
        } else {
          addDesktopItem({
            id: uid("note"),
            type: "file",
            name: item.name,
            body: item.body,
            filePath: item.path,
            parentId,
          });
        }
      }
      setPlacePrompt(null);
    },
    [placePrompt, addDesktopItem]
  );

  /** New folder — name, then OS location to create it on disk; always lands on desktop. */
  const requestCreateFolder = useCallback(() => {
    setNameDraft("New folder");
    setNamePrompt({ type: "folder" });
  }, []);

  const commitCreateFolder = useCallback(async () => {
    if (!namePrompt || namePrompt.type !== "folder") return;
    const name = nameDraft.trim() || "New folder";
    // Close in-app modal first so Windows can focus the native picker
    setNamePrompt(null);
    setNameDraft("");
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 80);
    });

    let filePath: string | null = null;
    try {
      const parent = await pickFolder({
        title: "Select Folder",
        buttonLabel: "Select Folder",
        updateWorkingDir: false,
      });
      if (parent) {
        const dirPath = joinPath(parent, name);
        try {
          filePath = await makeDir(dirPath);
        } catch (err) {
          console.warn("mkdir failed, creating desktop-only folder:", err);
          filePath = null;
        }
      }
    } catch (err) {
      console.warn("Folder location pick failed:", err);
    }

    addDesktopItem({
      id: uid("folder"),
      type: "folder",
      name,
      body: "",
      filePath,
      parentId: folderId,
    });
  }, [namePrompt, nameDraft, addDesktopItem, folderId]);

  const cancelCreate = useCallback(() => {
    setNamePrompt(null);
    setNameDraft("");
  }, []);

  const onOpenFolder = useCallback((item: DesktopItem) => {
    if (item.type !== "folder") return;
    setFolderId(item.id);
    setSelectedId(null);
    setRemovePrompt(null);
  }, []);

  const onNavigateTo = useCallback((id: string | null) => {
    setFolderId(id);
    setSelectedId(null);
    setRemovePrompt(null);
  }, []);

  const onNavigateUp = useCallback(() => {
    setFolderId((cur) => {
      if (!cur) return null;
      const folder = items.find((i) => i.id === cur);
      return folder?.parentId ?? null;
    });
    setSelectedId(null);
    setRemovePrompt(null);
  }, [items]);

  const confirmRemove = useCallback(() => {
    if (!removePrompt) return;
    const id = removePrompt.id;
    setItems((prev) => {
      const drop = new Set<string>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const it of prev) {
          if (it.parentId && drop.has(it.parentId) && !drop.has(it.id)) {
            drop.add(it.id);
            grew = true;
          }
        }
      }
      queueMicrotask(() => {
        setOpenTabIds((tabs) => tabs.filter((tid) => !drop.has(tid)));
      });
      return prev.filter((it) => !drop.has(it.id));
    });
    setSelectedId((cur) => (cur === id ? null : cur));
    setRemovePrompt(null);
  }, [removePrompt]);

  const stopPromptClick = useCallback((e: ReactMouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="relative h-full min-h-0 flex flex-col bg-transparent overflow-hidden">
      <NotesTabBar
        openTabs={openTabs}
        activeId={resolvedActiveTabId}
        onSelect={setActiveTabId}
        onClose={closeTab}
        canOpenMore={openTabs.length < MAX_DOC_TABS}
      />

      {resolvedActiveTabId === HOME_TAB_ID || !activeFile ? (
        <DesktopCanvas
          items={items}
          folderId={folderId}
          folderTrail={folderTrail}
          selectedId={selectedId}
          removePrompt={removePrompt}
          onSelect={(id) => {
            setSelectedId(id);
            if (id === null) setRemovePrompt(null);
          }}
          onRequestRemove={(id, x, y) => {
            setSelectedId(id);
            setRemovePrompt({ id, x, y });
          }}
          onConfirmRemove={confirmRemove}
          onCancelRemove={() => setRemovePrompt(null)}
          onOpenFile={(item) => {
            void openFile(item);
          }}
          onOpenFolder={onOpenFolder}
          onMoveItem={moveItem}
          onCreateFile={() => {
            void createMarkdownOnDisk();
          }}
          onCreateFolder={requestCreateFolder}
          onAddMdFile={() => {
            void addMdFromPc();
          }}
          onAddFolderFromPc={() => {
            void addFolderFromPc();
          }}
          onNavigateUp={onNavigateUp}
          onNavigateTo={onNavigateTo}
          tabLimitHit={tabLimitHit}
        />
      ) : (
        <NoteEditorPane
          item={activeFile}
          onChange={(patch) => updateItem(activeFile.id, patch)}
        />
      )}

      {/* Folder name → then OS parent directory (optional) → always adds desktop folder */}
      {namePrompt && (
        <div
          className="absolute inset-0 z-[99990] flex items-center justify-center bg-black/40"
          onClick={cancelCreate}
        >
          <div
            className="w-[min(360px,90%)] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-2xl p-4"
            onClick={stopPromptClick}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)] mb-2">
              New folder
            </div>
            <p className="text-[11px] text-[var(--ch-text-faint)] mb-2">
              Name it, then optionally pick a PC folder to create it under.
              Canceling the PC picker still creates the folder on this desktop.
            </p>
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitCreateFolder();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
              className="w-full bg-[var(--ch-bg-page)] border border-[var(--ch-border-subtle)] rounded-sm px-2.5 py-2 text-[12px] font-mono text-[var(--ch-text)] focus:outline-none focus:border-[var(--ch-accent)]/50"
              placeholder="Folder name"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelCreate}
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)] rounded-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void commitCreateFolder();
                }}
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono border border-[var(--ch-accent)] text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] rounded-sm"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Place on notes desktop: Home or a folder within */}
      {placePrompt && (
        <div
          className="absolute inset-0 z-[99990] flex items-center justify-center bg-black/40"
          onClick={() => setPlacePrompt(null)}
        >
          <div
            className="w-[min(380px,92%)] max-h-[70vh] flex flex-col border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm shadow-2xl overflow-hidden"
            onClick={stopPromptClick}
          >
            <div className="px-4 py-3 border-b border-[var(--ch-border-subtle)]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
                Place on desktop
              </div>
              <p className="text-[11px] text-[var(--ch-text-faint)] mt-1">
                {placePrompt.items.length === 1
                  ? `Where should “${placePrompt.items[0].name}” go?`
                  : `Where should these ${placePrompt.items.length} items go?`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => commitPlace(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors"
              >
                <Home className="w-4 h-4 shrink-0 text-[var(--ch-accent)]" />
                Home (desktop root)
              </button>
              {desktopFolders.length > 0 && (
                <div className="mt-1 pt-1 border-t border-[var(--ch-border-subtle)]">
                  <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
                    Folders
                  </div>
                  {desktopFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => commitPlace(f.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-mono rounded-sm hover:bg-[var(--ch-bg-hover)] hover:text-[var(--ch-accent)] transition-colors"
                    >
                      <Folder className="w-4 h-4 shrink-0 text-[var(--ch-accent)]" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {desktopFolders.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-[var(--ch-text-faint)] italic">
                  No folders yet — place on Home, or create a folder first.
                </p>
              )}
            </div>
            <div className="px-4 py-2 border-t border-[var(--ch-border-subtle)] flex justify-end">
              <button
                type="button"
                onClick={() => setPlacePrompt(null)}
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono border border-[var(--ch-border)] text-[var(--ch-text-muted)] hover:bg-[var(--ch-bg-hover)] rounded-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

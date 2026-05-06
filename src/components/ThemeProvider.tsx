"use client";

import { createContext, useContext, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Theme registry                                                     */
/*  To add a new theme: create src/themes/<id>.css, import it in      */
/*  globals.css, then add one entry here. Nothing else needs changing. */
/* ------------------------------------------------------------------ */
export const THEMES = [
  { id: "daylight-dark", label: "Daylight Dark", mode: "dark" },
  { id: "shadow-fog", label: "Shadow Fog", mode: "dark" },
  { id: "midnight", label: "Midnight", mode: "dark" },
  { id: "aurora-ember", label: "Aurora Ember", mode: "dark" },
  { id: "copper-violet", label: "Copper Violet", mode: "dark" },
  { id: "harbor-dusk", label: "Harbor Dusk", mode: "dark" },
  { id: "sunlit-canvas", label: "Sunlit Canvas", mode: "light" },
  { id: "parchment-warm", label: "Parchment Warm", mode: "light" },
  { id: "morning-mist", label: "Morning Mist", mode: "light" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "ch-theme";
const DEFAULT_THEME: ThemeId = "midnight";

/* ------------------------------------------------------------------ */
/*  Layout registry                                                    */
/*  "foundations" = original minimalist column layout                  */
/*  "clouds"      = floating bubble layout (see CloudsLayout.tsx)      */
/* ------------------------------------------------------------------ */
export const LAYOUTS = [
  { id: "foundations", label: "Foundations" },
  { id: "clouds", label: "Clouds" },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];

const LAYOUT_STORAGE_KEY = "ch-layout";
const DEFAULT_LAYOUT: LayoutId = "foundations";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */
interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  layout: LayoutId;
  setLayout: (id: LayoutId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  layout: DEFAULT_LAYOUT,
  setLayout: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [layout, setLayoutState] = useState<LayoutId>(DEFAULT_LAYOUT);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && THEMES.some((t) => t.id === saved)) {
        setThemeState(saved);
        document.documentElement.setAttribute("data-theme", saved);
      } else {
        document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
      }
    } catch {
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
    }

    try {
      const savedLayout = window.localStorage.getItem(
        LAYOUT_STORAGE_KEY
      ) as LayoutId | null;
      if (savedLayout && LAYOUTS.some((l) => l.id === savedLayout)) {
        setLayoutState(savedLayout);
        document.documentElement.setAttribute("data-layout", savedLayout);
      } else {
        document.documentElement.setAttribute("data-layout", DEFAULT_LAYOUT);
      }
    } catch {
      document.documentElement.setAttribute("data-layout", DEFAULT_LAYOUT);
    }
  }, []);

  const setTheme = (id: ThemeId) => {
    setThemeState(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore storage errors
    }
  };

  const setLayout = (id: LayoutId) => {
    setLayoutState(id);
    document.documentElement.setAttribute("data-layout", id);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, id);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, layout, setLayout }}>
      {children}
    </ThemeContext.Provider>
  );
}

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
/*  Context                                                            */
/* ------------------------------------------------------------------ */
interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

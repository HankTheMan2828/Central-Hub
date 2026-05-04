# CentralHub Theme System

## How to create a new theme

1. **Copy `_template.css`** and rename it (e.g. `ocean-dark.css`).
2. **Fill in all the variable values** — every `/* REQUIRED */` token must have a value.
3. **Import your file in `globals.css`** — add one line:
   ```css
   @import "../themes/ocean-dark.css";
   ```
4. **Register the theme name** — open `src/components/ThemeProvider.tsx` and add your theme
   to the `THEMES` array at the top of the file:
   ```ts
   export const THEMES = [
     { id: "midnight",      label: "Midnight" },
     { id: "daylight-dark", label: "Daylight Dark" },
     { id: "ocean-dark",    label: "Ocean Dark" },   // <-- add this
   ] as const;
   ```
5. Done. The theme selector in Settings will now list your theme.

No other files need to change.

---

## Token reference

Every theme must define **all** of the following CSS custom properties under a
`[data-theme="your-id"]` selector (and optionally under `:root` as a fallback).

| Token | Controls |
|---|---|
| `--ch-bg-page` | Body/root background (used for gradient or solid fill) |
| `--ch-bg-base` | Main panel backgrounds (LeftNav, tab panels) |
| `--ch-bg-surface` | Slightly elevated surfaces (modals, dropdowns) |
| `--ch-bg-elevated` | Input fields, slightly raised cards |
| `--ch-bg-inset` | Deep recessed areas (tool outputs, code blocks) |
| `--ch-bg-hover` | Hover state overlay background |
| `--ch-border` | Main panel borders |
| `--ch-border-subtle` | Inner dividers between sections |
| `--ch-border-faint` | Very faint separators / background borders |
| `--ch-text` | Primary body text |
| `--ch-text-muted` | Secondary / de-emphasised text |
| `--ch-text-faint` | Labels, placeholders, very low-contrast text |
| `--ch-accent` | Primary accent colour (used for active states, icons, headings) |
| `--ch-accent-10` | Accent at ~10% opacity — used for highlight backgrounds |
| `--ch-accent-5` | Accent at ~5% opacity — used for very subtle highlights |
| `--ch-success` | Success / confirmed state (green family) |
| `--ch-error` | Error / destructive state (red family) |
| `--ch-error-bg` | Error message background |
| `--ch-error-border` | Error message border |
| `--ch-error-text` | Muted error body text |
| `--ch-warning` | Warning / in-progress state (amber/orange family) |
| `--ch-code-bg` | Inline and fenced code block background |
| `--ch-code-text` | Inline code text colour |
| `--ch-link` | Hyperlink colour |
| `--ch-link-hover` | Hyperlink hover colour |
| `--ch-gold` | Gold colour for starred/favourite items |
| `--ch-wallpaper` | Background image (`none` or `url(...)`) |

---

## Design guidance for dark themes

Both built-in themes are dark. If you are creating a **new dark theme**:

- Keep `--ch-bg-page` dark enough that the app does not feel "washed out".
- Ensure text-on-base contrast ratio is ≥ 4.5:1 (WCAG AA).
- Accent colours should pop against `--ch-bg-base` — test it at actual screen brightness.
- For **bright-environment** themes, raise backgrounds toward `#1a1a1a`–`#2a2a2a` instead
  of pure black, and use fully saturated accent and success colours.
- For **custom wallpaper** support, panels use `--ch-pane-bg` which is set to a
  semi-transparent version of `--ch-bg-base`. Individual pane transparency can be
  tuned by overriding `--ch-pane-opacity` (0 = fully transparent, 1 = fully opaque).

---

## AI prompt template

If you are an AI assistant creating a new theme, here is the minimal prompt:

> "Create a `[name].css` file in `src/themes/`. Use the `_template.css` file as your
> guide — fill in every `/* REQUIRED */` token with your chosen colour values. The
> theme id in the selector must match the filename (without `.css`). Then add one
> `@import` line to `globals.css` and add one entry to the `THEMES` array in
> `ThemeProvider.tsx`. Do not touch any other files."

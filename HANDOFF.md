# CentralHub Frontend — Handoff

Last touched: 2026-04-29. Read this before doing anything in `frontend/`.

## Recently shipped (Phase 1-5 of the Claude-Design refactor)

- **STT rewrite** — replaced ScriptProcessorNode chain.
  - New `public/stt-worklet.js` (AudioWorkletProcessor)
  - New `src/hooks/useSTT.ts` (callbacks: `onPartial(text)`, `onLevels(number[])`)
  - Rewritten `src/app/stt.worker.ts` — distinct progress events (initiate / download / progress / done / ready), `MIN_AUDIO_SAMPLES = 1600` guard
  - Capture branch (source → workletNode, NOT connected to destination, no feedback) runs parallel to a dead-end analyser branch used only for visualizer
  - Transcribed text inserts at cursor in textarea via `setRangeText(insertion, start, end, "end")`, never overwrites

- **LeftNav shell** — `src/components/LeftNav.tsx`. Five tabs: Chat, Docs Area, Typing, Search, Snippets. Active-tab "curves into" the pane via `bg-[#0a0a0a] -mr-2 pr-5 z-10`.

- **Tab MVPs** in `src/components/tabs/`:
  - `SearchTab.tsx` — Brave Search, up to 8 tabs, 30-day localStorage TTL, click result → `shell.openExternal`, HTML stripped from descriptions
  - `SnippetsTab.tsx` — title/body/tags, search filter, copy-to-clipboard, two-click delete, cap 500
  - `TypingTab.tsx` — 15/30/60s modes, live WPM + accuracy, best WPM per mode persisted, Tab to restart
  - `WordTab.tsx` — Docs Area contentEditable rich editor, toolbar (bold/italic/underline/H1/H2/UL/OL/quote/undo/redo), autosave (600ms debounce). AI sidebar copies templated prompts to clipboard — no live streaming yet (see gotcha #1)

- **Brave Search IPC** in `main.js`: `brave:set-key`, `brave:get-status`, `brave:search`. Key held in runtime + localStorage. Settings UI in `page.tsx`.

## Architecture — read these first, do not duplicate

- `frontend/AGENTS.md` — PI SDK rules, hot-edit-guard, never spawn `pi` as CLI
- `frontend/PI_SDK_INTEGRATION.md` — every PI object, event, pattern

## Gotchas you WILL hit

1. **PI session is singleton.** `usePiChat` registers a global `pi:event` listener and exposes one PI session. A second `usePiChat` instance crosstalks, and its unmount calls `removeAllListeners("pi:event")` which clobbers chat. To support per-tab AI streaming, add a `requestId` to `pi:prompt` and tag every `pi:event` with it; renderer filters by id. This blocks WordTab live AI streaming (Polish item F).

2. **`document.execCommand` is deprecated** but used in `WordTab.tsx` for rich text. Known quirks: `formatBlock H1` does not toggle off on a second click; selection spanning multiple blocks behaves oddly. Acceptable for MVP. If WordTab grows, migrate to TipTap or ProseMirror rather than patching execCommand.

3. **Next.js dev overlay catches `console.error` as runtime errors.** Use `console.warn` for non-fatal logs from renderer code. Caught us once on Brave key save in `page.tsx`.

4. **Renderer IPC pattern** — `nodeIntegration: true`, `contextIsolation: false`, no preload. Always:
   ```ts
   const electron = (0, eval)("require")("electron");
   electron.ipcRenderer.invoke(channel, ...args);
   ```

5. **New Brave / IPC handlers require Electron restart in dev.** If you add an `ipcMain.handle(...)` in `main.js` while the app is running, the renderer will get "no handler registered" until you restart. UI in `page.tsx` surfaces this hint already.

6. **Hot-edit-guard** — before editing `main.js`, `package.json`, or `.pi/extensions/*`: verify guard is loaded (`[hot-edit-guard] Loaded` in console) or create a manual checkpoint first: `git branch -f ai-safety-rollbacks HEAD`.

## File map (added or touched in this refactor)

```
frontend/
  main.js                                    (modified: brave:* handlers)
  public/stt-worklet.js                      (new)
  src/
    hooks/
      useSTT.ts                              (new)
      usePiChat.ts                           (untouched)
    app/
      stt.worker.ts                          (rewritten)
      page.tsx                               (heavily modified, ~1830 lines, chat JSX still inline)
    components/
      LeftNav.tsx                            (new)
      tabs/
        SearchTab.tsx                        (new)
        SnippetsTab.tsx                      (new)
        TypingTab.tsx                        (new)
        WordTab.tsx                          (new)
```

## localStorage keys in use

| Key                        | Owner            | Notes                          |
|----------------------------|------------------|--------------------------------|
| `search-tabs-v1`           | SearchTab        | TTL 30 days, max 8 tabs        |
| `snippets-v1`              | SnippetsTab      | Cap 500                        |
| `typing-best-v1`           | TypingTab        | Best WPM per mode id           |
| `word-doc-v1`              | WordTab          | Single doc only — see deferred |
| `centralhub-model-prefs`   | usePiChat        | favorites + blocked model keys |

## Polish menu (Henry's preferred next pass: A + B + D bundled)

| ID | Item                                                                   | Effort | Risk                            |
|----|------------------------------------------------------------------------|--------|---------------------------------|
| A  | Active toolbar state in WordTab (B/I/U/H1/list highlight at cursor)    | low    | none                            |
| B  | Multi-document sidebar in WordTab (list, new/rename/delete, per-doc autosave) | medium | none                       |
| C  | Find & Replace (Ctrl+F) in WordTab                                     | medium | none                            |
| D  | Export to Markdown from WordTab                                        | low    | none                            |
| E  | Link insertion (Ctrl+K) in WordTab                                     | low    | none                            |
| F  | Real-time AI streaming in WordTab                                      | high   | touches `main.js` (hot-edit)    |

## Explicit deferred work

- **ChatTab extraction** — chat JSX (~900 lines) is still inline in `page.tsx` behind `activeTab === "chat"`. Move to `src/components/tabs/ChatTab.tsx` and pass props/state through.
- **Docs Area live AI** — gated on PI multiplex (Polish item F).
- **Docs Area multi-doc** — currently single-doc, single localStorage key.

## 2026-05-06 — Clouds layout shell

Replaced the scaffolded Clouds placeholder with a floating cloud shell in `src/components/CloudsLayout.tsx` and routed active tab content from `src/app/page.tsx` into left/main/right slots. Clouds now uses a small rectangular Menu cloud plus a circular settings button; the Menu opens a floating nav cloud and the settings button opens the existing settings modal. Chat/plain uses main chat plus the existing metrics/history side cloud, coding/search/typing/snippets use the centered main cloud, and Docs Area uses shorter left/right clouds for Saves and AI Assist around the larger centered editor cloud. `src/components/tabs/WordTab.tsx` now supports optional portal targets for those Docs side clouds, and `src/components/LeftNav.tsx` can hide Docs sub-options in the Clouds menu while preserving Foundations unchanged. Notable: `npx.cmd tsc --noEmit` passed; focused ESLint passes for `CloudsLayout.tsx` and `LeftNav.tsx`, while broader focused lint still hits pre-existing `page.tsx` explicit-any and `WordTab` effect-rule debt.

Final polish on the same branch keeps the Clouds main bubble visually centered by reserving symmetric side grid space even when only one side cloud is visible. The main bubble was widened/tallened enough for the Docs letter page without horizontal scrolling, and the side clouds were kept shorter with a compact Saves list treatment in `src/components/tabs/wordtab/SavesView.tsx`. Main-cloud inner boxes, Chat tab titles, and the Clouds menu panels now share a consistent rounded corner radius scoped to `data-layout="clouds"` so Foundations remains unchanged. Latest checks used: `npx.cmd tsc --noEmit` and focused `npx.cmd eslint src/components/CloudsLayout.tsx`.

## 2026-05-07 — Clouds vertical centering, dropdown unification, AI Search 3-cloud layout

Fixed the Clouds vertical centering bug in `src/components/CloudsLayout.tsx` — the cluster sat above visual center because the grid carried `padding-bottom: var(--clouds-shadow-gutter)` while the stage centered on the margin-box, so the gutter pulled panels up. Subtracted the shadow-gutter from `--clouds-stage-bottom` (both balanced and focus modes) to bring the cluster to true vertical center; main-height grew by ~3.2rem as a side-effect (panels now fill the recovered space symmetrically). Unified the small "internal selection" dropdowns to match the Agent Coding composer pattern by adding the `clouds-coding-dropdown-button` and `clouds-coding-dropdown-panel` class hooks to the WordTab AI model picker (`src/components/tabs/wordtab/AIPanel.tsx`), the Export / Page Size / Page Color dropdowns in `src/components/tabs/wordtab/EditorView.tsx`, and a new button-based "Present" dropdown that replaces the native `<select>` in `src/components/tabs/SearchTab.tsx`. Hooks are no-ops outside Clouds so Workbench is unchanged.

Added a third layout shape so AI Search has its own silhouette: `src/components/CloudsLayout.tsx` now supports optional `mainStackTop` / `mainStackBottom` props that render the center column as a stack of two clouds, and a single `right` cloud automatically picks up `clouds-main-height` when a main stack is present so it lines up with the entire stack. `src/components/tabs/SearchTab.tsx` accepts new optional `topPortalId` / `bottomPortalId` / `deskPortalId` props — when all three are present it splits its render into three sections (header + tabs + input → top, results → bottom, Search Desk aside → right) via `createPortal`, mirroring the Coding/Word portal pattern; without them the original inline layout renders unchanged. `src/app/page.tsx` wires the three search slots when `activeNavTab === "search"` and mounts SearchTab inside the bottom slot wrapper so the portals fire. Tightened the search input row (`text-[12px] px-3 py-2` → `text-[11px] px-2.5 py-1.5`, button matching, wrapper `p-3` → `p-2`) and tuned `--clouds-main-stack-top-height` to `min(18vh, 184px)` so the top cloud hugs the search bar instead of leaving dead space. Bumped the per-tab close-X opacity from 30 to 60 with `group-hover:opacity-100` so it's visible at rest. Fixed a pre-existing bug where the search placeholder rendered the literal text `Ask anything…` — JSX attribute string literals don't process unicode escapes, so switched to a JSX expression (`placeholder={"Ask anything…"}`) which now resolves to a real ellipsis.

Spacing parity between the floating Menu / Settings buttons and the cloud cluster is now driven by `--clouds-grid-gap`: introduced `--clouds-chrome-bottom: 4rem` (the visual bottom edge of the chrome row at `top-5 + h-11`) and set `--clouds-stage-top` to `calc(var(--clouds-chrome-bottom) + var(--clouds-grid-gap))`, with `--clouds-stage-bottom = stage-top - shadow-gutter` to preserve vertical centering. The chrome-to-cloud gap now equals the inter-cloud gap automatically; bumping `--clouds-grid-gap` updates both. Then removed the Clouds Size toggle entirely: `CLOUDS_RESIZE_MODES`, `CloudsResizeMode`, the storage key, the reader, and the related context plumbing are gone from `src/components/ThemeProvider.tsx`; `CloudsLayout.tsx` lost the `resizeMode` prop, the `clouds-resize-${mode}` class, and the `.clouds-resize-focus` CSS block; `src/app/page.tsx` lost the destructured state, the `Maximize2` import, the `CLOUDS_RESIZE_MODES` import, and the entire "Clouds Size" settings section. Balanced is now the only Clouds size, and the chrome-spacing math applies to it. Stale `ch-clouds-resize-mode` localStorage keys on existing installs are dead but harmless. `npx tsc --noEmit` passes after each step. All work was done directly on `main` (no Codex branch this round — Codex weekly limit was used).

## How to verify nothing is broken

```bash
cd frontend
npx tsc --noEmit          # must be silent
npm run app:dev           # launches Electron + Next together
```

Smoke test: cycle all 5 tabs, type in each, verify autosave timestamps update in WordTab and SnippetsTab.

## Henry's working preferences (carry these in)

- Pushback expected — challenge bad specs directly, do not silently comply
- Context conservative — minimize reads, keep turns lean, offload to vault when possible
- Confirmation gates — show a summary and get approval before writing files, even at cost of an extra turn
- No em dashes anywhere in output
- Work with what already exists before creating new files or folders
- Henry is a TWU student, AI-savvy but not a deep coder. Explain plainly, handle implementation himself

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

# AI Editing Guide — CentralHub

This guide constrains how AI assistants edit this codebase. Read it in full before
making any change. The rules below take precedence over generic best practices the
model may default to.

---

## 1. Hard rules — never do these without explicit user approval

- **Do not change UI layout, color scheme, fonts, spacing, or component structure.**
  The visual design is settled. Style tweaks compound into drift.
- **Do not rename IPC channels or change event payload shapes.** The renderer
  depends on every channel name and field. `pi:event`, `pi:prompt`, `pi:session-create`,
  `brave:search`, `ai:search:stream`, `pi:word-doc-edit`, etc. are contracts.
- **Do not add new top-level dependencies (`npm install ...`).** Use what is already
  in `package.json`. New deps require explicit approval and a reason.
- **Do not disable, weaken, or refactor the hot-edit-guard or watchdog.**
  `.pi/extensions/hot-edit-guard.ts` and `scripts/watchdog.js` are the safety net
  for self-modification. Touching them without updating their behavior to match
  the rest of the codebase removes that net.
- **Do not introduce new state-management libraries (Redux, Zustand, etc.).**
  The app uses local React state intentionally. A library is not a bug fix.
- **Do not add backend services, databases, or external persistence.** Sessions
  are in-memory by design. Adding persistence is a product decision, not an
  implementation detail.

## 2. Soft rules — defaults to follow unless there is a real reason to deviate

- **Prefer editing existing files over creating new ones.** A new file is only
  justified when an existing one would become unreadable.
- **Match existing code style.** Same indentation, same import order, same comment
  density. Do not reformat unrelated code on the way past.
- **Add features behind explicit opt-in flags rather than changing default
  behavior.** Existing flows must keep working unchanged.
- **When fixing a bug, change the smallest surface that fixes it.** No drive-by
  refactors, no adjacent cleanup, no "while I'm here" edits.

## 3. Required workflow

- **Read `AGENTS.md` and `PI_SDK_INTEGRATION.md` before any change touching PI,
  chat, models, or the main process.** The PI SDK has rules that are not obvious
  from the code (in-process only, never spawn the CLI, never import the SDK in
  the renderer).
- **Before editing critical files (`main.js`, `main/*.js`, `package.json`,
  `.pi/extensions/*`), verify the hot-edit-guard is loaded.** Look for
  `[hot-edit-guard] Loaded` in the dev console. If it is not loaded, create a
  manual checkpoint first: `git branch -f ai-safety-rollbacks HEAD`.
- **After any edit, restart the dev server and manually test the feature you
  changed plus one adjacent feature.** Type checking and build success do not
  prove the feature still works. A regression in an adjacent feature is the
  most common failure mode.
- **Show a diff summary and ask for approval before writing changes the user
  did not explicitly request.** Out-of-scope edits, even small ones, must be
  surfaced before they land.

## 4. Changes that need explicit user approval first

- Adding a new IPC channel.
- Adding a new tab to the left nav.
- Changing the default model, default tools, or default `thinkingLevel`.
- Changing the markdown renderer or message rendering pipeline.
- Any change that touches more than 3 files at once.

## 5. Pointers

- **`AGENTS.md`** — project-wide rules and the PI SDK guard rails.
- **`PI_SDK_INTEGRATION.md`** — every PI object, every event, every pattern.
- **`HANDOFF.md`** — current work-in-progress and known gotchas from recent
  refactors.
- **`main/` directory** — main-process modules. Each file's top comment lists
  the IPC channels it owns. If you add a channel, add it to the comment.

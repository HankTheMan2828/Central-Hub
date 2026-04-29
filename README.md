# Central Hub - AI Powered Operating System & Workspace

Central Hub is a dark-mode first, unified desktop environment built to centralize daily workflows. It connects seamlessly to local and remote AI models (utilizing the Pi Coding Agent SDK) to power intelligent chat, coding workflows, text editing, and more.

## Architecture
- **Framework:** Next.js 15 (React 19)
- **Desktop Wrapper:** Electron
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide React
- **AI Engine:** PI Coding Agent SDK (in-process, no subprocess spawning)

> **🔥 PI INTEGRATION: READ THIS FIRST**
>
> CentralHub embeds PI via the **SDK** (`createAgentSession()`), in-process
> inside Electron's main process. The renderer never imports the SDK directly —
> everything flows through Electron IPC.
>
> **Full architecture doc:** [`PI_SDK_INTEGRATION.md`](./PI_SDK_INTEGRATION.md)
>
> ❌ Do NOT spawn `pi` as a CLI subprocess.
> ❌ Do NOT use RPC mode.
> ❌ Do NOT import `@mariozechner/pi-coding-agent` in the renderer.

## Getting Started

### Development Mode (Local App)
To run both the Next.js server and the native Desktop app simultaneously:
```bash
npm run app:dev
```
*Note: We have included a VBScript `create-shortcut.js` that automatically generates a clickable desktop icon to launch this command seamlessly.*

### Project Structure
| File | Role |
|------|------|
| `main.js` | Electron main process. Owns PI SDK (AuthStorage, ModelRegistry, AgentSession). Exposes IPC handlers for the renderer. |
| `src/hooks/usePiChat.ts` | React hook. Receives PI events via IPC, manages local chat state. |
| `src/app/page.tsx` | The UI. Renders chat, settings, model selector. Calls `usePiChat()`. |
| `PI_SDK_INTEGRATION.md` | **Complete PI integration reference.** Architecture, events, patterns, pitfalls. |

## Planned Modules
1. **Agent Chat:** Direct multi-turn interface for local/remote LLMs.
2. **Word Processor:** Rich-text editor with AI inline assist.
3. **Typing Practice:** Embedded WPM tracking and keyboard training.
4. **AI Search:** Headless browsing and summarization agent.
5. **Dev & Workflows:** Autonomous coding assistant interface.

## Hot-Edit Safety System

The app can modify its own source code at runtime without crashing, even when
editing core files like `main.js`. This is protected by a 4-layer safety net:

| Layer | Mechanism | File |
|-------|-----------|------|
| 1 | Git checkpoint on `ai-safety-rollbacks` branch | `.pi/extensions/hot-edit-guard.ts` |
| 2 | Syntax validation (`node --check`) | `.pi/extensions/hot-edit-guard.ts` |
| 3 | Guarded restart with external watchdog | `scripts/watchdog.js` |
| 4 | Auto-rollback on crash | `scripts/watchdog.js` |

**How it works:** When PI edits a critical file (`main.js`, `package.json`,
or any `.pi/extensions/`), the extension creates a git safety checkpoint on
a dedicated branch (not `main`), validates the syntax, then restarts the
app with an external watchdog process. If the new process fails to start,
the watchdog automatically rolls back and relaunches.

**Manual commands:**
- `/hot-edit:restart` — trigger a guarded restart
- `/hot-edit:rollback` — roll back to the last safety checkpoint

See [`PI_SDK_INTEGRATION.md`](./PI_SDK_INTEGRATION.md) for the complete
architecture documentation.

# PI SDK Integration — Architecture & Reference

> **Critical:** CentralHub embeds PI via the **SDK** (`createAgentSession()`).
> Do NOT spawn PI as a subprocess, use RPC mode, or shell out to the CLI.
> The SDK runs in-process inside Electron's main process and is the only supported
> way to embed PI in a desktop app.

---

## Why the SDK, not spawning PI

| Approach | Problem |
|----------|---------|
| Spawning `pi` CLI as child process | Two processes, fragile IPC, can't share state, no type safety |
| PI RPC mode (`--mode rpc`) | JSONL protocol over stdin/stdout, designed for non-Node.js languages |
| **PI SDK** (`createAgentSession`) | In-process, full type safety, direct access to agent state, shared memory |

The SDK is what PI's own interactive mode, print mode, and RPC mode are built on.
It's the same API the PI TUI uses internally. There's never a reason to spawn a
separate PI process when you're already in Node.js.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                     │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  PI SDK                                     │    │
│  │                                             │    │
│  │  AuthStorage ─── ModelRegistry              │    │
│  │       │               │                     │    │
│  │       └───────┬───────┘                     │    │
│  │               │                             │    │
│  │        AgentSession                         │    │
│  │        ┌──────┴──────┐                      │    │
│  │        │    Agent    │  (LLM interaction)   │    │
│  │        │   Tools     │                      │    │
│  │        │   Events ───│──► IPC ──────────┐   │    │
│  │        └─────────────┘                  │   │    │
│  └──────────────────────────────────────────│──┘    │
│                                              │      │
│  ipcMain handlers                            │      │
│  (pi:init, pi:prompt, pi:set-api-key, ...)   │      │
└──────────────────────────────────────────────┼──────┘
                                               │
                    Electron IPC (webContents.send / ipcRenderer)
                                               │
┌──────────────────────────────────────────────┼──────┐
│  Electron Renderer Process (Next.js/React)    │      │
│                                               │      │
│  usePiChat() hook ─── receives pi:event ──────┘      │
│       │                                               │
│       ├── messages state (ChatMessage[])              │
│       ├── isStreaming                                 │
│       ├── isReady                                     │
│       ├── sendMessage() ──► ipcRenderer.invoke        │
│       ├── setApiKey()    ──► ipcRenderer.invoke        │
│       ├── setModel()     ──► ipcRenderer.invoke        │
│       └── ...                                         │
│                                                       │
│  page.tsx ─── renders chat UI from hook state         │
└───────────────────────────────────────────────────────┘
```

**Key rule:** The renderer NEVER imports from `@mariozechner/pi-coding-agent`.
It only talks to PI through Electron IPC. The SDK lives exclusively in the
main process.

---

## Core SDK Objects

### AuthStorage

Manages API keys and OAuth credentials. CentralHub creates its own instance
pointing at a file in Electron's `userData` directory — this keeps the app
self-contained (no dependency on `~/.pi/agent/`).

```js
const authPath = path.join(app.getPath('userData'), 'pi-auth.json');
authStorage = AuthStorage.create(authPath);
```

**API key resolution order:**
1. Runtime overrides via `setRuntimeApiKey()` (not persisted, in-memory only)
2. Stored credentials in the auth file
3. Environment variables (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, etc.)

```js
// For CentralHub — push a key the user typed into Settings:
authStorage.setRuntimeApiKey('openrouter', 'sk-or-v1-...');
```

### ModelRegistry

Knows about all available models (built-in + custom from `models.json`).
Created once and held for the app lifetime.

```js
modelRegistry = ModelRegistry.create(authStorage);

// Get only models with valid credentials
const available = await modelRegistry.getAvailable();

// Find a specific model
const model = modelRegistry.find('openrouter', 'anthropic/claude-sonnet');
```

### AgentSession

A single conversation session. Created via `createAgentSession()`.
CentralHub uses in-memory sessions (no disk persistence) and in-memory
settings (no file I/O, which avoids path-resolution failures in packaged
Electron builds).

```js
const cwd = path.resolve(__dirname, '..');

const { session } = await createAgentSession({
  cwd,                                              // required — tools resolve paths against this
  sessionManager: SessionManager.inMemory(cwd),      // no disk persistence
  settingsManager: SettingsManager.inMemory({        // no file I/O
    compaction: { enabled: false }
  }),
  authStorage,
  modelRegistry,
  thinkingLevel: 'medium',
});
```

Key methods:
| Method | Purpose |
|--------|---------|
| `session.prompt(text)` | Send user message, wait for full response |
| `session.abort()` | Cancel current streaming response |
| `session.subscribe(fn)` | Listen to all events (streaming text, tools, lifecycle) |
| `session.setModel(model)` | Switch to a different model |
| `session.dispose()` | Clean up the session |

### AgentSessionRuntime (advanced)

Use `createAgentSessionRuntime()` instead of `createAgentSession()` when you
need **session replacement**: `/new`, `/resume`, `/fork`, `/clone`, import.
CentralHub currently doesn't need this, but it's the API to reach for if you
add session switching.

---

## Event Reference

All events received by `session.subscribe()`:

| Event type | When | Key fields |
|------------|------|------------|
| `message_update` | Streaming text tokens | `event.assistantMessageEvent.type`: `"text_delta"`, `"thinking_delta"` |
| `tool_execution_start` | Before tool runs | `event.toolName`, `event.args` |
| `tool_execution_end` | After tool completes | `event.toolName`, `event.result`, `event.isError` |
| `agent_start` | LLM begins processing | — |
| `agent_end` | LLM finishes | `event.messages` |
| `turn_start` | One LLM response cycle starts | `event.turnIndex` |
| `turn_end` | Cycle ends (after tool calls) | `event.message`, `event.toolResults` |
| `queue_update` | Steering/follow-up queue changes | `event.steering`, `event.followUp` |

---

## Streaming Flow (step by step)

1. User types in the Next.js UI and presses Enter
2. `page.tsx` calls `chat.sendMessage(text)`
3. `usePiChat.sendMessage()` adds a user `ChatMessage` to local state, then calls `ipcRenderer.invoke('pi:prompt', text)`
4. Electron main's `pi:prompt` handler calls `piSession.prompt(text)`
5. PI's agent loop begins — the SDK emits events:
   - `agent_start` → renderer adds empty assistant bubble with `isStreaming: true`
   - `message_update` (text_delta) → renderer appends tokens to the assistant bubble
   - `tool_execution_start` → renderer adds a tool bubble
   - `tool_execution_end` → renderer fills the tool bubble with result
   - (repeat for each turn)
   - `agent_end` → renderer marks assistant bubble `isStreaming: false`
6. `session.prompt()` resolves, the IPC handler returns, and the renderer's `ipcRenderer.invoke` resolves

---

## Adding a New Feature

### Adding an IPC channel (main → renderer)

1. In `main.js`, add an `ipcMain.handle('pi:my-feature', async (event, args) => { ... })`
2. In `usePiChat.ts`, add a method that calls `ipcRenderer.invoke('pi:my-feature', args)`
3. In `page.tsx`, use the hook method

### Adding a custom tool

Tools are registered through extensions (`.pi/extensions/` or via `customTools` in `createAgentSession` options). For example:

```js
const { session } = await createAgentSession({
  // ...
  customTools: [myCustomTool],
});
```

### Adding extensions

Extensions are auto-discovered by `DefaultResourceLoader` from:
- `~/.pi/agent/extensions/` (global — avoid, breaks self-containment)
- `.pi/extensions/` (project-local)

CentralHub ships with one built-in extension:

#### `hot-edit-guard.ts` — Safe self-modification

When PI edits critical files (`main.js`, `package.json`, or any `.pi/extensions/`),
this extension applies a 4-layer safety net:

1. **Git checkpoint** — before the edit, commits current state to the
   `ai-safety-rollbacks` branch (never touches `main`)
2. **Syntax validation** — after the edit, runs `node --check` on the file
3. **Guarded restart** — when PI finishes, spawns `scripts/watchdog.js`
   and restarts Electron
4. **Auto-rollback** — if the new process doesn't acknowledge within 20s,
   watchdog does `git checkout ai-safety-rollbacks -- <files>` and relaunches

The watchdog is a standalone Node script — it survives even if `main.js`
is completely broken.

Commands registered by this extension:
- `/hot-edit:restart` — manual guarded restart
- `/hot-edit:rollback` — manual rollback to last checkpoint

---

## Common Pitfalls

### ❌ Importing the SDK in the renderer
The renderer (Next.js) must **never** `import '@mariozechner/pi-coding-agent'`.
The SDK only runs in Node.js (Electron main process). Use IPC.

### ❌ Accessing private properties
Don't do `piSession['modelRegistry']` or `piSession['_something']`.
Hold your own references to `AuthStorage` and `ModelRegistry`.

### ❌ Not awaiting getAvailable()
`modelRegistry.getAvailable()` is async — it checks for valid credentials.
Always `await` it.

### ❌ Setting API key only as env var
Set it on `authStorage.setRuntimeApiKey()` too. Env vars alone might not
trigger model availability detection.

### ❌ Using SettingsManager.create() in packaged Electron
`SettingsManager.create()` tries to read from `~/.pi/agent/settings.json`
which doesn't exist or isn't accessible in packaged builds. Always use
`SettingsManager.inMemory()` instead.

### ❌ Not passing cwd to createAgentSession
Without explicit `cwd`, the PI SDK may try `process.cwd()` which in Electron
points to the executable directory, not the project. Pass `cwd` explicitly.

### ✅ Pattern: destroy + recreate for config changes
When an API key or model changes, `destroySession()` + `createSession()`
is the safe path. The old session is fully disposed, the new one picks up
the updated `authStorage` state.

---

## File Map

| File | Role |
|------|------|
| `main.js` | Electron main process. Owns PI SDK instances. Exposes IPC handlers. Acknowledges watchdog on startup. |
| `src/hooks/usePiChat.ts` | React hook. Consumes PI events via IPC. Manages local chat state. |
| `src/app/page.tsx` | The UI. Renders chat, settings, model selector. Calls `usePiChat()`. |
| `.pi/extensions/hot-edit-guard.ts` | **Safety extension.** Git checkpoints, syntax validation, guarded restart orchestration. |
| `scripts/watchdog.js` | **External watchdog.** Standalone Node process. Detects crash after restart, rolls back via git, relaunches. |
| `PI_SDK_INTEGRATION.md` | This file — complete PI integration reference. |

---

## Self-Containment

CentralHub is designed to run without requiring anything else on the machine:

- **PI SDK** is an npm dependency — no global `pi` CLI install needed
- **Auth file** lives in `app.getPath('userData')` (Electron's app data folder), not `~/.pi/agent/`
- **No extensions discovery** from global `~/.pi/agent/` — we only load what we ship
- **API keys** come from the user typing them into the Settings UI, stored as runtime overrides

---

## Upgrading PI SDK

```bash
cd frontend
npm install @mariozechner/pi-coding-agent@latest
```

Then check the [PI CHANGELOG](https://github.com/badlogic/pi-mono/releases) for
breaking changes. The SDK surface (`createAgentSession`, `AuthStorage`,
`ModelRegistry`) is stable but new releases may add required options.

## FAQ

### Why do I see a cmd.exe / System32 process when the app runs?

This is normal. PI's `bash` tool needs a shell to execute commands the LLM
asks for. On Windows that's `cmd.exe` from `C:\Windows\System32`. It only
spawns when the LLM actually calls the bash tool — you won't see it at
startup before sending a message. If you see it persist, it means the LLM
is still running a command.
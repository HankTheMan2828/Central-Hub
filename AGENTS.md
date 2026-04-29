<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PI SDK Integration (CRITICAL)

This is an Electron + Next.js desktop app that embeds the PI coding agent via the PI SDK.

**THE RULE:** PI runs **in-process** via `createAgentSession()` inside Electron's main
process. The renderer (Next.js/React) **never** imports from `@mariozechner/pi-coding-agent`.
Everything flows through Electron IPC.

**You must read `PI_SDK_INTEGRATION.md` before changing anything related to PI, chat,
models, or the main process.** It documents every object, every event, every pattern.

**NEVER DO THIS:**
- Do NOT spawn `pi` as a CLI subprocess
- Do NOT use PI's RPC mode (`--mode rpc`)
- Do NOT `import '@mariozechner/pi-coding-agent'` in `src/` (renderer code)
- Do NOT access private properties on PI objects (`piSession['modelRegistry']`, etc.)

**ALWAYS DO THIS:**
- Hold `AuthStorage` and `ModelRegistry` references in main.js, created once at startup
- Pass them to every `createAgentSession()` call
- Use `modelRegistry.getAvailable()` for listing models, `modelRegistry.find()` for lookup
- Use `authStorage.setRuntimeApiKey()` for API keys entered in the Settings UI
- Forward all PI events to the renderer via `mainWindow.webContents.send('pi:event', event)`

## Hot-Edit Safety System

When editing critical files (`main.js`, `package.json`, or `.pi/extensions/*`),
the `hot-edit-guard` extension automatically creates git safety checkpoints on
the `ai-safety-rollbacks` branch and orchestrates guarded restarts. The external
`scripts/watchdog.js` process handles crash detection and auto-rollback.

**Before editing critical files, always:**
- Verify the safety system is loaded: check for `[hot-edit-guard] Loaded` in console
- If it's not loaded, create a manual git checkpoint first:
  `git branch -f ai-safety-rollbacks HEAD`
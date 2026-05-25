# Central Hub

> **Alpha — v0.2.0.** Actively built. Things will break. If you're here, you're an early tester — thank you. Please file bugs in [Issues](https://github.com/HankTheMan2828/Central-Hub/issues).

One desktop app for the things you actually do: chat with AI, draft documents, run AI-assisted research, practice typing, manage code snippets, and ship code with an autonomous coding agent. All in one window, themed how you like, updating itself in the background.

**[⬇ Download for Windows](https://github.com/HankTheMan2828/Central-Hub/releases/latest/download/CentralHub-Setup.exe)**

> **First-run notes.** Windows SmartScreen will show "Windows protected your PC" — the build isn't code-signed yet. Click **More info** → **Run anyway**. You'll only see this once. The app auto-updates after that, so you won't need to come back to this page.

## What you're testing

This is alpha software. The bones are stable but expect rough edges. A few things to know up front:

- **You need an OpenRouter API key** for the AI chat and coding agent to work. Configure it under **Menu → Settings → AI Provider**. Without it, the chat panels will sit there looking lonely.
- **Reg Web** (under the "The Web" tab) is a placeholder right now — the framework is in but the browser isn't wired yet.
- **macOS and Linux builds don't exist yet.** Windows only for the moment.
- **No telemetry.** Nothing is sent anywhere except your direct prompts to OpenRouter (using your key) and your direct searches to Brave (using your key, if you set one).

## What's inside

**AI Central.** Multi-tab chat against any model you've got an OpenRouter key for. Five conversations stay alive at once without losing context. Powered by the Pi Coding Agent SDK running in-process — no remote relay, your prompts go straight to OpenRouter.

**Docs Area.** A clean writing surface with an AI panel docked beside it. Highlight, ask, edit, save. Word document import/export. No copy-pasting between apps.

**The Web.** AI Search for headless research with summarized answers. (Reg Web — a plain browser pane — is coming.)

**Typing Practice.** WPM tracking and keyboard training.

**Code Snippets.** Paste, save, reuse. Searchable.

**Coding Agent.** An autonomous workspace for taking a project from prompt to working code, with a separate chat thread per workspace. Workbench or terminal mode.

## Make it yours

Nine themes, dark and light, from Midnight (pure black with orange accent) to Sunlit Canvas (warm light paper). Two layout modes: **Foundations** for tight column-based minimalism, or **Clouds** if you want your panels to float as rounded bubbles. Switch from the Themes menu in seconds.

## Why it's different

Most "AI desktop apps" are a chat window wrapped in Electron. Central Hub treats AI as a native feature across every module. The Pi SDK runs in-process, so prompts and tool calls happen at local speeds and your model stays under your control.

It auto-updates. It survives its own edits via a hot-edit safety system that creates git checkpoints before critical files are modified.

## Reporting bugs

Open an [issue](https://github.com/HankTheMan2828/Central-Hub/issues) with:

- What you were trying to do
- What happened instead
- Which tab/feature (e.g. "Coding Agent" or "Docs Area")
- Your OS version (Windows 10 / 11)
- Any console error visible in the app (right-click → Inspect → Console)

Screenshots help. Logs from `%APPDATA%\centralhub` are gold.

## Status & license

**Source-available, alpha.** The repo is public so you can see what you're installing and what your data is doing. The code itself is **all rights reserved** — no fork/redistribute/commercial-use rights are granted at this stage. A proper license will come once the project leaves alpha.

## Building from source (developers)

```bash
npm install
npm run app:dev
```

Architecture and rules for AI agents working on the codebase live in [`AGENTS.md`](./AGENTS.md), [`AI_EDITING_GUIDE.md`](./AI_EDITING_GUIDE.md), and [`PI_SDK_INTEGRATION.md`](./PI_SDK_INTEGRATION.md). Read those before touching `main.js`, the PI SDK wiring, or any extension.

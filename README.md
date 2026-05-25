# Central Hub

> **Alpha, v0.2.0.** Things will break. Thanks for being an early tester. File bugs in [Issues](https://github.com/HankTheMan2828/Central-Hub/issues).

One desktop app for the things you actually do: chat with AI, draft documents, run AI-assisted research, practice typing, and ship code with an autonomous coding agent. All in one window, themed how you like, updating itself in the background.

**[⬇ Download for Windows](https://github.com/HankTheMan2828/Central-Hub/releases/latest/download/CentralHub-Setup.exe)**

> **First run.** Windows SmartScreen will show "Windows protected your PC" because the build isn't code-signed yet. Click **More info**, then **Run anyway**. You'll only see this once. The app auto-updates from there.

## What you're testing

Bones are stable. Expect rough edges. Things to know up front:

- **You need an OpenRouter API key** for the AI chat and coding agent to work. Configure it under **Menu → Settings → AI Provider**. Without it, the chat panels will sit there looking lonely.
- **Reg Web** (under "The Web" tab) is a placeholder. The framework is in, the browser isn't wired yet.
- **Windows only for now.** macOS and Linux builds are underway.
- **No telemetry.** Nothing leaves your machine except your direct prompts to OpenRouter and (optionally) your searches to Brave, using your own keys.

## What's inside

**AI Central.** Multi-tab chat against any model your OpenRouter key gives you. Five conversations stay alive at once without losing context. Powered by the Pi Coding Agent SDK running in-process. No remote relay. Your prompts go straight to OpenRouter.

**Coding Agent.** An autonomous workspace for taking a project from prompt to working code, with a separate chat thread per workspace. Workbench or terminal mode.

**Docs Area.** A clean writing surface with an AI panel docked beside it. Highlight, ask, edit, save. Word document import and export. No copy-pasting between apps.

**The Web.** AI Search for headless research with summarized answers. (Reg Web, a plain browser pane, is coming.)

**Typing Practice.** WPM tracking and keyboard training.

## Make it yours

Nine themes, dark and light. Midnight (pure black with orange accent) on one end, Sunlit Canvas (warm light paper) on the other. Panels float as rounded bubbles in the middle of the screen. Switch themes from the Themes menu in seconds.

## Why it's different

Most "AI desktop apps" are a chat window wrapped in Electron. Central Hub treats AI as a native feature across every module. The Pi SDK runs in-process, so prompts and tool calls happen at local speeds and your model stays under your control.

It auto-updates. It survives its own edits via a hot-edit safety system that creates git checkpoints before critical files get modified.

## Reporting bugs

Open an [issue](https://github.com/HankTheMan2828/Central-Hub/issues) with:

- What you were trying to do
- What happened instead
- Which tab or feature (e.g. "Coding Agent" or "Docs Area")
- Your OS version (Windows 10 or 11)
- Any console error from the app (right-click, **Inspect**, **Console** tab)

Screenshots help. Logs from `%APPDATA%\centralhub` are gold.

## Status and license

**Source-available, alpha.** The repo is public so you can see what you're installing and what your data is doing. The code itself is **all rights reserved**. No fork, redistribute, or commercial-use rights are granted at this stage. A proper license will come once the project leaves alpha.

## Building from source (developers)

```bash
npm install
npm run app:dev
```

Architecture and rules for AI agents working on the codebase live in [`AGENTS.md`](./AGENTS.md), [`AI_EDITING_GUIDE.md`](./AI_EDITING_GUIDE.md), and [`PI_SDK_INTEGRATION.md`](./PI_SDK_INTEGRATION.md). Read those before touching `main.js`, the PI SDK wiring, or any extension.

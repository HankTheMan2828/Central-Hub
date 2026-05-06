# Central Hub

One desktop app for the things you actually do. Chat with AI, draft documents, run AI-assisted research, practice typing, and ship code with an autonomous coding agent. All in one window, themed how you like, updating itself in the background.

**[⬇ Download for Windows](https://github.com/HankTheMan2828/Central-Hub/releases/latest/download/CentralHub-Setup.exe)**

Installs in seconds. Updates itself from this point on, no need to come back here.

> First run: Windows SmartScreen may show "Windows protected your PC" because the build isn't code-signed yet. Click **More info** then **Run anyway**. Only happens once.

## What's inside

**AI Chat.** Talk to any model you've got an OpenRouter key for. Multi-tab, so five conversations stay alive at once without losing context. Powered by the Pi Coding Agent SDK running locally inside the app instead of bouncing through a remote service.

**Document Editor.** A clean writing surface with an AI panel docked beside it. Highlight, ask, edit, save. No copy-pasting between tabs.

**AI Search.** Headless browsing and summarization. Ask a question, get an answer with the legwork already done.

**Typing Practice.** WPM tracking and keyboard training, in case you want to type faster between everything else.

**Code Snippets.** Paste, save, reuse. Searchable.

**Coding Agent.** An autonomous workspace for taking a project from prompt to working code. Workbench or terminal mode.

## Make it yours

Nine themes, dark and light, ranging from Midnight (pure black with orange accent) to Sunlit Canvas (warm light paper). Two layout modes too: **Foundations** for tight column-based minimalism, or **Clouds** if you want your panels to float as rounded bubbles in the middle of the screen. Switch either from the Themes menu in seconds.

## Why it's different

Most "AI desktop apps" are a chat window wrapped in Electron. Central Hub treats AI as a native feature across every module. The Pi SDK runs in-process, so prompts and tool calls happen at local speeds and your model stays under your control.

It auto-updates. It survives its own edits via a hot-edit safety system. It's free.

## Building or contributing

```bash
npm install
npm run app:dev
```

Architecture and rules for AI agents working on the codebase live in [`AGENTS.md`](./AGENTS.md), [`AI_EDITING_GUIDE.md`](./AI_EDITING_GUIDE.md), and [`PI_SDK_INTEGRATION.md`](./PI_SDK_INTEGRATION.md). Read those before touching `main.js`, the PI SDK wiring, or any extension.

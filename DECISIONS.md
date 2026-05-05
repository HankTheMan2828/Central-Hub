# DECISIONS.md

## 2026-05-04 — Chat Mode: Restrict Tools & Minimize Tool Display

**Problem:** The Chat mode (Plain Chat) was creating full PI coding-agent sessions
that included read/edit/write/bash tools. The AI would try to call these tools
even though they are not meant for a plain chat interface. Additionally, tool
call results were displayed as large blocks with icons, tool names, and full
result content.

**Decision:** Split the session creation path. The Chat mode now gets a
dedicated `createChatSession()` that:
- Disables all built-in coding tools via `noTools: "builtin"`
- Registers exactly two custom tools: `brave_web_search` and `get_weather`

**Rationale:**
- Plain Chat should act as a conversational assistant, not a coding agent
- Web search and weather are the only tools a chat assistant needs for
  answering general questions
- Other tabs (Coding Agent, WordTab AI) continue to use the full
  `createSession()` path with all coding tools intact

**Changes made:**
1. `main/pi-sdk.js` — Added `braveSearchTool` (Brave Search API) and
   `weatherTool` (Open-Meteo, free, no API key). Added `createChatSession()`
   that wraps `createSession()` with `noTools: "builtin"` and the two custom
   tools. Exported `createChatSession`.
2. `main/ipc-pi-session.js` — Changed `pi:session-create`, `pi:init`, and
   `pi:reinit` to call `createChatSession()` instead of `createSession()`.
   This covers new tabs, backward-compat init, and "Connect" button.
3. `src/components/ChatPanel.tsx` — Replaced the full tool call block (icon,
   tool name, result content, spinner) with a single subtle grey italic line:
   "Used brave_web_search" / "Used get_weather" / "Used a tool (error)".

**Weather API:** Open-Meteo was chosen because it's free, requires no API key,
and provides accurate current conditions. Geocoding + forecast are done in
two steps: first resolve city name to coordinates, then fetch current weather.
The tool prompts the LLM to use English/Latin location names to avoid encoding
issues with non-ASCII geocoding queries.

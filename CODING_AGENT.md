# Coding Agent

Coding Agent lives under Agent Chat -> Coding Agent.

This is the fresh PI-agent workspace. It copies the recognizable chat frame and
right rail from the current chat area, but it does not yet reuse the full
`ChatPanel` conversation implementation.

Current UI entry points:

- `src/app/page.tsx` renders Coding Agent when `chatSubTab === "coding"`.
- `src/components/CodingAgentPanel.tsx` owns the scaffold.
- The Menu -> Theme Area -> Agent Space section controls the Coding Agent accent.

Theme options:

- Workbench: blue-accented coding workspace.
- Terminal: green-accented coding workspace.

Job: become the dedicated PI coding-agent interface with its own session
controls, tool-call timeline, workspace context, and patch review surfaces.

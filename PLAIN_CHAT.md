# Plain Chat

Plain Chat is the existing mature chat surface under Agent Chat -> Plain Chat.
It keeps the current tab bar, history, model controls, attachments, paste boxes,
speech input, and the existing PI-backed chat panel behavior.

Current UI entry points:

- `src/app/page.tsx` renders Plain Chat when `chatSubTab === "plain"`.
- `src/components/ChatPanel.tsx` remains the full conversation panel.
- `src/components/ChatTabBar.tsx` remains the multi-chat tab strip.

Live context:

- Model and provider state comes from `usePiChat`.
- Time, token, cost, context, model, and history surfaces remain in the existing
  right column.

Job: keep the general chat experience working exactly like the previous Agent
Chat tab while the new Coding Agent interface is built separately.

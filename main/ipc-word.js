/* ------------------------------------------------------------------ */
/*  WordTab AI session.                                               */
/*                                                                    */
/*  Owns the live Markdown document cache, the read-mode gate, and    */
/*  the two custom tools (word_read, word_edit) that let the AI side  */
/*  see and modify the user's document. The pi:word-doc-edit channel  */
/*  is sent (not received) — fired from word_edit's execute() to push */
/*  applied edits back into the renderer's editor.                    */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - pi:word-session-create                                        */
/*    - pi:word-doc-update                                            */
/*    - pi:word-mode-set                                              */
/*    - pi:word-doc-edit  (outbound, from word_edit tool)             */
/* ------------------------------------------------------------------ */

const { getMainWindow, piSessions } = require('./shared');
const { createSession, snapshot, truncateEventForIpc } = require('./pi-sdk');

let wordDocCache = '';
// Mode gate for word_edit. The renderer pushes the current AIPanel mode
// here on mount and on every toggle. word_edit refuses to run while in
// read mode so the user can ask questions without risking changes.
let currentWordMode = 'read'; // 'read' | 'edit'
let typeboxModule = null;
let wordReadToolDef = null;
let wordEditToolDef = null;

async function loadTypebox() {
  if (!typeboxModule) typeboxModule = await import('typebox');
  return typeboxModule;
}

async function getWordReadTool() {
  if (wordReadToolDef) return wordReadToolDef;
  const { Type } = await loadTypebox();
  wordReadToolDef = {
    name: 'word_read',
    label: 'Read Word document',
    description:
      "Returns the current contents of the Word document the user is editing in CentralHub, as Markdown. The document is shared live with the user's editor — call this tool to see what they're working on.",
    promptSnippet: 'word_read — fetch the current Word document as Markdown.',
    promptGuidelines: [
      'Call word_read once at the start of the conversation to see the current Word document.',
      'If the user mentions edits, or you suspect the document has changed since you last read it, call word_read again before responding.',
      'When in doubt about the current document state, re-read.',
    ],
    parameters: Type.Object({}),
    async execute() {
      const text = wordDocCache && wordDocCache.trim()
        ? wordDocCache
        : '(The Word document is currently empty.)';
      return {
        content: [{ type: 'text', text }],
        details: {},
      };
    },
  };
  return wordReadToolDef;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

async function getWordEditTool() {
  if (wordEditToolDef) return wordEditToolDef;
  const { Type } = await loadTypebox();
  wordEditToolDef = {
    name: 'word_edit',
    label: 'Edit Word document',
    description:
      "Replaces a single occurrence of `old_string` with `new_string` in the user's Word document. `old_string` must appear EXACTLY ONCE in the current document — if it appears zero or multiple times, the call fails and you must add more surrounding context to disambiguate. Prefer many small targeted edits over one large rewrite. The document is shared live with the user's editor.",
    promptSnippet:
      'word_edit — replace one exact occurrence of old_string with new_string in the Word document.',
    promptGuidelines: [
      'To change the document, call word_edit instead of restating the document or asking the user to apply changes.',
      'old_string must match the document EXACTLY (whitespace, punctuation, casing) and must be unique. Include enough surrounding context to make it unique.',
      'Make multiple small word_edit calls rather than one giant replacement. If a section has many changes near each other, group them into one edit with enough context.',
      'Your chat replies are shown to the user as conversation. Do NOT paste the document or revised passages into chat — the editor is updated automatically when word_edit succeeds.',
      'If word_edit returns an error, call word_read to see the current document and try again with the correct context.',
    ],
    parameters: Type.Object(
      {
        old_string: Type.String({
          description:
            'Exact text to replace. Must appear exactly once in the current document.',
        }),
        new_string: Type.String({
          description: 'Replacement text. May be empty to delete `old_string`.',
        }),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      if (currentWordMode !== 'edit') {
        throw new Error(
          'word_edit is disabled because the user is in Read mode. Do not retry. Reply in chat with what you would change and tell the user they can switch to Edit mode to apply it.'
        );
      }
      const oldStr = typeof params?.old_string === 'string' ? params.old_string : '';
      const newStr = typeof params?.new_string === 'string' ? params.new_string : '';
      if (!oldStr) {
        throw new Error('word_edit: old_string must be a non-empty string.');
      }
      const matches = countOccurrences(wordDocCache, oldStr);
      if (matches === 0) {
        throw new Error(
          'word_edit: old_string was not found in the document. Call word_read to see the current contents, then retry with text that matches exactly.'
        );
      }
      if (matches > 1) {
        throw new Error(
          `word_edit: old_string matches ${matches} places in the document. Add more surrounding context so the match is unique, then retry.`
        );
      }
      const idx = wordDocCache.indexOf(oldStr);
      const updated =
        wordDocCache.slice(0, idx) + newStr + wordDocCache.slice(idx + oldStr.length);
      wordDocCache = updated;

      if (getMainWindow() && !getMainWindow().isDestroyed()) {
        try {
          getMainWindow().webContents.send('pi:word-doc-edit', { newContent: updated });
        } catch (_) { /* non-fatal */ }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Edit applied. Document is now ${updated.length} characters.`,
          },
        ],
        details: { length: updated.length },
      };
    },
  };
  return wordEditToolDef;
}

function register(ipcMain) {
  /**
   * Create a WordTab-flavoured session: built-in fs/bash tools disabled,
   * `word_read` registered so the AI can fetch the live document.
   */
  ipcMain.handle('pi:word-session-create', async () => {
    try {
      const wordReadTool = await getWordReadTool();
      const wordEditTool = await getWordEditTool();
      const session = await createSession({
        customTools: [wordReadTool, wordEditTool],
        noTools: 'builtin',
      });
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const unsub = session.subscribe((event) => {
        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          try {
            getMainWindow().webContents.send('pi:event', { sessionId, event: truncateEventForIpc(event) });
          } catch (_) {}
        }
      });

      piSessions.set(sessionId, { session, unsubscribe: unsub });

      const snap = await snapshot(session);
      console.log(
        '[PI]  word session created:',
        sessionId,
        'model:',
        session.model?.provider,
        '/',
        session.model?.id,
        'tools:',
        [wordReadTool.name, wordEditTool.name].join(', ')
      );
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] word-session-create error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /**
   * Renderer pushes the live editor contents (as Markdown) here so that
   * the next `word_read` tool call returns up-to-date content.
   */
  ipcMain.handle('pi:word-doc-update', async (_event, { content }) => {
    wordDocCache = typeof content === 'string' ? content : '';
    return { success: true };
  });

  /**
   * Renderer pushes the current AIPanel mode ('read' | 'edit'). word_edit
   * refuses to run while in read mode.
   */
  ipcMain.handle('pi:word-mode-set', async (_event, { mode }) => {
    if (mode === 'read' || mode === 'edit') {
      currentWordMode = mode;
    }
    return { success: true, mode: currentWordMode };
  });
}

module.exports = { register };

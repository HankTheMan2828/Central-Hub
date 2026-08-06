/* ------------------------------------------------------------------ */
/*  Grok Build session IPC (parallel to PI; does not touch pi:*)      */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - grok:status                                                   */
/*    - grok:session-create                                           */
/*    - grok:session-destroy                                          */
/*    - grok:prompt                                                   */
/*    - grok:abort                                                    */
/*    - grok:set-cwd                                                  */
/*    - grok:open-terminal                                            */
/*                                                                    */
/*  Events emitted:                                                   */
/*    - grok:event  { sessionId, event }                              */
/* ------------------------------------------------------------------ */

const {
  getStatus,
  createSession,
  destroySession,
  destroyAllSessions,
  abortSession,
  promptSession,
  setSessionCwd,
  openTerminal,
} = require('./grok-bridge');

function register(ipcMain) {
  ipcMain.handle('grok:status', async () => {
    try {
      return { success: true, ...getStatus() };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:session-create', async (_event, opts = {}) => {
    try {
      const result = createSession({
        sessionKind: opts.sessionKind || opts.sessionType || 'coding',
        cwd: opts.cwd,
      });
      if (result.success) {
        console.log(
          '[Grok] session created:',
          result.sessionId,
          'kind:',
          opts.sessionKind || opts.sessionType || 'coding'
        );
      } else {
        console.warn('[Grok] session-create failed:', result.error);
      }
      return result;
    } catch (e) {
      console.error('[Grok] session-create error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:session-destroy', async (_event, { sessionId } = {}) => {
    try {
      if (sessionId) destroySession(sessionId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:prompt', async (_event, { sessionId, text, cwd } = {}) => {
    try {
      if (!sessionId) return { success: false, error: 'sessionId required' };
      return await promptSession(sessionId, text, { cwd });
    } catch (e) {
      console.error('[Grok] prompt error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:abort', async (_event, { sessionId } = {}) => {
    try {
      if (!sessionId) return { success: false, error: 'sessionId required' };
      return abortSession(sessionId);
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:set-cwd', async (_event, { sessionId, cwd } = {}) => {
    try {
      if (!sessionId) return { success: false, error: 'sessionId required' };
      return setSessionCwd(sessionId, cwd);
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  /** Launch real Grok Build TUI in a new console / Windows Terminal. */
  ipcMain.handle('grok:open-terminal', async (_event, opts = {}) => {
    try {
      return openTerminal({ cwd: opts.cwd, model: opts.model });
    } catch (e) {
      console.error('[Grok] open-terminal error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });
}

module.exports = {
  register,
  destroyAllSessions,
};

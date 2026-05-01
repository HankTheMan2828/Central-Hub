/* ------------------------------------------------------------------ */
/*  Chat session IPC + a few file-utility channels.                   */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - pi:session-create                                             */
/*    - pi:session-destroy                                            */
/*    - pi:init                                                       */
/*    - pi:prompt                                                     */
/*    - pi:abort                                                      */
/*    - pi:set-api-key                                                */
/*    - pi:get-models                                                 */
/*    - pi:get-commands                                               */
/*    - pi:set-model                                                  */
/*    - pi:reinit                                                     */
/*    - pi:get-session-stats                                          */
/*    - pi:send-image                                                 */
/*    - pi:broadcast-model     (also emits pi:models-changed)         */
/*    - pi:write-paste-files                                          */
/*    - pi:select-file                                                */
/*    - pi:read-file-text                                             */
/* ------------------------------------------------------------------ */

const path = require('path');
const fs = require('fs');
const { app, dialog } = require('electron');

const {
  getMainWindow,
  getAuthStorage,
  getModelRegistry,
  piSessions,
} = require('./shared');

const {
  createSession,
  destroySession,
  destroyAllSessions,
  snapshot,
  invalidateModelCache,
  truncateEventForIpc,
} = require('./pi-sdk');

function register(ipcMain) {
  /** Create a new chat session — returns { sessionId, ...snapshot } */
  ipcMain.handle('pi:session-create', async () => {
    try {
      const session = await createSession();
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Keep unsubscribe handle so we can clean up
      const unsub = session.subscribe((event) => {
        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          try {
            getMainWindow().webContents.send('pi:event', { sessionId, event: truncateEventForIpc(event) });
          } catch (_) {}
        }
      });

      piSessions.set(sessionId, { session, unsubscribe: unsub });

      const snap = await snapshot(session);
      console.log('[PI]  session created:', sessionId, 'model:', session.model?.provider, '/', session.model?.id);
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] session-create error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /** Destroy a session (called when a tab is closed) */
  ipcMain.handle('pi:session-destroy', async (_event, { sessionId }) => {
    await destroySession(sessionId);
    return { success: true };
  });

  /* ---- convenience: pi:init creates the first session (backward compat) ---- */
  ipcMain.handle('pi:init', async () => {
    try {
      if (piSessions.size > 0) {
        const sessionId = [...piSessions.keys()][0];
        const snap = await snapshot(piSessions.get(sessionId).session);
        return { success: true, sessionId, ...snap };
      }
      // No sessions yet — create one
      const session = await createSession();
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const unsub = session.subscribe((event) => {
        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          try { getMainWindow().webContents.send('pi:event', { sessionId, event: truncateEventForIpc(event) }); } catch (_) {}
        }
      });
      piSessions.set(sessionId, { session, unsubscribe: unsub });
      const snap = await snapshot(session);
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] init error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ---- prompt (session-scoped) ---- */
  ipcMain.handle('pi:prompt', async (_event, { sessionId, text }) => {
    const entry = piSessions.get(sessionId);
    if (!entry) throw new Error('Session not found: ' + sessionId);
    await entry.session.prompt(text);
  });

  /* ---- abort (session-scoped) ---- */
  ipcMain.handle('pi:abort', async (_event, { sessionId }) => {
    const entry = piSessions.get(sessionId);
    if (entry) await entry.session.abort();
  });

  /* ---- set API key (destroys ALL sessions, recreates default) ---- */
  ipcMain.handle('pi:set-api-key', async (_event, { provider, key }) => {
    try {
      if (!getAuthStorage()) throw new Error('SDK not loaded');

      const envVar = provider.toUpperCase() + '_API_KEY';
      process.env[envVar] = key;
      getAuthStorage().setRuntimeApiKey(provider, key);
      invalidateModelCache();

      console.log('[PI] API key set for provider:', provider);

      await destroyAllSessions();

      // Create a fresh default session
      const session = await createSession();
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
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] set-api-key error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ---- get models (global, not session-scoped) ---- */
  ipcMain.handle('pi:get-models', async () => {
    try {
      return await snapshot([...piSessions.values()][0]?.session ?? null);
    } catch (e) {
      console.error('[PI] get-models error:', e);
      return { models: [], currentModel: null, providers: {} };
    }
  });

  /* ---- Commands (for autocomplete) ---- */
  ipcMain.handle('pi:get-commands', async () => {
    return [
      { name: 'hot-edit:restart', description: 'Restart the app with safety watchdog' },
      { name: 'hot-edit:rollback', description: 'Roll back to the last safety checkpoint' },
    ];
  });

  /* ---- set model (session-scoped) ---- */
  ipcMain.handle('pi:set-model', async (_event, { sessionId, provider, modelId }) => {
    try {
      const entry = piSessions.get(sessionId);
      if (!entry || !getModelRegistry()) throw new Error('Session not found');

      const model = getModelRegistry().find(provider, modelId);
      if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

      await entry.session.setModel(model);
      console.log('[PI] Model set for', sessionId, ':', provider, modelId);

      const snap = await snapshot(entry.session);
      return { success: true, ...snap };
    } catch (e) {
      console.error('[PI] set-model error:', e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ---- reinit (destroys all + recreates default) ---- */
  ipcMain.handle('pi:reinit', async () => {
    try {
      await destroyAllSessions();
      const session = await createSession();
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
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] reinit error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ---- session stats (session-scoped) ---- */
  ipcMain.handle('pi:get-session-stats', async (_event, { sessionId }) => {
    try {
      const entry = piSessions.get(sessionId);
      if (!entry) return { success: false, error: 'Session not found' };
      const stats = entry.session.getSessionStats();
      const contextUsage = entry.session.getContextUsage();
      return { success: true, stats, contextUsage };
    } catch (e) {
      console.error('[PI] get-session-stats error:', e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ---- send image (session-scoped) ---- */
  ipcMain.handle('pi:send-image', async (_event, { sessionId, text, images }) => {
    const entry = piSessions.get(sessionId);
    if (!entry) throw new Error('Session not found: ' + sessionId);
    const formattedImages = (images ?? []).map(img => ({
      type: 'image',
      data: img.data,
      mimeType: img.mimeType,
    }));
    await entry.session.prompt(text, { images: formattedImages });
  });

  /* ---- Update all sessions to the same model (global model sync) ---- */
  ipcMain.handle('pi:broadcast-model', async (_event, { provider, modelId }) => {
    try {
      if (!getModelRegistry()) throw new Error('SDK not loaded');
      const model = getModelRegistry().find(provider, modelId);
      if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

      for (const [id, entry] of piSessions) {
        try { await entry.session.setModel(model); } catch (e) {
          console.warn('[PI] broadcast-model: failed for', id, e?.message);
        }
      }
      console.log('[PI] Broadcast model to all sessions:', provider, modelId);

      // Notify every renderer hook so each instance re-syncs currentModel.
      if (getMainWindow() && !getMainWindow().isDestroyed()) {
        try { getMainWindow().webContents.send('pi:models-changed'); } catch (_) {}
      }
      return { success: true };
    } catch (e) {
      console.error('[PI] broadcast-model error:', e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Write paste-box content as real .md files on disk                  */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('pi:write-paste-files', async (_event, { pasteBoxes }) => {
    try {
      // Use Electron userData dir — guaranteed writable in any Electron build
      const userData = app.getPath('userData');
      const outDir = path.join(userData, 'pasted-context');

      console.log('[PI] paste-files: target =', outDir);
      console.log('[PI] paste-files: boxes =', pasteBoxes ? pasteBoxes.length : 0);

      // Clean previous turn, create fresh
      if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
        console.log('[PI] paste-files: cleaned old dir');
      }
      fs.mkdirSync(outDir, { recursive: true });

      const results = [];
      for (const box of pasteBoxes) {
        if (!box.content || !box.content.trim()) continue;

        const slug = (box.title || 'pasted-content')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'pasted-content';

        let fileName = `${slug}.md`;
        let filePath = path.join(outDir, fileName);
        let counter = 1;
        while (fs.existsSync(filePath)) {
          fileName = `${slug}-${counter}.md`;
          filePath = path.join(outDir, fileName);
          counter++;
        }

        fs.writeFileSync(filePath, box.content.trim(), 'utf-8');

        // Verify write succeeded
        if (!fs.existsSync(filePath)) {
          console.error('[PI] paste-files: FILE MISSING after write:', filePath);
          continue;
        }

        const stat = fs.statSync(filePath);
        console.log('[PI] paste-files: written ✓', filePath, stat.size, 'bytes');

        results.push({
          title: box.title || 'Pasted Content',
          slug,
          filePath,
        });
      }

      console.log('[PI] paste-files: returning', results.length, 'files');
      console.log('[PI] paste-files:', JSON.stringify(results));
      return { success: true, files: results };
    } catch (e) {
      console.error('[PI] write-paste-files error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ------------------------------------------------------------------ */
  /*  File picker for document attachments                               */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('pi:select-file', async () => {
    if (!getMainWindow()) return { canceled: true };
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, filePaths: result.filePaths };
  });

  /* ------------------------------------------------------------------ */
  /*  Read a file's text content (for .md and other text files)          */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('pi:read-file-text', async (_event, { filePath }) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found: ' + filePath };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, size: content.length };
    } catch (e) {
      console.error('[PI] read-file-text error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });
}

module.exports = { register };

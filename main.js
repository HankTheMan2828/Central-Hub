const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/* ------------------------------------------------------------------ */
/*  Watchdog acknowledgment — if the previous run was a guarded       */
/*  restart, tell the watchdog we started successfully.               */
/* ------------------------------------------------------------------ */
(function acknowledgeWatchdog() {
  const statePath = path.join(__dirname, '.pi', 'watchdog.json');
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      // Only acknowledge if the state file is fresh (< 60s old)
      if (state.timestamp && Date.now() - state.timestamp < 60_000) {
        state.acknowledged = true;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        console.log('[main] Watchdog acknowledged — app started successfully');
      }
    }
  } catch (_) { /* non-critical */ }
})();

let mainWindow;

/* ------------------------------------------------------------------ */
/*  PI SDK state                                                      */
/* ------------------------------------------------------------------ */
let piSdk = null;
let authStorage = null;
let modelRegistry = null;
let piSession = null;
let cachedModels = null;       // last getAvailable() result, invalidated on key change
let cachedModelsAt = 0;        // timestamp of last fetch

const MODEL_CACHE_MS = 30_000; // re-fetch at most every 30 s

/* ------------------------------------------------------------------ */
/*  Load PI SDK once                                                  */
/* ------------------------------------------------------------------ */
async function loadPiSdk() {
  if (!piSdk) {
    piSdk = await import('@mariozechner/pi-coding-agent');
    console.log('[PI] SDK loaded');
  }
  return piSdk;
}

/* ------------------------------------------------------------------ */
/*  Fetch available models (with short-lived cache)                    */
/* ------------------------------------------------------------------ */
async function fetchModels(force = false) {
  if (!force && cachedModels && Date.now() - cachedModelsAt < MODEL_CACHE_MS) {
    return cachedModels;
  }
  if (!modelRegistry) return [];

  let raw;
  try {
    raw = await modelRegistry.getAvailable();
  } catch (_) {
    raw = [];
  }

  cachedModels = raw.map(m => ({
    id: m.id,
    name: m.name || m.id,
    provider: m.provider,
    reasoning: m.reasoning ?? false,
    contextWindow: m.contextWindow,
    input: m.input ?? ['text'],
  }));
  cachedModelsAt = Date.now();
  return cachedModels;
}

function invalidateModelCache() {
  cachedModels = null;
  cachedModelsAt = 0;
}

/* ------------------------------------------------------------------ */
/*  Build a rich state snapshot the renderer can consume directly     */
/* ------------------------------------------------------------------ */
async function snapshot() {
  const models = await fetchModels();

  const providers = {};
  for (const m of models) providers[m.provider] = true;

  const cm = piSession?.model;
  const currentModel = cm
    ? { id: cm.id, name: cm.name || cm.id, provider: cm.provider }
    : null;

  return { models, currentModel, providers };
}

/* ------------------------------------------------------------------ */
/*  Create or re-create the PI session                                 */
/* ------------------------------------------------------------------ */
async function createSession() {
  const sdk = await loadPiSdk();
  const { createAgentSession, SessionManager, SettingsManager } = sdk;

  if (!authStorage) {
    const { AuthStorage, ModelRegistry } = sdk;
    const authPath = path.join(app.getPath('userData'), 'pi-auth.json');
    authStorage = AuthStorage.create(authPath);
    modelRegistry = ModelRegistry.create(authStorage);
  }

  const cwd = path.resolve(__dirname, '..');

  const { session, extensionsResult } = await createAgentSession({
    cwd,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    thinkingLevel: 'medium',
    authStorage,
    modelRegistry,
  });

  if (extensionsResult.errors?.length) {
    for (const e of extensionsResult.errors) {
      console.warn('[PI] Extension error:', e.path, e.error);
    }
  }

  piSession = session;

  session.subscribe((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('pi:event', event); } catch (_) {}
    }
  });

  console.log('[PI] Session ready — model:', session.model?.provider, '/', session.model?.id);
}

async function destroySession() {
  if (piSession) {
    try { await piSession.dispose(); } catch (_) {}
    piSession = null;
  }
}

/* ------------------------------------------------------------------ */
/*  IPC handlers — every mutation returns a full snapshot             */
/* ------------------------------------------------------------------ */

ipcMain.handle('pi:init', async () => {
  try {
    await createSession();
    const snap = await snapshot();
    return { success: true, ...snap };
  } catch (e) {
    console.error('[PI] init error:', e?.stack ?? e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('pi:prompt', async (_event, text) => {
  if (!piSession) throw new Error('PI not connected');
  await piSession.prompt(text);
});

ipcMain.handle('pi:abort', async () => {
  if (piSession) await piSession.abort();
});

ipcMain.handle('pi:set-api-key', async (_event, { provider, key }) => {
  try {
    if (!authStorage) throw new Error('SDK not loaded');

    const envVar = provider.toUpperCase() + '_API_KEY';
    process.env[envVar] = key;
    authStorage.setRuntimeApiKey(provider, key);
    invalidateModelCache();

    console.log('[PI] API key set for provider:', provider);

    await destroySession();
    await createSession();
    const snap = await snapshot();
    return { success: true, ...snap };
  } catch (e) {
    console.error('[PI] set-api-key error:', e?.stack ?? e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('pi:get-models', async () => {
  try {
    return await snapshot();
  } catch (e) {
    console.error('[PI] get-models error:', e);
    return { models: [], currentModel: null, providers: {} };
  }
});

ipcMain.handle('pi:set-model', async (_event, { provider, modelId }) => {
  try {
    if (!piSession || !modelRegistry) throw new Error('PI not connected');

    const model = modelRegistry.find(provider, modelId);
    if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

    await piSession.setModel(model);
    console.log('[PI] Model set:', provider, modelId);

    const snap = await snapshot();
    return { success: true, ...snap, model: { id: model.id, name: model.name || model.id, provider: model.provider } };
  } catch (e) {
    console.error('[PI] set-model error:', e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('pi:reinit', async () => {
  try {
    await destroySession();
    await createSession();
    const snap = await snapshot();
    return { success: true, ...snap };
  } catch (e) {
    console.error('[PI] reinit error:', e?.stack ?? e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('pi:get-session-stats', async () => {
  try {
    if (!piSession) return { success: false, error: 'PI not connected' };
    const stats = piSession.getSessionStats();
    const contextUsage = piSession.getContextUsage();
    return { success: true, stats, contextUsage };
  } catch (e) {
    console.error('[PI] get-session-stats error:', e);
    return { success: false, error: e.message || String(e) };
  }
});

/* ------------------------------------------------------------------ */
/*  Window creation                                                   */
/* ------------------------------------------------------------------ */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#FFFFFF',
      height: 8
    },
    icon: path.join(__dirname, 'build/icon.png')
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    destroySession();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  require('electron').nativeTheme.themeSource = 'system';
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
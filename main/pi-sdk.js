/* ------------------------------------------------------------------ */
/*  PI SDK helpers — module-private SDK cache, model cache, and the   */
/*  shared session lifecycle (create, destroy, destroy-all). The IPC  */
/*  modules call into here; they never import the PI SDK directly.   */
/*                                                                    */
/*  IPC channels:                                                     */
/*    (none — this module only exposes Node-side helpers)             */
/* ------------------------------------------------------------------ */

const path = require('path');
const { app } = require('electron');

const {
  getAuthStorage, setAuthStorage,
  getModelRegistry, setModelRegistry,
  piSessions,
} = require('./shared');

let piSdk = null;

let cachedModels = null;       // last getAvailable() result, invalidated on key change
let cachedModelsAt = 0;        // timestamp of last fetch

const MODEL_CACHE_MS = 30_000; // re-fetch at most every 30 s

/** PI session cwd — the project root, not frontend/. */
const appCwd = path.resolve(__dirname, '..', '..');

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
  if (!getModelRegistry()) return [];

  let raw;
  try {
    raw = await getModelRegistry().getAvailable();
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
async function snapshot(session) {
  const models = await fetchModels();

  const providers = {};
  for (const m of models) providers[m.provider] = true;

  const cm = session?.model;
  const currentModel = cm
    ? { id: cm.id, name: cm.name || cm.id, provider: cm.provider }
    : null;

  return { models, currentModel, providers };
}

/* ------------------------------------------------------------------ */
/*  Create a single PI session (called per tab)                       */
/*                                                                    */
/*  options.customTools — extra ToolDefinitions to register.          */
/*  options.noTools     — pass-through to createAgentSession (e.g.    */
/*                        "builtin" disables read/edit/write/bash).   */
/* ------------------------------------------------------------------ */
async function createSession(options = {}) {
  const sdk = await loadPiSdk();
  const { createAgentSession, SessionManager, SettingsManager } = sdk;

  if (!getAuthStorage()) {
    const { AuthStorage, ModelRegistry } = sdk;
    const authPath = path.join(app.getPath('userData'), 'pi-auth.json');
    setAuthStorage(AuthStorage.create(authPath));
    setModelRegistry(ModelRegistry.create(getAuthStorage()));
  }

  const cwd = appCwd;

  const sdkOpts = {
    cwd,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: true } }),
    thinkingLevel: 'medium',
    authStorage: getAuthStorage(),
    modelRegistry: getModelRegistry(),
  };
  if (Array.isArray(options.customTools) && options.customTools.length > 0) {
    sdkOpts.customTools = options.customTools;
  }
  if (options.noTools) {
    sdkOpts.noTools = options.noTools;
  }

  const { session, extensionsResult } = await createAgentSession(sdkOpts);

  if (extensionsResult.errors?.length) {
    for (const e of extensionsResult.errors) {
      console.warn('[PI] Extension error:', e.path, e.error);
    }
  }

  // ALWAYS default new sessions to Qwen 3.6 27b. The user can switch from
  // the dropdown afterwards; new sessions still start at Qwen.
  try {
    const available = await fetchModels(true);
    const qwenModel = available.find(m =>
      m.id.toLowerCase().includes('qwen') && m.id.includes('3.6') && m.id.includes('27')
    );
    if (qwenModel) {
      const model = getModelRegistry().find(qwenModel.provider, qwenModel.id);
      if (model) {
        await session.setModel(model);
        console.log('[PI] Default model set to:', qwenModel.provider, '/', qwenModel.id);
      }
    } else {
      console.log('[PI] Qwen 3.6 27b not found in available models — leaving SDK default');
    }
  } catch (e) {
    console.warn('[PI] Failed to set default model:', e?.message ?? e);
  }

  return session;
}

async function destroySession(sessionId) {
  const entry = piSessions.get(sessionId);
  if (!entry) return;
  try { entry.unsubscribe(); } catch (_) {}
  try { await entry.session.dispose(); } catch (_) {}
  piSessions.delete(sessionId);
  console.log('[PI] Session destroyed:', sessionId);
}

async function destroyAllSessions() {
  for (const [id] of piSessions) {
    await destroySession(id);
  }
}

// Cap tool-result payloads before they cross the IPC bridge. The model on this
// side keeps the full result for reasoning; the renderer only needs a preview
// for display, so we trim here to avoid multi-MB structured-clone + stringify
// work in the renderer (which was freezing the app after heavy tool turns).
const MAX_TOOL_RESULT_IPC = 8000;
function truncateEventForIpc(event) {
  if (event?.type !== 'tool_execution_end') return event;
  const r = event.result;
  let str;
  if (typeof r === 'string') str = r;
  else { try { str = JSON.stringify(r); } catch { str = String(r); } }
  if (str.length <= MAX_TOOL_RESULT_IPC) return event;
  return {
    ...event,
    result:
      str.slice(0, MAX_TOOL_RESULT_IPC) +
      `\n… (truncated ${str.length - MAX_TOOL_RESULT_IPC} more chars; full result kept in agent context)`,
  };
}

module.exports = {
  loadPiSdk,
  fetchModels,
  invalidateModelCache,
  snapshot,
  createSession,
  destroySession,
  destroyAllSessions,
  truncateEventForIpc,
  appCwd,
};

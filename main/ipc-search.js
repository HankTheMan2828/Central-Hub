/* ------------------------------------------------------------------ */
/*  Brave Search + one-shot AI Search.                                */
/*                                                                    */
/*  Brave Search uses its own runtime API key (separate from PI auth) */
/*  but mirrors the key onto authStorage when available so other      */
/*  consumers see it.                                                 */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - brave:set-key                                                 */
/*    - brave:get-status                                              */
/*    - brave:search                                                  */
/*    - ai:search:start   (also emits ai:search:stream events)        */
/*    - ai:search:stop                                                */
/* ------------------------------------------------------------------ */

const path = require('path');
const { app } = require('electron');

const {
  getMainWindow,
  getAuthStorage, setAuthStorage,
  getModelRegistry, setModelRegistry,
  piSessions,
} = require('./shared');

const { loadPiSdk, fetchModels, appCwd } = require('./pi-sdk');

let braveApiKey = process.env.BRAVE_API_KEY || '';

const aiSearchSessions = new Map(); // requestId -> { session }

function stripBraveTags(html) {
  return String(html ?? '').replace(/<[^>]+>/g, '');
}

function register(ipcMain) {
  ipcMain.handle('brave:set-key', async (_event, key) => {
    try {
      const trimmed = (key ?? '').trim();
      braveApiKey = trimmed;
      process.env.BRAVE_API_KEY = trimmed;
      if (getAuthStorage() && trimmed) {
        try { getAuthStorage().setRuntimeApiKey('brave', trimmed); } catch (_) { /* non-fatal */ }
      }
      return { success: true, configured: !!trimmed };
    } catch (e) {
      console.error('[brave:set-key] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('brave:get-status', async () => {
    return { configured: !!braveApiKey };
  });

  ipcMain.handle('brave:search', async (_event, args) => {
    try {
      const query = String(args?.query ?? '').trim();
      if (!query) return { success: false, error: 'Empty query' };
      const apiKey = braveApiKey || process.env.BRAVE_API_KEY;
      if (!apiKey) return { success: false, error: 'Brave API key not set — add it in Settings' };

      const count = Math.max(1, Math.min(20, Number(args?.count) || 10));
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(count));

      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Brave ${res.status}: ${text || res.statusText}` };
      }
      const data = await res.json();
      return { success: true, data };
    } catch (e) {
      console.error('[brave:search] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ------------------------------------------------------------------ */
  /*  AI Search — Brave + one-shot AI answer (separate session)          */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('ai:search:start', async (_event, { requestId, query }) => {
    try {
      const trimmed = String(query ?? '').trim();
      if (!trimmed) return { success: false, error: 'Empty query' };

      const apiKey = braveApiKey || process.env.BRAVE_API_KEY;
      if (!apiKey) return { success: false, error: 'Brave API key not set' };

      // Step 1 — Brave Search
      const braveUrl = new URL('https://api.search.brave.com/res/v1/web/search');
      braveUrl.searchParams.set('q', trimmed);
      braveUrl.searchParams.set('count', '10');

      const res = await fetch(braveUrl, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Brave ${res.status}: ${text || res.statusText}` };
      }
      const braveData = await res.json();
      const results = braveData.web?.results ?? [];

      const sources = results.map(r => ({
        title: stripBraveTags(r.title),
        url: r.url,
        description: stripBraveTags(r.description),
      }));

      // Step 2 — Build AI prompt with search context
      const searchContext = results
        .map((r, i) => `[${i + 1}] ${stripBraveTags(r.title)}\nURL: ${r.url}\n${stripBraveTags(r.description)}\n`)
        .join('\n---\n');

      const systemPrompt = `You are a concise search assistant. Answer the user's question based **only** on the search results provided below.

Rules:
- Give a direct, well-structured answer
- Keep it to 2-4 short paragraphs maximum
- If the search results don't contain enough info, say so briefly
- Cite sources inline as [1], [2], etc. matching the numbered results
- Do NOT fabricate URLs or claim sources you don't have
- Use markdown formatting sparingly — bold key terms, short lists are fine

Search results:
${searchContext}

User question: ${trimmed}`;

      // Step 3 — Create a throwaway session to get the AI answer
      const sdk = await loadPiSdk();
      const { createAgentSession, SessionManager, SettingsManager } = sdk;

      if (!getAuthStorage()) {
        const { AuthStorage, ModelRegistry } = sdk;
        const authPath = path.join(app.getPath('userData'), 'pi-auth.json');
        setAuthStorage(AuthStorage.create(authPath));
        setModelRegistry(ModelRegistry.create(getAuthStorage()));
      }

      const cwd = appCwd;
      const { session } = await createAgentSession({
        cwd,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: true } }),
        thinkingLevel: 'low',
        authStorage: getAuthStorage(),
        modelRegistry: getModelRegistry(),
      });

      // Model: use an existing session's model, or Qwen fallback
      const anySession = [...piSessions.values()][0]?.session;
      if (anySession?.model) {
        await session.setModel(anySession.model);
      } else {
        const available = await fetchModels(true);
        const qwenModel = available.find(m =>
          m.id.toLowerCase().includes('qwen') && m.id.includes('3.6') && m.id.includes('27')
        );
        if (qwenModel) {
          const model = getModelRegistry().find(qwenModel.provider, qwenModel.id);
          if (model) await session.setModel(model);
        }
      }

      // Stream text deltas to renderer during generation
      let accumulatedAnswer = '';
      session.subscribe((event) => {
        if (!getMainWindow() || getMainWindow().isDestroyed()) return;
        try {
          getMainWindow().webContents.send('ai:search:stream', {
            requestId,
            event,
          });
        } catch (_) {}
        // Accumulate final answer from agent_end
        if (event.type === 'agent_end' && event.messages && event.messages.length) {
          const lastMsg = event.messages[event.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && Array.isArray(lastMsg.content)) {
            accumulatedAnswer = lastMsg.content
              .filter(b => b.type === 'text' && typeof b.text === 'string')
              .map(b => b.text)
              .join('');
          }
        }
      });

      aiSearchSessions.set(requestId, { session, accumulatedAnswer: null });

      // Run the prompt and wait for completion
      await session.prompt(systemPrompt);

      // Retrieve the accumulated answer from the session state
      const finalAnswer = accumulatedAnswer || (session.state.messages || [])
        .filter(m => m.role === 'assistant')
        .pop();
      const answerText = typeof finalAnswer === 'string' ? finalAnswer
        : finalAnswer && finalAnswer.content
          ? (Array.isArray(finalAnswer.content)
            ? finalAnswer.content.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('')
            : '')
          : '';

      console.log('[ai:search] query=', trimmed, 'answer_len=', answerText?.length ?? 0, 'sources=', sources.length);

      return {
        success: true,
        requestId,
        sources,
        aiAnswer: answerText,
      };
    } catch (e) {
      console.error('[ai:search:start] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('ai:search:stop', async (_event, { requestId }) => {
    const entry = aiSearchSessions.get(requestId);
    if (entry) {
      try { await entry.session.abort(); } catch (_) {}
      try { await entry.session.dispose(); } catch (_) {}
      aiSearchSessions.delete(requestId);
    }
    return { success: true };
  });
}

module.exports = { register };

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
/*    - web:scrape                                                    */
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

const SEARCH_MODES = new Set(['default', 'premium', 'sources']);
const PRESENTATION_MODES = new Set(['summary', 'bullets', 'briefing', 'compare', 'timeline']);
const MAX_PROMPT_SOURCES = 10;
const DEFAULT_FETCHED_SOURCES = 3;
const PREMIUM_FETCHED_SOURCES = 6;
const MAX_EXCERPT_CHARS = 4500;
const MAX_PREVIEW_CHARS = 12000;
const CURRENT_QUERY_RE = /\b(today|latest|current|recent|breaking|news|now|update|updates|this week|this month|this year|war|conflict|election|price|stock|market|weather|202[5-9])\b/i;

function stripBraveTags(html) {
  return String(html ?? '').replace(/<[^>]+>/g, '');
}

function normalizeMode(value) {
  const mode = String(value ?? 'default').toLowerCase();
  if (mode === 'quick') return 'default';
  if (mode === 'deep' || mode === 'recent') return 'premium';
  return SEARCH_MODES.has(mode) ? mode : 'default';
}

function normalizePresentation(value) {
  const presentation = String(value ?? 'summary').toLowerCase();
  return PRESENTATION_MODES.has(presentation) ? presentation : 'summary';
}

function truncateText(text, max) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
}

function decodeHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function htmlToReadableText(html) {
  return decodeHtmlEntities(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(br|p|div|section|article|li|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function safeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl ?? ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchReadablePage(rawUrl, maxChars = MAX_EXCERPT_CHARS) {
  const parsed = safeUrl(rawUrl);
  if (!parsed) return { success: false, error: 'Invalid URL' };

  const res = await fetch(parsed.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      'User-Agent': 'CentralHubSearch/1.0',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

  const contentType = res.headers.get('content-type') || '';
  if (contentType && !/text|html|xml|json/i.test(contentType)) {
    return { success: false, error: `Unsupported content type: ${contentType}` };
  }

  const raw = await res.text();
  const content = contentType.includes('html') || /<html|<body|<article/i.test(raw)
    ? htmlToReadableText(raw)
    : raw.replace(/\s+/g, ' ').trim();
  if (!content) return { success: false, error: 'No readable content found' };
  return { success: true, content: truncateText(content, maxChars) };
}

function sourceFromResult(result, type = 'web') {
  return {
    title: stripBraveTags(result.title),
    url: result.url,
    description: stripBraveTags(result.description),
    age: result.age || result.page_age || '',
    type,
    excerpt: '',
    fetched: false,
    fetchError: '',
  };
}

function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    const parsed = safeUrl(source.url);
    if (!parsed) continue;
    const key = parsed.toString().replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

function wantsCurrentResults(query) {
  return CURRENT_QUERY_RE.test(String(query ?? ''));
}

async function runBraveSearch(apiKey, query, count = 10, endpoint = 'web', options = {}) {
  const url = new URL(`https://api.search.brave.com/res/v1/${endpoint}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('country', 'us');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('spellcheck', '1');
  if (endpoint === 'web' && options.freshness) {
    url.searchParams.set('freshness', options.freshness);
  }

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Brave ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

function presentationInstructions(presentation) {
  switch (presentation) {
    case 'bullets':
      return 'Use concise bullets after the direct answer. Keep each bullet useful and cite it.';
    case 'briefing':
      return 'Use a briefing shape: answer, key points, caveats, and what to watch next.';
    case 'compare':
      return 'Compare options directly. Use a compact table only if it improves clarity.';
    case 'timeline':
      return 'Use chronological order when dates are available. Mention dates explicitly.';
    default:
      return 'Use short paragraphs, with bullets only when they make the findings easier to scan.';
  }
}

function modeInstructions(mode) {
  switch (mode) {
    case 'premium':
      return 'Premium mode: synthesize primarily from page excerpts, use broader source coverage, and be extra careful about recency.';
    case 'sources':
      return 'Sources only mode: no AI answer should be generated.';
    default:
      return 'Default mode: answer from current search context and avoid overclaiming.';
  }
}

function findPreferredModel(available, ids) {
  for (const id of ids) {
    const wanted = id.toLowerCase();
    const found = available.find(m =>
      String(m.id ?? '').toLowerCase() === wanted ||
      `${String(m.provider ?? '').toLowerCase()}/${String(m.id ?? '').toLowerCase()}` === wanted
    );
    if (found) return found;
  }
  return null;
}

async function setSearchModelForMode(session, mode) {
  const available = await fetchModels(true).catch(() => []);
  const preferredIds = mode === 'premium'
    ? [
        'anthropic/claude-sonnet-4.6',
        'google/gemini-3.1-pro-preview',
        'openai/gpt-5.2',
        'openai/gpt-5.1',
      ]
    : [
        'deepseek/deepseek-v4-flash',
        'qwen/qwen3.6-flash',
        'qwen/qwen3.6-27b',
      ];
  const preferred = findPreferredModel(available, preferredIds);
  if (preferred) {
    const model = getModelRegistry().find(preferred.provider, preferred.id);
    if (model) {
      await session.setModel(model);
      return true;
    }
  }

  const anySession = [...piSessions.values()][0]?.session;
  if (anySession?.model) {
    await session.setModel(anySession.model);
    return true;
  }

  const qwenModel = available.find(m =>
    String(m.id ?? '').toLowerCase().includes('qwen') &&
    String(m.id ?? '').includes('3.6') &&
    (String(m.id ?? '').includes('flash') || String(m.id ?? '').includes('27'))
  );
  if (qwenModel) {
    const model = getModelRegistry().find(qwenModel.provider, qwenModel.id);
    if (model) {
      await session.setModel(model);
      return true;
    }
  }
  return false;
}

function buildSearchPrompt({ query, sources, mode, presentation }) {
  const searchContext = sources
    .slice(0, MAX_PROMPT_SOURCES)
    .map((r, i) => {
      const parts = [
        `[${i + 1}] ${r.title}`,
        `URL: ${r.url}`,
        r.age ? `Date/Age: ${r.age}` : '',
        r.description ? `Snippet: ${r.description}` : '',
        r.excerpt ? `Page excerpt: ${r.excerpt}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n---\n');

  return `You are a concise search assistant. Answer the user's question based only on the sources provided below.

Presentation rules:
- Start with the direct answer in 1-2 sentences.
- Then give the most useful supporting details.
- Cite claims inline as [1], [2], etc. matching the numbered sources.
- Prefer compact bullets when comparing items, listing steps, or summarizing multiple findings.
- Say what is uncertain or missing if the sources do not support a confident answer.
- Do not pad the answer, repeat source snippets, fabricate URLs, or cite sources you did not use.
- Keep the answer easy and light.

${modeInstructions(mode)}
${presentationInstructions(presentation)}

Sources:
${searchContext}

User question: ${query}`;
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
      const data = await runBraveSearch(apiKey, query, count, 'web');
      return { success: true, data };
    } catch (e) {
      console.error('[brave:search] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  /* ------------------------------------------------------------------ */
  /*  AI Search — Brave + one-shot AI answer (separate session)          */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('ai:search:start', async (_event, args) => {
    let session = null;
    try {
      const { requestId, query } = args ?? {};
      const trimmed = String(query ?? '').trim();
      if (!trimmed) return { success: false, error: 'Empty query' };

      const mode = normalizeMode(args?.mode);
      const presentation = normalizePresentation(args?.presentation);
      const preferCurrent = mode === 'premium' || wantsCurrentResults(trimmed);
      const searchCount = mode === 'premium' ? 12 : 10;
      const fetchLimit = mode === 'premium' ? PREMIUM_FETCHED_SOURCES : DEFAULT_FETCHED_SOURCES;
      const apiKey = braveApiKey || process.env.BRAVE_API_KEY;
      if (!apiKey) return { success: false, error: 'Brave API key not set' };

      // Step 1 — Brave Search
      const webSearches = [];
      if (preferCurrent) {
        webSearches.push(runBraveSearch(apiKey, trimmed, searchCount, 'web', { freshness: 'pm' }));
        webSearches.push(runBraveSearch(apiKey, trimmed, searchCount, 'web', { freshness: 'py' }));
      }
      webSearches.push(runBraveSearch(apiKey, trimmed, searchCount, 'web'));

      const webResponses = await Promise.allSettled(webSearches);
      const webResults = [];
      let firstWebError = null;
      for (const response of webResponses) {
        if (response.status === 'fulfilled') {
          const data = response.value;
          webResults.push(...(data.web?.results ?? data.results ?? []));
        } else {
          firstWebError = firstWebError || response.reason;
          console.warn('[ai:search] web search variant unavailable:', response.reason?.message || String(response.reason));
        }
      }
      if (webResults.length === 0 && firstWebError) throw firstWebError;

      const sources = dedupeSources(webResults.map(r => sourceFromResult(r, 'web')))
        .slice(0, MAX_PROMPT_SOURCES);

      if (preferCurrent) {
        try {
          const newsData = await runBraveSearch(apiKey, trimmed, searchCount, 'news');
          const newsResults = newsData.results ?? newsData.news?.results ?? [];
          const merged = dedupeSources([
            ...newsResults.map(r => sourceFromResult(r, 'news')),
            ...sources,
          ]).slice(0, MAX_PROMPT_SOURCES);
          sources.splice(0, sources.length, ...merged);
        } catch (e) {
          console.warn('[ai:search] news search unavailable:', e?.message || String(e));
        }
      }

      if (mode === 'default' || mode === 'premium') {
        const fetches = await Promise.allSettled(
          sources.slice(0, fetchLimit).map(source => fetchReadablePage(source.url))
        );
        fetches.forEach((result, index) => {
          const source = sources[index];
          if (!source) return;
          if (result.status === 'fulfilled' && result.value.success) {
            source.excerpt = result.value.content;
            source.fetched = true;
          } else {
            source.fetchError = result.status === 'fulfilled'
              ? result.value.error
              : result.reason?.message || String(result.reason);
          }
        });
      }

      if (mode === 'sources') {
        return {
          success: true,
          requestId,
          mode,
          presentation,
          sources,
          aiAnswer: '',
        };
      }

      // Step 2 — Build AI prompt with search context
      const searchContext = sources
        .map((r, i) => {
          const parts = [
            `[${i + 1}] ${r.title}`,
            `URL: ${r.url}`,
            r.age ? `Date/Age: ${r.age}` : '',
            r.description ? `Snippet: ${r.description}` : '',
            r.excerpt ? `Page excerpt: ${r.excerpt}` : '',
          ].filter(Boolean);
          return parts.join('\n');
        })
        .join('\n---\n');
      const currentDate = new Date().toISOString().slice(0, 10);

      const systemPrompt = `You are a concise search assistant. Today is ${currentDate}. Answer the user's question based **only** on the search results provided below.

Rules:
- Start with the direct answer in 1-2 sentences
- Then give the most useful supporting details
- Keep it compact and easy to scan
- If the search results don't contain enough info, say so briefly
- For current, news, or time-sensitive questions, prefer recent/news sources. If the available sources are old or stale, say that clearly instead of presenting them as current.
- Cite sources inline as [1], [2], etc. matching the numbered results
- Do NOT fabricate URLs or claim sources you don't have
- Do not pad the answer or repeat source snippets

${modeInstructions(mode)}
${presentationInstructions(presentation)}
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
      const created = await createAgentSession({
        cwd,
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: true } }),
        thinkingLevel: 'low',
        authStorage: getAuthStorage(),
        modelRegistry: getModelRegistry(),
      });
      session = created.session;

      // Model: choose a search-appropriate model when available, then fall
      // back to the user's active chat model.
      await setSearchModelForMode(session, mode);

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
        mode,
        presentation,
        sources,
        aiAnswer: answerText,
      };
    } catch (e) {
      console.error('[ai:search:start] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    } finally {
      if (session) {
        try { await session.dispose(); } catch (_) {}
      }
      if (args?.requestId) aiSearchSessions.delete(args.requestId);
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

  ipcMain.handle('web:scrape', async (_event, args) => {
    try {
      const url = String(args?.url ?? '').trim();
      if (!url) return { success: false, error: 'Missing URL' };
      const result = await fetchReadablePage(url, MAX_PREVIEW_CHARS);
      if (!result.success) return result;
      return { success: true, url, content: result.content };
    } catch (e) {
      console.error('[web:scrape] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });
}

module.exports = { register };

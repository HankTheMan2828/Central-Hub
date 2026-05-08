/* ------------------------------------------------------------------ */
/*  Plain Chat AI session.                                            */
/*                                                                    */
/*  Built-in coding tools (read/edit/write/bash/etc.) are disabled.   */
/*  The AI gets two custom tools:                                     */
/*    - web_search — Brave Search (no-op if Brave key not configured) */
/*    - weather    — Open-Meteo (free, key-less)                      */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - pi:plain-session-create                                       */
/* ------------------------------------------------------------------ */

const { getMainWindow, piSessions } = require('./shared');
const { createSession, snapshot, truncateEventForIpc } = require('./pi-sdk');

let typeboxModule = null;
let webSearchToolDef = null;
let weatherToolDef = null;

async function loadTypebox() {
  if (!typeboxModule) typeboxModule = await import('typebox');
  return typeboxModule;
}

/* ------------------------------------------------------------------ */
/*  web_search — Brave Search                                          */
/* ------------------------------------------------------------------ */
function stripTags(html) {
  return String(html ?? '').replace(/<[^>]+>/g, '');
}

async function runBraveQuery(apiKey, query, count) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('country', 'us');
  url.searchParams.set('search_lang', 'en');

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

async function getWebSearchTool() {
  if (webSearchToolDef) return webSearchToolDef;
  const { Type } = await loadTypebox();
  webSearchToolDef = {
    name: 'web_search',
    label: 'Web search',
    description:
      'Search the live web via Brave Search. Returns the top results (title, URL, snippet) for the given query. Use this when the user asks something requiring current information, news, facts you are unsure about, or anything time-sensitive. Requires the user to have configured a Brave Search API key in Settings; otherwise the tool returns a clear "not configured" message.',
    promptSnippet: 'web_search — search the web (Brave) and return the top results.',
    promptGuidelines: [
      'Only call web_search when current or external information is genuinely needed. For general chat or simple questions you already know the answer to, just answer directly.',
      'Form a focused query — short keyword phrases work better than full sentences.',
      'Call this tool AT MOST ONCE per user question. The first response IS the data — do not call it again to "verify" or "double-check". If a single result set is not enough, write your answer with what you have rather than re-querying.',
      'After the tool returns, cite at most 1-3 of the most relevant sources inline as plain text (e.g. "via brave.com"). Do not paste raw results back to the user.',
    ],
    parameters: Type.Object(
      {
        query: Type.String({
          description: 'The search query. Short keyword phrases work best.',
        }),
        count: Type.Optional(
          Type.Number({
            description: 'Number of results to return (1-10). Default 5.',
            minimum: 1,
            maximum: 10,
          })
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const query = String(params?.query ?? '').trim();
      if (!query) {
        throw new Error('web_search: query is required.');
      }
      const apiKey = process.env.BRAVE_API_KEY;
      if (!apiKey) {
        return {
          content: [
            {
              type: 'text',
              text: 'web_search is not available: the user has not configured a Brave Search API key in Settings. Tell the user briefly that you cannot search the web right now and answer from your own knowledge.',
            },
          ],
          details: { configured: false },
        };
      }

      const requested = Number(params?.count);
      const count = Number.isFinite(requested)
        ? Math.max(1, Math.min(10, Math.floor(requested)))
        : 5;

      try {
        const data = await runBraveQuery(apiKey, query, count);
        const results = Array.isArray(data?.web?.results) ? data.web.results : [];
        if (results.length === 0) {
          return {
            content: [
              { type: 'text', text: `No results for "${query}".` },
            ],
            details: { count: 0 },
          };
        }
        const lines = results.slice(0, count).map((r, i) => {
          const title = stripTags(r.title);
          const desc = stripTags(r.description);
          return `[${i + 1}] ${title}\n    ${r.url}\n    ${desc}`;
        });
        return {
          content: [
            {
              type: 'text',
              text: `Top ${lines.length} results for "${query}":\n\n${lines.join('\n\n')}\n\n(These are the search results. Do not call web_search again for this question — write your reply now.)`,
            },
          ],
          details: { count: lines.length, query },
        };
      } catch (e) {
        throw new Error(`web_search failed: ${e?.message || String(e)}`);
      }
    },
  };
  return webSearchToolDef;
}

/* ------------------------------------------------------------------ */
/*  weather — Open-Meteo (no API key required)                         */
/* ------------------------------------------------------------------ */
const WEATHER_CODE = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  56: 'light freezing drizzle',
  57: 'dense freezing drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  66: 'light freezing rain',
  67: 'heavy freezing rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'slight snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
};

function describeWeatherCode(code) {
  return WEATHER_CODE[Number(code)] ?? 'unknown conditions';
}

async function geocodeLocation(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();
  const hit = Array.isArray(data?.results) ? data.results[0] : null;
  if (!hit) return null;
  return {
    name: hit.name,
    country: hit.country,
    admin1: hit.admin1,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone || 'auto',
  };
}

async function fetchForecast(lat, lon, units) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  );
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'auto');
  if (units === 'imperial') {
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('wind_speed_unit', 'mph');
  }

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

async function getWeatherTool() {
  if (weatherToolDef) return weatherToolDef;
  const { Type } = await loadTypebox();
  weatherToolDef = {
    name: 'weather',
    label: 'Weather lookup',
    description:
      'Look up the current weather and a short forecast for a location, using the free Open-Meteo API. Pass a city, region, or "City, Country" string. Returns current conditions plus the next 3 days. No API key required.',
    promptSnippet: 'weather — look up current conditions and a 3-day forecast for a place name.',
    promptGuidelines: [
      'Use this tool whenever the user asks about the weather, temperature, rain, or forecast for a location.',
      'If the user does not specify a location, ask once before calling the tool.',
      'Default to metric units unless the user is clearly in the US or asks for Fahrenheit.',
      'Call this tool AT MOST ONCE per user question. The data it returns is the answer — do not call it a second time to verify, refresh, or sanity-check. If a single response is not enough, write the answer with what you have rather than re-querying.',
      'Once the tool returns successfully, write your final reply directly to the user. Do not run another tool round.',
    ],
    parameters: Type.Object(
      {
        location: Type.String({
          description: 'A place name to look up, e.g. "Toronto", "Paris, France", "90210".',
        }),
        units: Type.Optional(
          Type.Union(
            [Type.Literal('metric'), Type.Literal('imperial')],
            { description: 'Unit system. Defaults to metric.' }
          )
        ),
      },
      { additionalProperties: false }
    ),
    async execute(_toolCallId, params) {
      const location = String(params?.location ?? '').trim();
      if (!location) {
        throw new Error('weather: location is required.');
      }
      const units = params?.units === 'imperial' ? 'imperial' : 'metric';
      const tempUnit = units === 'imperial' ? '°F' : '°C';
      const windUnit = units === 'imperial' ? 'mph' : 'km/h';

      const place = await geocodeLocation(location);
      if (!place) {
        return {
          content: [
            { type: 'text', text: `Could not find a location matching "${location}".` },
          ],
          details: { found: false, location },
        };
      }

      const data = await fetchForecast(place.latitude, place.longitude, units);
      const cur = data?.current ?? {};
      const daily = data?.daily ?? {};
      const days = Array.isArray(daily.time) ? daily.time.length : 0;

      const placeLabel = [place.name, place.admin1, place.country]
        .filter(Boolean)
        .join(', ');

      const lines = [];
      lines.push(`Weather for ${placeLabel}:`);
      lines.push(
        `Now: ${describeWeatherCode(cur.weather_code)}, ${cur.temperature_2m}${tempUnit} (feels like ${cur.apparent_temperature}${tempUnit}), humidity ${cur.relative_humidity_2m}%, wind ${cur.wind_speed_10m} ${windUnit}.`
      );

      if (days > 0) {
        lines.push('Next 3 days:');
        for (let i = 0; i < Math.min(3, days); i++) {
          const date = daily.time[i];
          const code = daily.weather_code?.[i];
          const hi = daily.temperature_2m_max?.[i];
          const lo = daily.temperature_2m_min?.[i];
          const pop = daily.precipitation_probability_max?.[i];
          const popStr = pop != null ? `, ${pop}% chance of precip` : '';
          lines.push(
            `  ${date}: ${describeWeatherCode(code)}, high ${hi}${tempUnit} / low ${lo}${tempUnit}${popStr}.`
          );
        }
      }

      lines.push('');
      lines.push('(This is fresh data from Open-Meteo. Do not call the weather tool again for this question — write your reply now.)');

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: { location: placeLabel, units },
      };
    },
  };
  return weatherToolDef;
}

/* ------------------------------------------------------------------ */
/*  IPC registration                                                  */
/* ------------------------------------------------------------------ */
function register(ipcMain) {
  /**
   * Create a Plain-Chat-flavoured session: built-in fs/bash tools disabled,
   * web_search + weather registered.
   */
  ipcMain.handle('pi:plain-session-create', async () => {
    try {
      const webSearch = await getWebSearchTool();
      const weather = await getWeatherTool();
      const session = await createSession({
        customTools: [webSearch, weather],
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
        '[PI]  plain session created:',
        sessionId,
        'model:',
        session.model?.provider,
        '/',
        session.model?.id,
        'tools:',
        [webSearch.name, weather.name].join(', ')
      );
      return { success: true, sessionId, ...snap };
    } catch (e) {
      console.error('[PI] plain-session-create error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });
}

module.exports = { register };

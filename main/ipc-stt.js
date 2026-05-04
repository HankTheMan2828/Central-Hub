/* eslint-disable @typescript-eslint/no-require-imports */
/* ------------------------------------------------------------------ */
/*  Speech-to-text IPC via OpenRouter, with renderer-side fallback.    */
/*                                                                    */
/*  IPC channel:                                                       */
/*    - pi:stt-transcribe                                              */
/* ------------------------------------------------------------------ */

const path = require('path');
const { app } = require('electron');

const {
  getAuthStorage,
  getModelRegistry,
  setAuthStorage,
  setModelRegistry,
} = require('./shared');

const OPENROUTER_STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const DEFAULT_STT_MODEL = 'openai/whisper-large-v3';

async function ensureAuthStorage() {
  if (getAuthStorage()) return;

  const { AuthStorage, ModelRegistry } = await import('@mariozechner/pi-coding-agent');
  const authPath = path.join(app.getPath('userData'), 'pi-auth.json');
  const authStorage = AuthStorage.create(authPath);
  setAuthStorage(authStorage);
  setModelRegistry(ModelRegistry.create(authStorage));
}

async function getOpenRouterApiKey() {
  await ensureAuthStorage();
  return (
    await getModelRegistry()?.getApiKeyForProvider?.('openrouter')
  ) || (
    await getAuthStorage().getApiKey('openrouter')
  ) || process.env.OPENROUTER_API_KEY;
}

function normalizeFloat32Audio(audio) {
  if (audio instanceof Float32Array) return audio;
  if (Array.isArray(audio)) return Float32Array.from(audio);
  if (ArrayBuffer.isView(audio)) {
    return new Float32Array(audio.buffer, audio.byteOffset, Math.floor(audio.byteLength / 4));
  }
  if (audio instanceof ArrayBuffer) return new Float32Array(audio);
  return null;
}

function encodeWavBase64(float32, sampleRate) {
  const bytesPerSample = 2;
  const dataBytes = float32.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(8 * bytesPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i] || 0));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), 44 + i * bytesPerSample);
  }

  return buffer.toString('base64');
}

function register(ipcMain) {
  ipcMain.handle('pi:stt-transcribe', async (_event, { audio, sampleRate, model, language }) => {
    try {
      const apiKey = await getOpenRouterApiKey();
      if (!apiKey) {
        console.warn('[STT] OpenRouter API key not configured; renderer will use local fallback');
        return { success: false, error: 'OpenRouter API key not configured' };
      }

      const float32 = normalizeFloat32Audio(audio);
      if (!float32 || float32.length === 0) {
        return { success: false, error: 'No audio provided' };
      }

      const effectiveSampleRate = Number.isFinite(sampleRate) && sampleRate > 0
        ? Math.round(sampleRate)
        : 16000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const body = {
        model: model || process.env.OPENROUTER_STT_MODEL || DEFAULT_STT_MODEL,
        input_audio: {
          data: encodeWavBase64(float32, effectiveSampleRate),
          format: 'wav',
        },
      };
      const effectiveLanguage = language || process.env.OPENROUTER_STT_LANGUAGE;
      if (effectiveLanguage) body.language = effectiveLanguage;

      const response = await fetch(OPENROUTER_STT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'CentralHub STT',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}

      if (!response.ok) {
        const message =
          json?.error?.message ||
          json?.message ||
          text ||
          `OpenRouter STT failed with HTTP ${response.status}`;
        return { success: false, error: message, status: response.status };
      }

      return {
        success: true,
        text: (json?.text || '').trim(),
        usage: json?.usage ?? null,
      };
    } catch (e) {
      const message = e?.name === 'AbortError'
        ? 'OpenRouter STT request timed out'
        : e?.message || String(e);
      return { success: false, error: message };
    }
  });
}

module.exports = { register };

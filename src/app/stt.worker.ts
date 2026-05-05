/* ------------------------------------------------------------------ */
/*  STT Web Worker — local Whisper via Transformers.js                */
/*  Main thread sends Float32 audio chunks → gets back text           */
/* ------------------------------------------------------------------ */
const { pipeline, env } = (0, eval)('require')("@xenova/transformers") as {
  pipeline: (...args: unknown[]) => Promise<unknown>;
  env: { allowLocalModels: boolean };
};

env.allowLocalModels = false;

let transcriber: ((audio: Float32Array) => Promise<{ text?: string }>) | null = null;
let loadingPromise: Promise<void> | null = null;

const MIN_AUDIO_SAMPLES = 1600;

interface ProgressUpdate {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

function loadWhisper(): Promise<void> {
  if (transcriber) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  self.postMessage({ type: "status", status: "loading", message: "Loading Whisper…" });

  const promise = pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-tiny.en",
    {
      quantized: true,
      // Transformers.js fires: initiate → download → progress (many) → done → ready.
      // The previous worker only forwarded "download" and "progress" together,
      // and read p.progress on events that don't carry it — so the UI saw 0%
      // throughout. Forward each status distinctly with the right fields.
      progress_callback: (p: ProgressUpdate) => {
        switch (p.status) {
          case "initiate":
            self.postMessage({
              type: "status",
              status: "loading",
              file: p.file,
              message: `Initializing ${p.file ?? "model"}…`,
            });
            return;
          case "download":
            self.postMessage({
              type: "status",
              status: "downloading",
              file: p.file,
              progress: 0,
              message: `Downloading ${p.file ?? "…"}`,
            });
            return;
          case "progress":
            self.postMessage({
              type: "status",
              status: "downloading",
              file: p.file,
              progress: typeof p.progress === "number" ? p.progress : 0,
              loaded: p.loaded,
              total: p.total,
              message: `Downloading ${p.file ?? "…"}`,
            });
            return;
          case "done":
            self.postMessage({
              type: "status",
              status: "downloading",
              file: p.file,
              progress: 100,
              message: `Done ${p.file ?? "…"}`,
            });
            return;
          case "ready":
            self.postMessage({
              type: "status",
              status: "ready",
              message: "Whisper ready",
            });
            return;
        }
      },
    },
  )
    .then((tr: unknown) => {
      transcriber = tr as (audio: Float32Array) => Promise<{ text?: string }>;
      // Some Transformers.js builds skip the "ready" status event — emit it
      // ourselves so the UI never gets stuck on "loading".
      self.postMessage({ type: "status", status: "ready", message: "Whisper ready" });
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      self.postMessage({ type: "status", status: "error", message: msg });
      throw e;
    })
    .finally(() => {
      loadingPromise = null;
    });

  loadingPromise = promise;
  return promise;
}

interface TranscribeMsg {
  type: "transcribe";
  audio: Float32Array;
  chunkId: number;
}

self.onmessage = async (e: MessageEvent<TranscribeMsg>) => {
  const data = e.data;
  if (data?.type !== "transcribe") return;
  const { audio, chunkId } = data;

  // Drop silent/short chunks silently — calling Whisper on these can throw
  // or just waste CPU on noise.
  if (!(audio instanceof Float32Array) || audio.length < MIN_AUDIO_SAMPLES) {
    return;
  }

  if (!transcriber) {
    try {
      await loadWhisper();
    } catch {
      return;
    }
  }
  if (!transcriber) return;

  try {
    const result = await transcriber(audio);
    const text = ((result as { text?: string })?.text ?? "").trim();
    if (text) {
      self.postMessage({ type: "result", text, chunkId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", message: msg, chunkId });
  }
};

export {};

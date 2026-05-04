"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "loading"
  | "downloading"
  | "ready"
  | "error";

export type STTBackend = "cloud" | "local" | "fallback" | "unknown";

export interface UseSTTOptions {
  onPartial: (text: string) => void;
  onLevels?: (levels: number[]) => void;
  chunkSec?: number;
  barCount?: number;
}

export interface UseSTTReturn {
  isRecording: boolean;
  status: STTStatus;
  progress: number;
  downloadFile: string | null;
  errorMessage: string | null;
  backend: STTBackend;
  lastTranscript: string | null;
  lastMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

const TARGET_SAMPLE_RATE = 16000;
const MIN_CHUNK_SAMPLES = 1600;
const SPEECH_MIN_RMS = 0.008;
const SPEECH_MIN_PEAK = 0.035;
const SPEECH_MIN_ACTIVE_RATIO = 0.012;
const ACTIVE_SAMPLE_THRESHOLD = 0.012;
const SILENCE_EDGE_THRESHOLD = 0.01;
const SILENCE_PAD_SAMPLES = Math.round(TARGET_SAMPLE_RATE * 0.2);

interface AudioStats {
  rms: number;
  peak: number;
  activeRatio: number;
}

function getIpc() {
  if (typeof window === "undefined") return null;
  try {
    const electron = (0, eval)("require")("electron") as {
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      };
    };
    return electron.ipcRenderer;
  } catch {
    return null;
  }
}

function resampleTo16k(src: Float32Array, srcRate: number): Float32Array {
  if (srcRate === TARGET_SAMPLE_RATE) return new Float32Array(src);
  const ratio = srcRate / TARGET_SAMPLE_RATE;
  const len = Math.floor(src.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = src[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

function getAudioStats(audio: Float32Array): AudioStats {
  if (audio.length === 0) return { rms: 0, peak: 0, activeRatio: 0 };

  let sumSquares = 0;
  let peak = 0;
  let active = 0;
  for (let i = 0; i < audio.length; i++) {
    const abs = Math.abs(audio[i] ?? 0);
    sumSquares += abs * abs;
    if (abs > peak) peak = abs;
    if (abs >= ACTIVE_SAMPLE_THRESHOLD) active++;
  }

  return {
    rms: Math.sqrt(sumSquares / audio.length),
    peak,
    activeRatio: active / audio.length,
  };
}

function hasSpeech(stats: AudioStats): boolean {
  return (
    stats.rms >= SPEECH_MIN_RMS &&
    stats.peak >= SPEECH_MIN_PEAK &&
    stats.activeRatio >= SPEECH_MIN_ACTIVE_RATIO
  );
}

function trimQuietEdges(audio: Float32Array): Float32Array {
  let start = 0;
  let end = audio.length - 1;

  while (start < audio.length && Math.abs(audio[start] ?? 0) < SILENCE_EDGE_THRESHOLD) {
    start++;
  }
  while (end > start && Math.abs(audio[end] ?? 0) < SILENCE_EDGE_THRESHOLD) {
    end--;
  }

  if (start >= end) return audio;

  start = Math.max(0, start - SILENCE_PAD_SAMPLES);
  end = Math.min(audio.length - 1, end + SILENCE_PAD_SAMPLES);
  return new Float32Array(audio.subarray(start, end + 1));
}

function shouldIgnoreTranscript(text: string, stats?: AudioStats): boolean {
  const normalized = text.trim().toLowerCase().replace(/[^\w\s']/g, "");
  if (!normalized) return true;

  const commonSilenceArtifacts = new Set([
    "you",
    "thank you",
    "thanks",
    "bye",
    "okay",
    "ok",
  ]);

  return (
    commonSilenceArtifacts.has(normalized) &&
    (!stats || stats.rms < 0.018 || stats.activeRatio < 0.025)
  );
}

interface WorkerStatusMsg {
  type: "status";
  status: "loading" | "downloading" | "ready" | "error";
  progress?: number;
  file?: string;
  message?: string;
}

interface WorkerResultMsg {
  type: "result";
  text: string;
  chunkId: number;
}

interface WorkerErrorMsg {
  type: "error";
  message: string;
  chunkId?: number;
}

type WorkerMsg = WorkerStatusMsg | WorkerResultMsg | WorkerErrorMsg;

interface CloudSTTResult {
  success?: boolean;
  text?: string;
  error?: string;
}

export function useSTT({
  onPartial,
  onLevels,
  chunkSec = 3,
  barCount = 32,
}: UseSTTOptions): UseSTTReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<STTStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [downloadFile, setDownloadFile] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [backend, setBackend] = useState<STTBackend>("unknown");
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  // Stash callbacks in refs so the audio plumbing doesn't re-init when
  // a parent re-renders with new closures.
  const onPartialRef = useRef(onPartial);
  const onLevelsRef = useRef(onLevels);
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onLevelsRef.current = onLevels; }, [onLevels]);

  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pcmBufferRef = useRef<Float32Array>(new Float32Array(0));
  const pcmCountRef = useRef(0);
  const nativeRateRef = useRef(0);
  const transcribeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const transcribeBusyRef = useRef(false);
  const cloudWarningShownRef = useRef(false);
  const chunkStatsRef = useRef<Map<number, AudioStats>>(new Map());

  // Mount the Whisper worker once.
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../app/stt.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      setErrorMessage(`Worker failed to start: ${msg}`);
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const data = e.data;
      switch (data.type) {
        case "status": {
          if (data.status === "loading") {
            setStatus("loading");
            setProgress(0);
            setDownloadFile(data.file ?? null);
          } else if (data.status === "downloading") {
            setStatus("downloading");
            if (typeof data.progress === "number") {
              setProgress(Math.round(data.progress));
            }
            if (data.file) setDownloadFile(data.file);
          } else if (data.status === "ready") {
            setStatus("ready");
            setProgress(100);
            setDownloadFile(null);
          } else if (data.status === "error") {
            setStatus("error");
            setErrorMessage(data.message ?? "Unknown error");
          }
          return;
        }
        case "result": {
          const text = data.text?.trim();
          const stats = chunkStatsRef.current.get(data.chunkId);
          chunkStatsRef.current.delete(data.chunkId);
          if (text && !shouldIgnoreTranscript(text, stats)) {
            setBackend("local");
            setStatus("ready");
            setLastTranscript(text);
            setLastMessage("Inserted local transcript");
            onPartialRef.current?.(text);
          } else if (text) {
            setStatus("listening");
            setLastMessage("Ignored low-signal transcript");
          }
          return;
        }
        case "error": {
          // Per-chunk failures are non-fatal (often short/silent audio).
          console.warn("[useSTT] chunk error:", data.message);
          return;
        }
      }
    };

    worker.onerror = (err) => {
      setStatus("error");
      setErrorMessage(err.message ?? "Worker error");
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const transcribeWithCloud = useCallback(
    async (audio: Float32Array): Promise<CloudSTTResult> => {
      const ipc = getIpc();
      if (!ipc) return { success: false, error: "IPC unavailable" };

      const result = await ipc.invoke("pi:stt-transcribe", {
        audio,
        sampleRate: TARGET_SAMPLE_RATE,
      });
      return (result ?? { success: false, error: "No STT response" }) as CloudSTTResult;
    },
    [],
  );

  const transcribeChunk = useCallback(async (
    audio16k: Float32Array,
    chunkId: number,
    stats: AudioStats,
  ) => {
    const fallbackAudio = new Float32Array(audio16k);

    try {
      setBackend("cloud");
      setStatus("transcribing");
      setLastMessage("Transcribing with OpenRouter");
      const cloud = await transcribeWithCloud(audio16k);
      if (cloud.success) {
        const text = cloud.text?.trim();
        if (text && !shouldIgnoreTranscript(text, stats)) {
          setLastTranscript(text);
          setLastMessage("Inserted OpenRouter transcript");
          onPartialRef.current?.(text);
          setStatus("ready");
          setProgress(100);
          return;
        }

        setStatus("listening");
        setLastMessage(text ? "Ignored low-signal transcript" : "OpenRouter returned no text");
        return;
      }

      if (!cloudWarningShownRef.current) {
        cloudWarningShownRef.current = true;
        console.warn("[useSTT] OpenRouter STT unavailable, falling back to local Whisper:", cloud.error);
      }
    } catch (e: unknown) {
      if (!cloudWarningShownRef.current) {
        cloudWarningShownRef.current = true;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[useSTT] OpenRouter STT failed, falling back to local Whisper:", msg);
      }
      setLastMessage("OpenRouter failed; using local fallback");
    }

    setBackend("fallback");
    chunkStatsRef.current.set(chunkId, stats);
    workerRef.current?.postMessage(
      { type: "transcribe", audio: fallbackAudio, chunkId },
      [fallbackAudio.buffer],
    );
  }, [transcribeWithCloud]);

  const cleanupAudio = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch { /* noop */ }
      workletNodeRef.current = null;
    }
    if (silentGainRef.current) {
      try { silentGainRef.current.disconnect(); } catch { /* noop */ }
      silentGainRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* noop */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* noop */ }
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* noop */ });
      audioCtxRef.current = null;
    }
    pcmBufferRef.current = new Float32Array(0);
    pcmCountRef.current = 0;
    transcribeBusyRef.current = false;
    chunkStatsRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    cleanupAudio();
    setIsRecording(false);
  }, [cleanupAudio]);

  const start = useCallback(async () => {
    if (isRecording) return;
    setErrorMessage(null);
    setBackend("cloud");
    setStatus("listening");
    setLastMessage("Listening");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setErrorMessage(`Microphone denied: ${msg}`);
      return;
    }

    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new Ctx();
    audioCtxRef.current = audioCtx;
    streamRef.current = stream;
    nativeRateRef.current = audioCtx.sampleRate;

    let workletNode: AudioWorkletNode;
    try {
      await audioCtx.audioWorklet.addModule("./stt-worklet.js");
      workletNode = new AudioWorkletNode(audioCtx, "stt-recorder");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setErrorMessage(`AudioWorklet load failed: ${msg}`);
      cleanupAudio();
      return;
    }
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = ev.data;
      const buf = pcmBufferRef.current;
      const count = pcmCountRef.current;
      if (count + frame.length > buf.length) {
        const newSize = Math.max((count + frame.length) * 2, 16000);
        const bigger = new Float32Array(newSize);
        bigger.set(buf.subarray(0, count));
        pcmBufferRef.current = bigger;
      }
      pcmBufferRef.current.set(frame, count);
      pcmCountRef.current = count + frame.length;
    };

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    // Capture branch: source → workletNode (no connection to destination,
    // so the mic doesn't echo through the speakers).
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    silentGainRef.current = silentGain;
    source.connect(workletNode);
    workletNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    // Visualizer branch (parallel, dead-end): source → analyser.
    // Independent of capture — bars keep animating even if Whisper stalls.
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.3;
    analyserRef.current = analyser;
    source.connect(analyser);

    pcmBufferRef.current = new Float32Array(audioCtx.sampleRate * 30);
    pcmCountRef.current = 0;

    if (onLevelsRef.current) {
      const barData = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(barData);
        const levels: number[] = new Array(barCount);
        const step = Math.max(1, Math.floor(barData.length / barCount));
        for (let i = 0; i < barCount; i++) {
          levels[i] = (barData[i * step] ?? 0) / 255;
        }
        onLevelsRef.current?.(levels);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    }

    sendIntervalRef.current = setInterval(() => {
      const count = pcmCountRef.current;
      if (count === 0) return;
      const slice = pcmBufferRef.current.subarray(0, count);
      const f32 = new Float32Array(slice);
      pcmCountRef.current = 0;

      const audio16k = resampleTo16k(f32, nativeRateRef.current);
      if (audio16k.length < MIN_CHUNK_SAMPLES) return;
      const stats = getAudioStats(audio16k);
      if (!hasSpeech(stats)) {
        setBackend("cloud");
        setStatus("listening");
        setLastMessage(
          `Listening - no speech detected (level ${Math.round(stats.rms * 1000)})`,
        );
        return;
      }
      const speechAudio = trimQuietEdges(audio16k);
      if (speechAudio.length < MIN_CHUNK_SAMPLES) return;
      if (transcribeBusyRef.current) {
        setStatus("listening");
        setLastMessage("Listening - finishing previous speech chunk");
        return;
      }
      const chunkId = Date.now();
      transcribeBusyRef.current = true;
      transcribeQueueRef.current = transcribeQueueRef.current
        .catch(() => { /* keep later chunks flowing */ })
        .then(() => transcribeChunk(speechAudio, chunkId, stats))
        .finally(() => {
          transcribeBusyRef.current = false;
        });
    }, chunkSec * 1000);

    setIsRecording(true);
  }, [isRecording, cleanupAudio, barCount, chunkSec, transcribeChunk]);

  const toggle = useCallback(() => {
    if (isRecording) stop();
    else void start();
  }, [isRecording, start, stop]);

  useEffect(() => {
    return () => { cleanupAudio(); };
  }, [cleanupAudio]);

  return {
    isRecording,
    status,
    progress,
    downloadFile,
    errorMessage,
    backend,
    lastTranscript,
    lastMessage,
    start,
    stop,
    toggle,
  };
}

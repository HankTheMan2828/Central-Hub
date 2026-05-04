"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  BarChart3,
  CheckCircle2,
  Flame,
  Gauge,
  Home,
  Keyboard,
  Quote,
  RotateCcw,
  Timer,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

const WORD_BANK = [
  "the","of","and","to","in","a","is","that","for","it","as","was","with","be",
  "by","on","not","he","this","are","or","his","from","at","which","but","have",
  "an","had","they","you","were","their","one","all","we","can","her","has","there",
  "been","if","more","when","will","would","who","so","no","out","up","into","them",
  "time","some","could","these","two","may","then","do","first","any","my","now",
  "such","like","our","over","man","me","even","most","made","after","also","did",
  "many","before","must","through","back","years","where","much","your","way","well",
  "down","should","because","each","just","those","people","how","too","little","state",
  "good","very","make","world","still","own","see","men","work","long","get","here",
  "between","both","life","being","under","never","day","same","another","know","while",
  "last","might","us","great","old","year","off","come","since","against","go","came",
  "right","used","take","three","himself","few","house","use","during","without","again",
  "place","american","around","however","home","small","found","thought","went","say",
  "part","once","general","high","upon","school","every","does","got","united","left",
  "number","course","war","until","always","away","something","fact","though","water",
  "less","public","put","think","almost","hand","enough","far","took","head","yet",
  "system","better","set","told","nothing","night","end","why","called","eyes","find",
  "going","look","asked","later","point","next","city","days","four","case","early",
  "line","move","kind","turn","group","room","voice","light","open","idea","clear",
  "learn","build","focus","quick","quiet","sharp","steady","window","signal","space",
];

const QUOTES = [
  "Clear thinking becomes clear writing when the hands learn to keep up.",
  "Small improvements compound into an easy rhythm when practice becomes ordinary.",
  "The fastest path is usually calm attention repeated without drama.",
  "Type the words in front of you and let the next line arrive on its own.",
  "A useful tool disappears while the work becomes a little easier.",
];

const PUNCTUATION = [".", ",", ";", "?", "!"];
const STORAGE_KEY = "typing-profile-v2";
const MAX_RECENT_RUNS = 8;

type TestKind = "time" | "words" | "quote";
type Phase = "home" | "ready" | "running" | "done";
type CharStatus = "pending" | "correct" | "incorrect" | "extra";

type TestConfig = {
  kind: TestKind;
  seconds: number;
  wordCount: number;
  punctuation: boolean;
  numbers: boolean;
};

type BestRecord = {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  at: number;
};

type RunRecord = BestRecord & {
  id: string;
  mode: string;
  correct: number;
  errors: number;
};

type TypingProfile = {
  bests: Record<string, BestRecord>;
  recent: RunRecord[];
  currentStreak: number;
  longestStreak: number;
  lastPracticeDay: string | null;
  totalCompleted: number;
};

const DEFAULT_CONFIG: TestConfig = {
  kind: "time",
  seconds: 30,
  wordCount: 50,
  punctuation: false,
  numbers: false,
};

function emptyProfile(): TypingProfile {
  return {
    bests: {},
    recent: [],
    currentStreak: 0,
    longestStreak: 0,
    lastPracticeDay: null,
    totalCompleted: 0,
  };
}

function loadProfile(): TypingProfile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as Partial<TypingProfile>;
    return {
      ...emptyProfile(),
      ...parsed,
      bests: parsed.bests && typeof parsed.bests === "object" ? parsed.bests : {},
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT_RUNS) : [],
      lastPracticeDay:
        typeof parsed.lastPracticeDay === "string" ? parsed.lastPracticeDay : null,
    };
  } catch {
    return emptyProfile();
  }
}

function saveProfile(profile: TypingProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn("Failed to save typing profile:", err);
  }
}

function localDayId(ts = Date.now()) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousDayId(dayId: string) {
  const [year, month, day] = dayId.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() - 1);
  return localDayId(d.getTime());
}

function randomWord(last = "") {
  let word = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  if (word === last) {
    word = WORD_BANK[(Math.floor(Math.random() * WORD_BANK.length) + 1) % WORD_BANK.length];
  }
  return word;
}

function generateWords(count: number, config: TestConfig): string[] {
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < count; i++) {
    let word = randomWord(last);
    if (config.punctuation && i > 0 && i % 9 === 0) {
      word += PUNCTUATION[Math.floor(Math.random() * PUNCTUATION.length)];
    }
    if (config.punctuation && i % 17 === 0) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    if (config.numbers && i > 0 && i % 13 === 0) {
      word = String(10 + Math.floor(Math.random() * 890));
    }
    out.push(word);
    last = word;
  }
  return out;
}

function buildWords(config: TestConfig): string[] {
  if (config.kind === "quote") {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return quote.split(/\s+/);
  }
  const count = config.kind === "words" ? config.wordCount : 240;
  return generateWords(count, config);
}

function modeLabel(config: TestConfig) {
  const base =
    config.kind === "time"
      ? `time ${config.seconds}`
      : config.kind === "words"
      ? `words ${config.wordCount}`
      : "quote";
  const extras = [
    config.punctuation ? "punctuation" : "",
    config.numbers ? "numbers" : "",
  ].filter(Boolean);
  return extras.length ? `${base} ${extras.join(" ")}` : base;
}

function testKey(config: TestConfig) {
  return [
    config.kind,
    config.kind === "time" ? config.seconds : config.wordCount,
    config.punctuation ? "p" : "plain",
    config.numbers ? "n" : "words",
  ].join(":");
}

function calculateConsistency(samples: number[]) {
  const clean = samples.filter((n) => Number.isFinite(n) && n > 0);
  if (clean.length < 3) return 100;
  const mean = clean.reduce((sum, n) => sum + n, 0) / clean.length;
  if (mean <= 0) return 100;
  const variance =
    clean.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / clean.length;
  const coefficient = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, Math.round(100 - coefficient * 100)));
}

function calculateStats(
  words: string[],
  typed: string[],
  elapsedSec: number,
  samples: number[],
) {
  let correct = 0;
  let incorrect = 0;
  let extra = 0;
  let totalTyped = 0;

  typed.forEach((entry, i) => {
    const target = words[i] ?? "";
    totalTyped += entry.length;
    for (let c = 0; c < entry.length; c++) {
      if (c < target.length) {
        if (entry[c] === target[c]) correct++;
        else incorrect++;
      } else {
        extra++;
      }
    }
  });

  const minutes = elapsedSec / 60;
  const totalChars = correct + incorrect + extra;
  const wpm = minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
  const rawWpm = minutes > 0 ? Math.round(totalChars / 5 / minutes) : 0;
  const accuracy = totalChars > 0 ? Math.round((correct / totalChars) * 100) : 100;
  return {
    correct,
    incorrect,
    extra,
    totalTyped,
    wpm,
    rawWpm,
    accuracy,
    consistency: calculateConsistency(samples),
  };
}

export function TypingTab() {
  const [config, setConfig] = useState<TestConfig>(DEFAULT_CONFIG);
  const [words, setWords] = useState<string[]>(() => buildWords(DEFAULT_CONFIG));
  const [typed, setTyped] = useState<string[]>([""]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("home");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [paceSamples, setPaceSamples] = useState<number[]>([]);
  const [profile, setProfile] = useState<TypingProfile>(() => emptyProfile());
  const [hydrated, setHydrated] = useState(false);
  const [savedFinishAt, setSavedFinishAt] = useState<number | null>(null);
  const [resultWasBest, setResultWasBest] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);

  const activeKey = useMemo(() => testKey(config), [config]);
  const activeModeLabel = useMemo(() => modeLabel(config), [config]);
  const activeBest = profile.bests[activeKey];

  const elapsedSec = useMemo(() => {
    if (startedAt === null) return 0;
    const end = finishedAt ?? now;
    return Math.max(0, (end - startedAt) / 1000);
  }, [finishedAt, now, startedAt]);

  const remaining = useMemo(() => {
    if (config.kind !== "time") return 0;
    return Math.max(0, config.seconds - elapsedSec);
  }, [config.kind, config.seconds, elapsedSec]);

  const stats = useMemo(
    () => calculateStats(words, typed, elapsedSec, paceSamples),
    [elapsedSec, paceSamples, typed, words],
  );

  const reset = useCallback(
    (nextConfig = config, nextPhase: Phase = "ready") => {
      setWords(buildWords(nextConfig));
      setTyped([""]);
      setWordIdx(0);
      setPhase(nextPhase);
      setStartedAt(null);
      setFinishedAt(null);
      setSavedFinishAt(null);
      setResultWasBest(false);
      setPaceSamples([]);
      setNow(Date.now());
      requestAnimationFrame(() => containerRef.current?.focus());
    },
    [config],
  );

  const updateConfig = useCallback(
    (patch: Partial<TestConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        reset(next, "ready");
        return next;
      });
    },
    [reset],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveProfile(profile);
  }, [hydrated, profile]);

  useEffect(() => {
    requestAnimationFrame(() => containerRef.current?.focus());
  }, []);

  useEffect(() => {
    const el = activeWordRef.current;
    const container = wordsRef.current;
    if (!el || !container) return;
    const elTop = el.offsetTop;
    const rowHeight = Math.max(24, el.offsetHeight);
    if (elTop > container.scrollTop + rowHeight * 2) {
      container.scrollTo({ top: Math.max(0, elTop - rowHeight), behavior: "smooth" });
    }
  }, [wordIdx]);

  const finishRun = useCallback(() => {
    if (phase === "done") return;
    setPhase("done");
    setFinishedAt(Date.now());
  }, [phase]);

  useEffect(() => {
    if (phase !== "running" || startedAt === null) return;
    const handle = window.setInterval(() => {
      const tickNow = Date.now();
      const elapsed = Math.max(0, (tickNow - startedAt) / 1000);
      setNow(tickNow);
      setPaceSamples((prev) => {
        const nextRaw = calculateStats(words, typed, elapsed, prev).rawWpm;
        return [...prev, nextRaw].slice(-160);
      });
      if (config.kind === "time" && elapsed >= config.seconds) {
        finishRun();
      }
    }, 250);
    return () => window.clearInterval(handle);
  }, [config.kind, config.seconds, finishRun, phase, startedAt, typed, words]);

  useEffect(() => {
    if (!hydrated || finishedAt === null || savedFinishAt === finishedAt) return;
    if (stats.totalTyped === 0) return;

    const result: BestRecord = {
      wpm: stats.wpm,
      rawWpm: stats.rawWpm,
      accuracy: stats.accuracy,
      consistency: stats.consistency,
      at: finishedAt,
    };
    const run: RunRecord = {
      ...result,
      id: `run_${finishedAt}_${Math.random().toString(36).slice(2, 7)}`,
      mode: activeModeLabel,
      correct: stats.correct,
      errors: stats.incorrect + stats.extra,
    };
    const today = localDayId(finishedAt);
    const currentBest = profile.bests[activeKey];
    const runIsBest =
      !currentBest ||
      result.wpm > currentBest.wpm ||
      (result.wpm === currentBest.wpm && result.accuracy > currentBest.accuracy);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResultWasBest(runIsBest);
    setProfile((prev) => {
      const previousBest = prev.bests[activeKey];
      const isBest =
        !previousBest ||
        result.wpm > previousBest.wpm ||
        (result.wpm === previousBest.wpm && result.accuracy > previousBest.accuracy);
      const sameDay = prev.lastPracticeDay === today;
      const continued = prev.lastPracticeDay === previousDayId(today);
      const nextStreak = sameDay
        ? prev.currentStreak
        : continued
        ? prev.currentStreak + 1
        : 1;

      return {
        ...prev,
        bests: isBest ? { ...prev.bests, [activeKey]: result } : prev.bests,
        recent: [run, ...prev.recent].slice(0, MAX_RECENT_RUNS),
        currentStreak: nextStreak,
        longestStreak: Math.max(prev.longestStreak, nextStreak),
        lastPracticeDay: today,
        totalCompleted: prev.totalCompleted + 1,
      };
    });
    setSavedFinishAt(finishedAt);
  }, [
    activeKey,
    activeModeLabel,
    finishedAt,
    hydrated,
    savedFinishAt,
    stats.accuracy,
    stats.consistency,
    stats.correct,
    stats.extra,
    stats.incorrect,
    stats.rawWpm,
    stats.totalTyped,
    stats.wpm,
    profile.bests,
  ]);

  const startRun = useCallback(() => {
    if (phase === "running") return;
    setPhase("running");
    setStartedAt(Date.now());
    setFinishedAt(null);
    setSavedFinishAt(null);
    setNow(Date.now());
    setPaceSamples([]);
  }, [phase]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (phase === "done") {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          reset(config, "ready");
        }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        reset(config, "ready");
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        reset(config, "home");
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        setTyped((prev) => {
          const next = [...prev];
          const current = next[wordIdx] ?? "";
          if (current.length > 0) {
            next[wordIdx] = current.slice(0, -1);
            return next;
          }
          if (wordIdx > 0) setWordIdx((idx) => Math.max(0, idx - 1));
          return next;
        });
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        const current = typed[wordIdx] ?? "";
        if (!current.trim()) return;
        if (phase !== "running") startRun();
        const nextIdx = wordIdx + 1;
        if (nextIdx >= words.length) {
          finishRun();
          return;
        }
        setWordIdx(nextIdx);
        setTyped((prev) => {
          if (prev[nextIdx] !== undefined) return prev;
          return [...prev, ""];
        });
        return;
      }

      if (e.key.length !== 1) return;
      e.preventDefault();
      if (phase !== "running") startRun();

      const target = words[wordIdx] ?? "";
      const nextLength = (typed[wordIdx]?.length ?? 0) + 1;
      setTyped((prev) => {
        const next = [...prev];
        const current = next[wordIdx] ?? "";
        if (current.length >= target.length + 14) return prev;
        next[wordIdx] = current + e.key;
        return next;
      });

      if (config.kind !== "time" && wordIdx === words.length - 1 && nextLength >= target.length) {
        window.setTimeout(finishRun, 0);
      }
    },
    [config, finishRun, phase, reset, startRun, typed, wordIdx, words],
  );

  const completedWords = Math.max(0, wordIdx);
  const progressLabel =
    config.kind === "time"
      ? `${Math.ceil(remaining)}s`
      : `${Math.min(completedWords + (phase === "done" ? 1 : 0), words.length)}/${words.length}`;
  const progressPercent =
    config.kind === "time"
      ? ((config.seconds - remaining) / config.seconds) * 100
      : (Math.min(completedWords, words.length) / words.length) * 100;
  return (
    <div
      className="flex-1 flex flex-col h-full min-w-[400px] border border-[var(--ch-border)] bg-[var(--ch-bg-base)] rounded-sm overflow-hidden"
      onClick={() => containerRef.current?.focus()}
    >
      <header className="px-4 py-2 border-b border-[var(--ch-border-subtle)] flex items-center gap-2 shrink-0">
        <Keyboard className="w-3.5 h-3.5 text-[var(--ch-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ch-accent)]">
          Typing
        </span>
        <span className="ml-2 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
          {activeModeLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--ch-warning)] font-mono">
            <Flame className="w-3 h-3" />
            {profile.currentStreak} day
          </span>
          <button
            type="button"
            onClick={() => reset(config, "home")}
            title="Home"
            className="w-7 h-7 flex items-center justify-center border border-[var(--ch-border)] rounded-sm text-[var(--ch-text-muted)] hover:border-[#FFB347]/50 hover:text-[var(--ch-accent)] transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => reset(config, "ready")}
            title="Restart"
            className="w-7 h-7 flex items-center justify-center border border-[var(--ch-border)] rounded-sm text-[var(--ch-text-muted)] hover:border-[#FFB347]/50 hover:text-[var(--ch-accent)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <section
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKey}
          className="flex-1 min-w-0 outline-none flex flex-col bg-[var(--ch-bg-page)]"
        >
          <div className="px-8 pt-6 shrink-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <ModeButton
                icon={Timer}
                active={config.kind === "time"}
                label="time"
                onClick={() => updateConfig({ kind: "time" })}
              />
              {[15, 30, 60].map((seconds) => (
                <Chip
                  key={seconds}
                  active={config.kind === "time" && config.seconds === seconds}
                  label={String(seconds)}
                  onClick={() => updateConfig({ kind: "time", seconds })}
                />
              ))}
              <ModeButton
                icon={BarChart3}
                active={config.kind === "words"}
                label="words"
                onClick={() => updateConfig({ kind: "words" })}
              />
              {[25, 50, 100].map((wordCount) => (
                <Chip
                  key={wordCount}
                  active={config.kind === "words" && config.wordCount === wordCount}
                  label={String(wordCount)}
                  onClick={() => updateConfig({ kind: "words", wordCount })}
                />
              ))}
              <ModeButton
                icon={Quote}
                active={config.kind === "quote"}
                label="quote"
                onClick={() => updateConfig({ kind: "quote" })}
              />
              <span className="mx-1 h-4 w-px bg-[var(--ch-border-subtle)]" />
              <Chip
                active={config.punctuation}
                label="@ punctuation"
                onClick={() => updateConfig({ punctuation: !config.punctuation })}
              />
              <Chip
                active={config.numbers}
                label="# numbers"
                onClick={() => updateConfig({ numbers: !config.numbers })}
              />
            </div>
          </div>

          <div className="px-8 py-5 shrink-0">
            <div className="grid grid-cols-4 gap-3">
              <LiveMetric label={config.kind === "time" ? "time" : "progress"} value={progressLabel} accent />
              <LiveMetric label="wpm" value={String(stats.wpm)} />
              <LiveMetric label="acc" value={`${stats.accuracy}%`} />
              <LiveMetric label="streak" value={String(profile.currentStreak)} warning />
            </div>
            <div className="mt-3 h-1 bg-[var(--ch-bg-elevated)] overflow-hidden">
              <div
                className="h-full bg-[var(--ch-accent)] transition-[width] duration-200"
                style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
              />
            </div>
          </div>

          <div
            ref={wordsRef}
            className="relative flex-1 min-h-0 overflow-hidden px-8 py-7 select-none"
          >
            {phase === "home" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--ch-bg-page)]/90 backdrop-blur-sm">
                <div className="w-full max-w-[560px]">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--ch-accent)] font-bold">
                    <Zap className="w-3.5 h-3.5" />
                    Focus run
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <HomeStat label="best" value={activeBest ? `${activeBest.wpm}` : "--"} suffix="wpm" />
                    <HomeStat label="runs" value={String(profile.totalCompleted)} />
                    <HomeStat label="longest" value={String(profile.longestStreak)} suffix="day" />
                  </div>
                  <button
                    type="button"
                    onClick={() => reset(config, "ready")}
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2 border border-[#FFB347]/40 rounded-sm text-[11px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    start
                  </button>
                </div>
              </div>
            )}

            <div className="max-w-[980px] text-[27px] leading-[1.85] font-mono tracking-normal">
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {words.map((word, i) => (
                  <WordView
                    key={`${i}-${word}`}
                    target={word}
                    typed={typed[i] ?? ""}
                    isActive={i === wordIdx && phase !== "done"}
                    isPast={i < wordIdx || phase === "done"}
                    ref={i === wordIdx ? activeWordRef : null}
                  />
                ))}
              </div>
            </div>

            {phase === "ready" && (
              <div className="pointer-events-none absolute inset-x-8 bottom-6 text-[10px] uppercase tracking-[0.22em] text-[var(--ch-text-faint)] font-mono">
                click here or start typing
              </div>
            )}
          </div>

          {phase === "done" && (
            <ResultPanel
              stats={stats}
              label={activeModeLabel}
              isNewBest={resultWasBest}
              onRestart={() => reset(config, "ready")}
            />
          )}
        </section>

        <aside className="w-[280px] shrink-0 border-l border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-[var(--ch-border-subtle)]">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--ch-accent)] font-bold">
              <Home className="w-3.5 h-3.5" />
              Home
            </div>
          </div>
          <div className="p-4 border-b border-[var(--ch-border-subtle)] grid grid-cols-2 gap-2">
            <SideMetric icon={Flame} label="streak" value={`${profile.currentStreak}`} tone="warning" />
            <SideMetric icon={Trophy} label="best" value={activeBest ? `${activeBest.wpm}` : "--"} tone="accent" />
            <SideMetric icon={Gauge} label="average" value={profile.recent.length ? `${Math.round(profile.recent.reduce((s, r) => s + r.wpm, 0) / profile.recent.length)}` : "--"} />
            <SideMetric icon={CheckCircle2} label="runs" value={`${profile.totalCompleted}`} />
          </div>

          <div className="px-4 py-3 border-b border-[var(--ch-border-subtle)]">
            <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
              Daily streak
            </div>
            <div className="mt-3 flex items-end gap-1.5 h-12">
              {Array.from({ length: 7 }).map((_, i) => {
                const active = i >= 7 - Math.min(7, profile.currentStreak);
                return (
                  <span
                    key={i}
                    className={`flex-1 rounded-sm border ${
                      active
                        ? "bg-[var(--ch-warning)] border-[var(--ch-warning)]"
                        : "bg-[var(--ch-bg-elevated)] border-[var(--ch-border-subtle)]"
                    }`}
                    style={{ height: `${18 + i * 4}px` }}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-4 py-3 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
              Recent
            </div>
            {profile.recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-[10px] uppercase tracking-widest text-[var(--ch-text-faint)]">
                No runs yet
              </div>
            ) : (
              <div>
                {profile.recent.map((run) => (
                  <div
                    key={run.id}
                    className="px-4 py-3 border-t border-[var(--ch-border-faint)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[18px] leading-none font-mono text-[var(--ch-text)]">
                        {run.wpm}
                      </span>
                      <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)]">
                        wpm
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-[var(--ch-success)]">
                        {run.accuracy}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)]">
                      <span className="truncate">{run.mode}</span>
                      <span className="ml-auto">{formatRunTime(run.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatRunTime(ts: number) {
  try {
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function ModeButton({
  icon: Icon,
  active,
  label,
  onClick,
}: {
  icon: typeof Timer;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 border px-2 transition-colors ${
        active
          ? "border-[var(--ch-accent)] bg-[var(--ch-accent-10)] text-[var(--ch-accent)]"
          : "border-[var(--ch-border-subtle)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 border px-2 transition-colors ${
        active
          ? "border-[var(--ch-accent)] bg-[var(--ch-accent-10)] text-[var(--ch-accent)]"
          : "border-[var(--ch-border-subtle)] text-[var(--ch-text-faint)] hover:text-[var(--ch-text)] hover:bg-[var(--ch-bg-hover)]"
      }`}
    >
      {label}
    </button>
  );
}

function LiveMetric({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
        {label}
      </div>
      <div
        className={`mt-1 text-[30px] leading-none font-mono tabular-nums truncate ${
          accent
            ? "text-[var(--ch-accent)]"
            : warning
            ? "text-[var(--ch-warning)]"
            : "text-[var(--ch-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HomeStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] px-3 py-3 rounded-sm">
      <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[24px] leading-none font-mono text-[var(--ch-text)]">
          {value}
        </span>
        {suffix && (
          <span className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SideMetric({
  icon: Icon,
  label,
  value,
  tone = "normal",
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  tone?: "normal" | "warning" | "accent";
}) {
  return (
    <div className="border border-[var(--ch-border-subtle)] bg-[var(--ch-bg-inset)] px-3 py-3 rounded-sm min-w-0">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
        <Icon
          className={`w-3 h-3 ${
            tone === "warning"
              ? "text-[var(--ch-warning)]"
              : tone === "accent"
              ? "text-[var(--ch-accent)]"
              : ""
          }`}
        />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`mt-2 text-[22px] leading-none font-mono tabular-nums ${
          tone === "warning"
            ? "text-[var(--ch-warning)]"
            : tone === "accent"
            ? "text-[var(--ch-accent)]"
            : "text-[var(--ch-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ResultPanel({
  stats,
  label,
  isNewBest,
  onRestart,
}: {
  stats: ReturnType<typeof calculateStats>;
  label: string;
  isNewBest: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="border-t border-[var(--ch-border-subtle)] bg-[var(--ch-bg-base)] px-8 py-5 shrink-0">
      <div className="flex items-center gap-3">
        <div className="grid grid-cols-5 gap-6 flex-1">
          <ResultStat label="wpm" value={stats.wpm} accent />
          <ResultStat label="raw" value={stats.rawWpm} />
          <ResultStat label="acc" value={`${stats.accuracy}%`} success />
          <ResultStat label="consistency" value={`${stats.consistency}%`} />
          <ResultStat label="errors" value={stats.incorrect + stats.extra} error />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-mono">
            {label}
          </div>
          {isNewBest && (
            <div className="mt-1 inline-flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-[var(--ch-accent)] font-mono">
              <Trophy className="w-3 h-3" />
              new best
            </div>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="mt-3 flex items-center gap-2 px-3 py-2 border border-[#FFB347]/40 rounded-sm text-[10px] uppercase tracking-widest font-mono text-[var(--ch-accent)] hover:bg-[var(--ch-accent-10)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            again
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  accent = false,
  success = false,
  error = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  success?: boolean;
  error?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-[var(--ch-text-faint)] font-bold">
        {label}
      </div>
      <div
        className={`mt-1 text-[25px] leading-none font-mono tabular-nums truncate ${
          accent
            ? "text-[var(--ch-accent)]"
            : success
            ? "text-[var(--ch-success)]"
            : error
            ? "text-[var(--ch-error)]"
            : "text-[var(--ch-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

type WordViewProps = {
  target: string;
  typed: string;
  isActive: boolean;
  isPast: boolean;
};

const WordView = forwardRef<HTMLSpanElement, WordViewProps>(function WordView(
  { target, typed, isActive, isPast },
  ref,
) {
  const chars: { ch: string; status: CharStatus }[] = [];
  for (let i = 0; i < target.length; i++) {
    if (i < typed.length) {
      chars.push({
        ch: target[i],
        status: typed[i] === target[i] ? "correct" : "incorrect",
      });
    } else {
      chars.push({ ch: target[i], status: "pending" });
    }
  }
  for (let i = target.length; i < typed.length; i++) {
    chars.push({ ch: typed[i], status: "extra" });
  }

  const wordWrong = isPast && typed.length > 0 && typed !== target;
  const cursorAtEnd = isActive && typed.length >= chars.length;

  return (
    <span
      ref={ref}
      className={`relative inline-block ${
        wordWrong ? "underline decoration-[var(--ch-error)] decoration-2 underline-offset-4" : ""
      }`}
    >
      {chars.map((c, i) => {
        const isCursor = isActive && i === typed.length;
        const color =
          c.status === "correct"
            ? "var(--ch-text)"
            : c.status === "incorrect"
            ? "var(--ch-error)"
            : c.status === "extra"
            ? "var(--ch-error)"
            : "var(--ch-text-faint)";
        return (
          <span
            key={i}
            style={{ color }}
            className={`relative ${
              isCursor
                ? "before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[var(--ch-accent)] before:animate-pulse"
                : ""
            }`}
          >
            {c.ch}
          </span>
        );
      })}
      {cursorAtEnd && (
        <span className="inline-block w-[2px] h-[1.1em] align-text-bottom bg-[var(--ch-accent)] animate-pulse ml-[1px]" />
      )}
      {wordWrong && (
        <XCircle className="absolute -right-3 -top-1 w-2.5 h-2.5 text-[var(--ch-error)] opacity-70" />
      )}
    </span>
  );
});

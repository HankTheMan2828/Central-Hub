/* ------------------------------------------------------------------ */
/*  Grok Build CLI bridge — separate from PI.                         */
/*                                                                    */
/*  Spawns the local Grok Build binary for headless turns             */
/*  (--output-format streaming-json) and maps NDJSON events to the    */
/*  renderer. SuperGrok OAuth comes from ~/.grok/auth.json via the    */
/*  CLI process itself; this module never copies credentials.         */
/* ------------------------------------------------------------------ */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');

const { getMainWindow } = require('./shared');

/** @type {Map<string, GrokSession>} */
const grokSessions = new Map();

const MAX_TOOL_RESULT_IPC = 8000;
const GROK_HOME = process.env.GROK_HOME || path.join(os.homedir(), '.grok');

/**
 * @typedef {'plain' | 'coding' | 'word'} GrokSessionKind
 * @typedef {{
 *   sessionId: string,
 *   sessionKind: GrokSessionKind,
 *   cwd: string,
 *   grokSessionId: string | null,
 *   child: import('child_process').ChildProcess | null,
 *   busy: boolean,
 * }} GrokSession
 */

function resolveGrokBinary() {
  const exe = process.platform === 'win32' ? 'grok.exe' : 'grok';
  const managed = path.join(GROK_HOME, 'bin', exe);
  if (fs.existsSync(managed)) return managed;

  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(which, ['grok'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000,
    });
    if (r.status === 0 && r.stdout) {
      const first = r.stdout.trim().split(/\r?\n/).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    }
  } catch (_) {}

  return null;
}

function readAuthStatus() {
  const authPath = path.join(GROK_HOME, 'auth.json');
  if (process.env.XAI_API_KEY && !fs.existsSync(authPath)) {
    return { authenticated: true, authMode: 'api_key' };
  }
  if (!fs.existsSync(authPath)) {
    return { authenticated: false, authMode: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    for (const val of Object.values(raw)) {
      if (
        val &&
        typeof val === 'object' &&
        (val.key || val.refresh_token || val.access_token || val.accessToken)
      ) {
        return { authenticated: true, authMode: 'oauth' };
      }
    }
  } catch (_) {}
  return { authenticated: false, authMode: null };
}

function probeVersion(binaryPath) {
  if (!binaryPath) return null;
  try {
    const r = spawnSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1' },
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    if (r.status === 0 && out) return out.split(/\r?\n/)[0].trim();
  } catch (_) {}
  return null;
}

function getStatus() {
  const binaryPath = resolveGrokBinary();
  const auth = readAuthStatus();
  return {
    installed: !!binaryPath,
    binaryPath: binaryPath || null,
    version: probeVersion(binaryPath),
    authenticated: auth.authenticated,
    authMode: auth.authMode,
    grokHome: GROK_HOME,
  };
}

function defaultCwd(requested) {
  if (requested && typeof requested === 'string' && requested.trim()) {
    const resolved = path.resolve(requested.trim());
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch (_) {}
  }
  return path.resolve(__dirname, '..');
}

function emitEvent(sessionId, event) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('grok:event', { sessionId, event });
  } catch (_) {}
}

function truncateToolPayload(value) {
  let str;
  if (typeof value === 'string') str = value;
  else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }
  if (str.length <= MAX_TOOL_RESULT_IPC) return str;
  return (
    str.slice(0, MAX_TOOL_RESULT_IPC) +
    `\n… (truncated ${str.length - MAX_TOOL_RESULT_IPC} more chars)`
  );
}

/** Map Grok streaming-json NDJSON line → renderer event. */
function mapGrokLine(line) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;

  switch (raw.type) {
    case 'text':
      return { type: 'text', data: raw.data ?? '' };
    case 'thought':
      return { type: 'thought', data: raw.data ?? '' };
    case 'tool_call':
      return {
        type: 'tool_call',
        id: raw.toolCallId || raw.id || `tool-${Date.now()}`,
        name: raw.toolName || raw.title || 'tool',
        status: raw.status || 'in_progress',
        input: raw.rawInput,
      };
    case 'tool_call_update':
      return {
        type: 'tool_call_update',
        id: raw.toolCallId || raw.id,
        status: raw.status || 'completed',
        output: truncateToolPayload(raw.rawOutput ?? raw.content ?? ''),
      };
    case 'usage':
      return {
        type: 'usage',
        usage: raw.usage || null,
        stopReason: raw.stopReason || null,
      };
    case 'end':
      return {
        type: 'end',
        grokSessionId: raw.sessionId || null,
        stopReason: raw.stopReason || null,
        usage: raw.usage || null,
        modelUsage: raw.modelUsage || null,
      };
    case 'error':
      return {
        type: 'error',
        message: raw.message || 'Grok error',
      };
    default:
      return null;
  }
}

/**
 * Tool restrictions by session kind.
 * Tool IDs from Grok Build docs (run_terminal_cmd, search_replace, etc.).
 */
function toolFlagsForKind(sessionKind) {
  if (sessionKind === 'coding') {
    return ['--always-approve'];
  }
  // Plain + word: block shell and file mutation tools.
  const disallowed = [
    'run_terminal_cmd',
    'search_replace',
    'write',
    'image_edit',
    'image_gen',
    'image_to_video',
    'reference_to_video',
    'spawn_subagent',
    'workflow',
  ].join(',');
  return ['--always-approve', '--disallowed-tools', disallowed];
}

/**
 * Model selection for Grok Build / SuperGrok.
 * SuperGrok CLI currently exposes grok-4.5 only (see `grok models`).
 * All session kinds use that until more models appear on the plan.
 */
function modelIdForKind(_sessionKind) {
  return 'grok-4.5';
}

function modelMetaForKind(_sessionKind) {
  return {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    provider: 'xai',
    reasoning: true,
    contextWindow: 500000,
    input: ['text'],
  };
}

function createSession({ sessionKind = 'coding', cwd } = {}) {
  const status = getStatus();
  if (!status.installed) {
    return {
      success: false,
      error:
        'Grok Build CLI not found. Install it, or ensure %USERPROFILE%\\.grok\\bin\\grok.exe exists.',
    };
  }
  if (!status.authenticated) {
    return {
      success: false,
      error:
        'Grok Build is not logged in. Run `grok login` in a terminal (SuperGrok OAuth), then retry.',
    };
  }

  const kind =
    sessionKind === 'plain' || sessionKind === 'word' ? sessionKind : 'coding';
  const modelMeta = modelMetaForKind(kind);
  const sessionId = `grok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  /** @type {GrokSession} */
  const entry = {
    sessionId,
    sessionKind: kind,
    modelId: modelMeta.id,
    cwd: defaultCwd(cwd),
    grokSessionId: null,
    child: null,
    busy: false,
  };
  grokSessions.set(sessionId, entry);

  return {
    success: true,
    sessionId,
    currentModel: {
      id: modelMeta.id,
      name: modelMeta.name,
      provider: modelMeta.provider,
    },
    models: [modelMeta],
    providers: { xai: true },
    status,
  };
}

function destroySession(sessionId) {
  const entry = grokSessions.get(sessionId);
  if (!entry) return;
  if (entry.child && !entry.child.killed) {
    try {
      entry.child.kill();
    } catch (_) {}
  }
  grokSessions.delete(sessionId);
  console.log('[Grok] Session destroyed:', sessionId);
}

function destroyAllSessions() {
  for (const id of [...grokSessions.keys()]) {
    destroySession(id);
  }
}

function abortSession(sessionId) {
  const entry = grokSessions.get(sessionId);
  if (!entry || !entry.child) return { success: true };
  try {
    entry.child.kill();
  } catch (_) {}
  entry.child = null;
  entry.busy = false;
  emitEvent(sessionId, { type: 'aborted' });
  return { success: true };
}

/**
 * Run one headless turn. Multi-turn continuity uses --resume + grokSessionId.
 */
function promptSession(sessionId, text, opts = {}) {
  const entry = grokSessions.get(sessionId);
  if (!entry) {
    return Promise.resolve({ success: false, error: 'Unknown Grok session' });
  }
  if (entry.busy) {
    return Promise.resolve({ success: false, error: 'Grok session is already busy' });
  }

  const binary = resolveGrokBinary();
  if (!binary) {
    return Promise.resolve({
      success: false,
      error: 'Grok Build CLI not found',
    });
  }

  if (opts.cwd) {
    entry.cwd = defaultCwd(opts.cwd);
  }

  const promptText = typeof text === 'string' ? text : String(text ?? '');
  if (!promptText.trim()) {
    return Promise.resolve({ success: false, error: 'Empty prompt' });
  }

  // Windows CreateProcess command-line limit is ~32k. Prefer --prompt-file
  // for large document-injected prompts.
  const PROMPT_FILE_THRESHOLD = 6000;
  let promptFilePath = null;
  const modelId = entry.modelId || modelIdForKind(entry.sessionKind);
  const args = [
    '--cwd',
    entry.cwd,
    '--output-format',
    'streaming-json',
    '--no-auto-update',
    '-m',
    modelId,
    ...toolFlagsForKind(entry.sessionKind),
  ];

  if (promptText.length > PROMPT_FILE_THRESHOLD) {
    try {
      const tmpDir = path.join(os.tmpdir(), 'centralhub-grok');
      fs.mkdirSync(tmpDir, { recursive: true });
      promptFilePath = path.join(
        tmpDir,
        `prompt-${sessionId}-${Date.now()}.txt`
      );
      fs.writeFileSync(promptFilePath, promptText, 'utf8');
      args.push('--prompt-file', promptFilePath);
    } catch (e) {
      return Promise.resolve({
        success: false,
        error: `Failed to write prompt file: ${e.message || e}`,
      });
    }
  } else {
    args.push('-p', promptText);
  }

  if (entry.grokSessionId) {
    args.push('--resume', entry.grokSessionId);
  }

  return new Promise((resolve) => {
    entry.busy = true;
    emitEvent(sessionId, { type: 'turn_start' });

    const child = spawn(binary, args, {
      cwd: entry.cwd,
      env: {
        ...process.env,
        GROK_DISABLE_AUTOUPDATER: '1',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.child = child;

    let stderrBuf = '';
    let settled = false;

    const cleanupPromptFile = () => {
      if (!promptFilePath) return;
      try {
        fs.unlinkSync(promptFilePath);
      } catch (_) {}
      promptFilePath = null;
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      entry.busy = false;
      entry.child = null;
      cleanupPromptFile();
      resolve(result);
    };

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const mapped = mapGrokLine(trimmed);
      if (!mapped) return;

      if (mapped.type === 'end' && mapped.grokSessionId) {
        entry.grokSessionId = mapped.grokSessionId;
      }
      emitEvent(sessionId, mapped);
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > 4000) {
        stderrBuf = stderrBuf.slice(-4000);
      }
    });

    child.on('error', (err) => {
      emitEvent(sessionId, {
        type: 'error',
        message: err.message || String(err),
      });
      emitEvent(sessionId, { type: 'end', grokSessionId: entry.grokSessionId, stopReason: 'error' });
      finish({ success: false, error: err.message || String(err) });
    });

    child.on('close', (code, signal) => {
      // If stream ended cleanly, mapGrokLine already sent `end`.
      // If process died without end, emit synthetic end/error.
      if (code !== 0 && code !== null) {
        const msg =
          (stderrBuf && stderrBuf.trim().slice(-500)) ||
          `Grok exited with code ${code}${signal ? ` (${signal})` : ''}`;
        emitEvent(sessionId, { type: 'error', message: msg });
      }
      emitEvent(sessionId, {
        type: 'turn_end',
        exitCode: code,
        signal: signal || null,
      });
      finish({
        success: code === 0 || code === null,
        exitCode: code,
        grokSessionId: entry.grokSessionId,
      });
    });
  });
}

function setSessionCwd(sessionId, cwd) {
  const entry = grokSessions.get(sessionId);
  if (!entry) return { success: false, error: 'Unknown Grok session' };
  entry.cwd = defaultCwd(cwd);
  return { success: true, cwd: entry.cwd };
}

/**
 * Open real Grok Build TUI in a new console / Windows Terminal.
 * Used by Coding Agent on the Grok route so Central Hub is not a
 * middleman — plain old Grok Build, no chat chrome.
 */
function openTerminal(opts = {}) {
  const status = getStatus();
  if (!status.installed || !status.binaryPath) {
    return {
      success: false,
      error:
        'Grok Build CLI not found. Install it under %USERPROFILE%\\.grok\\bin\\grok.exe.',
    };
  }
  if (!status.authenticated) {
    return {
      success: false,
      error: 'Not logged in. Run `grok login` in a terminal first.',
    };
  }

  const cwd = defaultCwd(opts.cwd);
  const bin = status.binaryPath;
  const model = opts.model || 'grok-4.5';

  // 1) Prefer Windows Terminal when available (best TUI host).
  try {
    const wt = spawn(
      'wt.exe',
      ['-d', cwd, bin, '-m', model, '--cwd', cwd],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1' },
      }
    );
    wt.on('error', () => {
      /* fall through handled below via try of spawn error sync path */
    });
    // If wt.exe is missing, 'error' fires async — also try cmd immediately
    // only when spawn itself throws (ENOENT on some setups throws sync).
    if (wt.pid) {
      wt.unref();
      console.log('[Grok] Opened terminal via Windows Terminal, cwd=', cwd);
      return {
        success: true,
        method: 'windows-terminal',
        cwd,
        binaryPath: bin,
        model,
      };
    }
  } catch (_) {
    /* try cmd fallback */
  }

  // 2) Fallback: cmd `start` opens a new console window.
  //    start "title" /D "cwd" "binary" [args...]
  try {
    const child = spawn(
      process.env.ComSpec || 'cmd.exe',
      [
        '/c',
        'start',
        'Grok Build',
        '/D',
        cwd,
        bin,
        '-m',
        model,
        '--cwd',
        cwd,
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, GROK_DISABLE_AUTOUPDATER: '1' },
      }
    );
    child.unref();
    console.log('[Grok] Opened terminal via cmd start, cwd=', cwd);
    return {
      success: true,
      method: 'cmd-start',
      cwd,
      binaryPath: bin,
      model,
    };
  } catch (e) {
    return {
      success: false,
      error: e.message || String(e),
    };
  }
}

module.exports = {
  getStatus,
  createSession,
  destroySession,
  destroyAllSessions,
  abortSession,
  promptSession,
  setSessionCwd,
  openTerminal,
  grokSessions,
};

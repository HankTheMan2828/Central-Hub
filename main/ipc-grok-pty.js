/* ------------------------------------------------------------------ */
/*  In-app Grok Build TUI via node-pty + xterm (renderer).            */
/*                                                                    */
/*  IPC channels:                                                     */
/*    - grok:pty-create                                               */
/*    - grok:pty-write                                                */
/*    - grok:pty-resize                                               */
/*    - grok:pty-destroy                                              */
/*  Events:                                                           */
/*    - grok:pty-data   { termId, data }                              */
/*    - grok:pty-exit   { termId, exitCode, signal }                  */
/* ------------------------------------------------------------------ */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { getMainWindow } = require('./shared');
const { getStatus } = require('./grok-bridge');

/** @type {Map<string, import('node-pty').IPty>} */
const terms = new Map();

let pty = null;
function loadPty() {
  if (pty) return pty;
  // N-API prebuilds work under Electron without native rebuild.
  pty = require('node-pty');
  return pty;
}

function resolveCwd(requested) {
  if (requested && typeof requested === 'string' && requested.trim()) {
    const resolved = path.resolve(requested.trim());
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch (_) {}
  }
  // Match this machine's default Grok Build workspace.
  const home = os.homedir();
  if (fs.existsSync(home)) return home;
  return path.resolve(__dirname, '..');
}

function emit(channel, payload) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send(channel, payload);
  } catch (_) {}
}

function destroyTerm(termId) {
  const t = terms.get(termId);
  if (!t) return;
  try {
    t.kill();
  } catch (_) {}
  terms.delete(termId);
}

function destroyAll() {
  for (const id of [...terms.keys()]) destroyTerm(id);
}

function register(ipcMain) {
  ipcMain.handle('grok:pty-create', async (_event, opts = {}) => {
    try {
      const status = getStatus();
      if (!status.installed || !status.binaryPath) {
        return {
          success: false,
          error:
            'Grok Build CLI not found at %USERPROFILE%\\.grok\\bin\\grok.exe',
        };
      }
      if (!status.authenticated) {
        return {
          success: false,
          error: 'Not logged in. Run `grok login` first.',
        };
      }

      const nodePty = loadPty();
      const cwd = resolveCwd(opts.cwd);
      const cols = Math.max(20, Math.min(400, Number(opts.cols) || 120));
      const rows = Math.max(10, Math.min(200, Number(opts.rows) || 36));
      const model = opts.model || 'grok-4.5';
      const termId =
        opts.termId ||
        `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Replace existing term with same id.
      if (terms.has(termId)) destroyTerm(termId);

      const shell = status.binaryPath;
      const args = ['-m', model, '--cwd', cwd];

      const env = {
        ...process.env,
        GROK_DISABLE_AUTOUPDATER: '1',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      };
      // Force Windows to allocate ConPTY-friendly env.
      delete env.ELECTRON_RUN_AS_NODE;

      const proc = nodePty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
        useConpty: true,
      });

      terms.set(termId, proc);

      proc.onData((data) => {
        emit('grok:pty-data', { termId, data });
      });

      proc.onExit(({ exitCode, signal }) => {
        terms.delete(termId);
        emit('grok:pty-exit', {
          termId,
          exitCode: exitCode ?? null,
          signal: signal ?? null,
        });
        console.log('[Grok PTY] exit', termId, exitCode, signal);
      });

      console.log('[Grok PTY] started', termId, 'cwd=', cwd, 'bin=', shell);
      return {
        success: true,
        termId,
        cwd,
        binaryPath: shell,
        model,
        cols,
        rows,
      };
    } catch (e) {
      console.error('[Grok PTY] create error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('grok:pty-write', async (_event, { termId, data } = {}) => {
    const t = terms.get(termId);
    if (!t) return { success: false, error: 'Unknown terminal' };
    try {
      t.write(typeof data === 'string' ? data : String(data ?? ''));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle(
    'grok:pty-resize',
    async (_event, { termId, cols, rows } = {}) => {
      const t = terms.get(termId);
      if (!t) return { success: false, error: 'Unknown terminal' };
      try {
        const c = Math.max(20, Math.min(400, Number(cols) || 80));
        const r = Math.max(10, Math.min(200, Number(rows) || 24));
        t.resize(c, r);
        return { success: true, cols: c, rows: r };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    }
  );

  ipcMain.handle('grok:pty-destroy', async (_event, { termId } = {}) => {
    if (termId) destroyTerm(termId);
    return { success: true };
  });
}

module.exports = {
  register,
  destroyAll,
};

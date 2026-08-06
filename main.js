const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.centralhub.app');

/* ------------------------------------------------------------------ */
/*  Watchdog acknowledgment — if the previous run was a guarded       */
/*  restart, tell the watchdog we started successfully.               */
/* ------------------------------------------------------------------ */
(function acknowledgeWatchdog() {
  const statePath = path.join(__dirname, '.pi', 'watchdog.json');
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      // Only acknowledge if the state file is fresh (< 60s old)
      if (state.timestamp && Date.now() - state.timestamp < 60_000) {
        state.acknowledged = true;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        console.log('[main] Watchdog acknowledged — app started successfully');
      }
    }
  } catch (_) { /* non-critical */ }
})();

const { setMainWindow } = require('./main/shared');
const { destroyAllSessions } = require('./main/pi-sdk');
const grokSessionIpc = require('./main/ipc-grok-session');
const grokPtyIpc = require('./main/ipc-grok-pty');
const { registerAutoUpdater } = require('./main/updater');

require('./main/ipc-pi-session').register(ipcMain);
require('./main/ipc-plain-session').register(ipcMain);
require('./main/ipc-word').register(ipcMain);
require('./main/ipc-docs').register(ipcMain);
require('./main/ipc-search').register(ipcMain);
require('./main/ipc-stt').register(ipcMain);
require('./main/ipc-regweb').register(ipcMain);
grokSessionIpc.register(ipcMain);
grokPtyIpc.register(ipcMain);

/* ------------------------------------------------------------------ */
/*  Window creation                                                   */
/* ------------------------------------------------------------------ */
function createWindow() {
  const appIcon = path.join(
    __dirname,
    'build',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );

  const window = new BrowserWindow({
    width: 1200,
    height: 750,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enables the <webview> tag used by Reg Web. The Reg Web partition
      // (`persist:regweb`) is configured for privacy in main/ipc-regweb.js.
      webviewTag: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#FFFFFF',
      height: 32
    },
    icon: appIcon
  });
  setMainWindow(window);

  // Grant microphone access permission automatically
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Right-click context menu with spelling suggestions and basic edit actions.
  // Electron's built-in spellchecker populates params.misspelledWord and
  // params.dictionarySuggestions automatically when spellcheck is enabled
  // (default true in webPreferences).
  window.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    const wc = window.webContents;

    if (params.misspelledWord) {
      const suggestions = (params.dictionarySuggestions || []).slice(0, 6);
      if (suggestions.length === 0) {
        menu.append(new MenuItem({ label: 'No suggestions', enabled: false }));
      } else {
        for (const suggestion of suggestions) {
          menu.append(new MenuItem({
            label: suggestion,
            click: () => wc.replaceMisspelling(suggestion),
          }));
        }
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Add to dictionary',
        click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.isEditable || params.selectionText) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: !!params.editFlags?.canCut }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: !!params.editFlags?.canCopy }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: !!params.editFlags?.canPaste }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Select all', role: 'selectAll' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window });
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    window.loadURL('http://localhost:3000');
  } else {
    window.loadFile(path.join(__dirname, 'out/index.html'));
  }

  window.on('closed', () => {
    setMainWindow(null);
    destroyAllSessions();
    grokSessionIpc.destroyAllSessions();
    grokPtyIpc.destroyAll();
  });
}

app.whenReady().then(() => {
  createWindow();
  registerAutoUpdater(() => BrowserWindow.getAllWindows()[0] || null);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  require('electron').nativeTheme.themeSource = 'system';
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

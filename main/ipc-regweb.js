/* ------------------------------------------------------------------ */
/*  Reg Web — embedded browser pane.                                  */
/*                                                                    */
/*  Reg Web renders sites in a <webview> tag inside the renderer,     */
/*  isolated under the `persist:regweb` Electron session partition.   */
/*  The renderer needs `webviewTag: true` on BrowserWindow's          */
/*  webPreferences (set in main.js) and this module configures the    */
/*  partition session for privacy plus exposes a small IPC surface.   */
/*                                                                    */
/*  Privacy defaults applied to the partition:                        */
/*    - DNT: 1 header on every request                                */
/*    - Sec-GPC: 1 (Global Privacy Control) on every request          */
/*    - Permission requests denied by default                         */
/*    - Cookies and storage isolated from the rest of the app         */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - regweb:clear-data    (wipe cookies/cache/storage)             */
/*    - regweb:get-status    (configured? cleared-at?)                */
/* ------------------------------------------------------------------ */

const { session } = require('electron');

const PARTITION = 'persist:regweb';

let configured = false;
let lastClearedAt = 0;

function ensureConfigured() {
  if (configured) return;
  const ses = session.fromPartition(PARTITION);

  // Inject privacy headers on every outgoing request.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['DNT'] = '1';
    headers['Sec-GPC'] = '1';
    callback({ requestHeaders: headers });
  });

  // Deny all permission requests (mic, camera, geolocation, notifications).
  // The renderer can re-prompt the user explicitly later if we ever need
  // to allow specific origins.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  configured = true;
}

function register(ipcMain) {
  // Configure the partition session as soon as the module is registered;
  // this is safe because Electron lazy-creates the session on first
  // reference and persists across reloads.
  try {
    ensureConfigured();
  } catch (e) {
    console.warn('[regweb] partition setup deferred:', e?.message || String(e));
  }

  ipcMain.handle('regweb:clear-data', async () => {
    try {
      ensureConfigured();
      const ses = session.fromPartition(PARTITION);
      await ses.clearStorageData();
      await ses.clearCache();
      try { await ses.clearAuthCache(); } catch (_) { /* older Electron */ }
      lastClearedAt = Date.now();
      return { success: true, clearedAt: lastClearedAt };
    } catch (e) {
      console.error('[regweb:clear-data] error:', e?.stack ?? e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('regweb:get-status', async () => {
    return {
      configured,
      partition: PARTITION,
      lastClearedAt,
    };
  });
}

module.exports = { register, PARTITION };

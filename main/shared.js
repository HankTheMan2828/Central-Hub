/* ------------------------------------------------------------------ */
/*  Shared singletons for main process modules.                       */
/*                                                                    */
/*  All cross-module mutable state lives here. Other main/* modules   */
/*  read/write through getters/setters so a window recreation, an     */
/*  auth reset, or an SDK reload is reflected everywhere immediately. */
/*                                                                    */
/*  Do not pass mainWindow through function parameters anywhere; it   */
/*  becomes stale after the window is recreated. Always go through    */
/*  getMainWindow().                                                  */
/* ------------------------------------------------------------------ */

let mainWindow = null;
let authStorage = null;
let modelRegistry = null;

/** Pool of active PI sessions keyed by sessionId (UUID-ish string). */
const piSessions = new Map();

module.exports = {
  setMainWindow: (w) => { mainWindow = w; },
  getMainWindow: () => mainWindow,

  setAuthStorage: (a) => { authStorage = a; },
  getAuthStorage: () => authStorage,

  setModelRegistry: (m) => { modelRegistry = m; },
  getModelRegistry: () => modelRegistry,

  piSessions,
};

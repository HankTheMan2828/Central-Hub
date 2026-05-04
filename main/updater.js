const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

let registered = false;

function registerAutoUpdater(getMainWindow) {
  if (registered) return;
  registered = true;

  if (!app.isPackaged) {
    console.log('[updater] Skipping update checks outside packaged builds');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[updater] Already current: ${info.version}`);
  });

  autoUpdater.on('error', (error) => {
    console.warn('[updater] Update check failed:', error?.message || error);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`);
    const mainWindow = getMainWindow();

    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Central Hub update ready',
      message: `Central Hub ${info.version} is ready to install.`,
      detail: 'Restart now to install it, or keep working and it will install when the app closes.',
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[updater] Could not start update check:', error?.message || error);
    });
  }, 5000);
}

module.exports = {
  registerAutoUpdater,
};

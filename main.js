const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog } = electron;
const { configureLogger, createLogger } = require('./src/logger');
const { registerIpcHandlers } = require('./src/windowManager');

// Developer Mode Setup
const isDev = process.env.NODE_ENV === 'development'
  || process.env.ELECTRON_IS_DEV === '1'
  || !app.isPackaged;
configureLogger({ isDevelopment: isDev });
const logger = createLogger('main');

// Load game settings
const gameSettingsPath = path.join(__dirname, 'data', 'default', 'en-us', 'game_settings.json');
let gameSettings = {};
try {
  gameSettings = JSON.parse(fs.readFileSync(gameSettingsPath, 'utf-8'));
} catch (error) {
  logger.error('Error loading game settings:', error);
  dialog.showErrorBox(
    'Unable to load game settings',
    `Without a default settings file the game cannot run.\nDetailed Message:\n\n${error.message}`
  );
  app.exit(1);
}

// Get rid of the deprecated default.
app.allowRendererProcessReuse = true;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

/**
 * Create the main application window.
 */
function createWindow() {
  const display = electron.screen.getPrimaryDisplay();
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: display.workArea.width,
    height: display.workArea.height,
    frame: true,
    webPreferences: {
      devTools: isDev,
      nodeIntegration: false, // Disable nodeIntegration for security.
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true, // Protect against prototype pollution.
      worldSafeExecuteJavaScript: true, // https://github.com/electron/electron/pull/24114
      enableRemoteModule: false, // Turn off remote to avoid temptation to use it.
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/app/index.html`);
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Delete the main window so it can be garbage collected.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on Mac.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Extra security filters.
// See also: https://github.com/reZach/secure-electron-template
app.on('web-contents-created', (event, contents) => {
  // Block navigation.
  // https://electronjs.org/docs/tutorial/security#12-disable-or-limit-navigation
  contents.on('will-navigate', (navEvent) => {
    navEvent.preventDefault();
  });
  contents.on('will-redirect', (navEvent) => {
    navEvent.preventDefault();
  });

  // https://electronjs.org/docs/tutorial/security#11-verify-webview-options-before-creation
  contents.on('will-attach-webview', (webEvent, webPreferences) => {
    // Strip away preload scripts.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;

    // Disable Node.js integration.
    webPreferences.nodeIntegration = false;
  });

  // Block new windows from within the App
  // https://electronjs.org/docs/tutorial/security#13-disable-or-limit-creation-of-new-windows
  contents.on('new-window', async (newEvent) => {
    newEvent.preventDefault();
  });
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  // This condition should only occur on Mac, where closing all
  // windows doesn't quit the app.
  if (mainWindow === null) {
    createWindow();
  }
});

let gameSetupWindow = null;

function openGameSetupWindow() {
  if (gameSetupWindow) {
    gameSetupWindow.focus();
    return;
  }
  gameSetupWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      devTools: isDev,
      nodeIntegration: false, // Disable nodeIntegration for security.
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true, // Protect against prototype pollution.
      worldSafeExecuteJavaScript: true, // https://github.com/electron/electron/pull/24114
      enableRemoteModule: false, // Turn off remote to avoid temptation to use it.
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });
  gameSetupWindow.loadURL(`file://${__dirname}/app/new_game.html`);
  if (isDev) {
    gameSetupWindow.webContents.openDevTools();
  }
  gameSetupWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-d3js';"]
      }
    });
  });
  gameSetupWindow.on('closed', () => {
    gameSetupWindow = null;
  });
}

/**
 * Open the primary gameplay window.
 */
function openGameWindow() {
  const gameWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      devTools: isDev,
      nodeIntegration: false, // Disable nodeIntegration for security.
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true, // Protect against prototype pollution.
      worldSafeExecuteJavaScript: true, // https://github.com/electron/electron/pull/24114
      enableRemoteModule: false, // Turn off remote to avoid temptation to use it.
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });
  gameWindow.loadURL(`file://${__dirname}/app/game.html`);
  if (isDev) {
    gameWindow.webContents.openDevTools();
  }
}

registerIpcHandlers({
  ipcMain: electron.ipcMain,
  gameSettings,
  getGameSetupWindow: () => gameSetupWindow,
  openGameSetupWindow,
  openGameWindow,
  getMainWindow: () => mainWindow
});

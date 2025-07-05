const electron = require('electron');

// Module to control application life.
const { app, BrowserWindow, ipcMain } = electron;

// Developer Dependencies.
const isDev = !app.isPackaged;

// Additional Tooling.
const path = require('path');
const { createUniverse } = require('./src/universe');

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
      enableRemoteModule: false, // Turn off remote to avoid temptation.
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/app/index.html`);

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
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
  if (mainWindow === null) {
    createWindow();
  }
});

let newGameWindow = null;

function openNewGameWindow() {
  if (newGameWindow) {
    newGameWindow.focus();
    return;
  }
  newGameWindow = new BrowserWindow({
    width: 1100, // Increased width to fit form and diagram side by side
    height: 700, // Increased height for better fit
    parent: mainWindow,
    modal: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });
  newGameWindow.loadURL(`file://${__dirname}/app/new_game.html`);
  newGameWindow.on('closed', () => {
    newGameWindow = null;
  });
}

ipcMain.on('open-new-game', openNewGameWindow);

let currentUniverse = null;

ipcMain.on('create-universe', (event, params) => {
  currentUniverse = createUniverse(
    params.systemCount,
    params.connectionCount,
    params.stellarObjectCount
  );
  if (newGameWindow) {
    // Send only a summary or graph data, not the whole object
    newGameWindow.webContents.send('universe-created', {
      name: params.universeName,
      graph: getUniverseGraph(currentUniverse),
      summary: getUniverseSummary(currentUniverse),
    });
  }
});

function getUniverseGraph(universe) {
  // Return only the data needed for D3 (nodes and links)
  return {
    systems: universe.systems.map(sys => ({
      id: sys.id,
      name: sys.name,
      connections: sys.connections,
    })),
    stellarObjects: universe.stellarObjects.map(obj => ({
      id: obj.id,
      type: obj.type,
      location: obj.location,
    })),
  };
}

function getUniverseSummary(universe) {
  return {
    typeTotals: universe.getStellarObjectTypeTotals(),
    typeCountsBySystem: universe.getStellarObjectTypeCountsBySystem(),
  };
}

ipcMain.handle('get-universe-graph', () => {
  if (!currentUniverse) return null;
  return getUniverseGraph(currentUniverse);
});

ipcMain.handle('get-universe-summary', () => {
  if (!currentUniverse) return null;
  return getUniverseSummary(currentUniverse);
});

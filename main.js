const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain } = electron;
const { createUniverse } = require('./src/universe');
const { Game } = require('./src/game');  // Add this line

// Developer Dependencies.
const isDev = !app.isPackaged;

// Load game settings
const gameSettingsPath = path.join(__dirname, 'data', 'game_settings.json');
let gameSettings = {};
try {
  gameSettings = JSON.parse(fs.readFileSync(gameSettingsPath, 'utf-8'));
} catch (error) {
  console.error('Error loading game settings:', error);
  gameSettings = {
    initial_ship: "Shuttle",
    food_per_person: 1,
    game_turn_limit: -1
  };
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
    width: 1400,  // Increased from previous size
    height: 900,  // Increased from previous size
    parent: mainWindow,
    modal: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });
  newGameWindow.loadURL(`file://${__dirname}/app/new_game.html`);
  newGameWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-d3js';"]
      }
    });
  });
  newGameWindow.on('closed', () => {
    newGameWindow = null;
  });
}

ipcMain.on('open-new-game', openNewGameWindow);

let currentUniverse = null;
let currentGame = null;  // Add this line to track the current game

function getUniverseGraph(universe) {
  return {
    systems: universe.systems.map(sys => ({
      id: sys.id,
      name: sys.name,
      connections: sys.connections
    })),
    stellarObjects: universe.stellarObjects.map(obj => ({
      id: obj.id,
      type: obj.type,
      location: obj.location
    }))
  };
}

// Place this function before your IPC handlers
ipcMain.on('create-universe', (event, params) => {
  currentUniverse = createUniverse(
    params.systemCount,
    params.connectionCount,
    params.stellarObjectCount
  );
  if (newGameWindow) {
    // Send universe data back to renderer to display
    newGameWindow.webContents.send('universe-created', {
      graph: getUniverseGraph(currentUniverse),
      summary: {
        typeTotals: currentUniverse.getStellarObjectTypeTotals(),
        typeCountsBySystem: currentUniverse.getStellarObjectTypeCountsBySystem()
      }
    });
  }
});

// Add new handler for transitioning to player creation
ipcMain.on('proceed-to-player-creation', () => {
  if (newGameWindow) {
    newGameWindow.loadURL(`file://${__dirname}/app/player_creation.html`);
  }
});

ipcMain.on('create-player', (event, playerData) => {
  // Validate player data
  if (!playerData.name || !playerData.pronouns || !playerData.description) {
    event.reply('player-creation-error', { message: 'All fields are required' });
    return;
  }

  // Create new game with universe and player
  currentGame = new Game(currentUniverse, gameSettings);
  currentGame.initializeGame(playerData);

  // Close new game window and open main game window
  if (newGameWindow) {
    newGameWindow.close();
  }
  openGameWindow();
});

// Add this function to handle opening the main game window
function openGameWindow() {
  const gameWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });
  gameWindow.loadURL(`file://${__dirname}/app/game.html`);
  gameWindow.webContents.openDevTools();
}


ipcMain.on('return-to-universe-creation', () => {
  if (newGameWindow) {
    newGameWindow.loadURL(`file://${__dirname}/app/new_game.html`);
  }
});

ipcMain.handle('get-universe-graph', () => {
  if (!currentUniverse) return null;
  return getUniverseGraph(currentUniverse);
});

ipcMain.handle('get-universe-summary', () => {
  if (!currentUniverse) return null;
  return getUniverseSummary(currentUniverse);
});

// Add this with your other IPC handlers
ipcMain.handle('get-game-settings', () => {
  return gameSettings;
});

ipcMain.handle('get-location-state', () => {
  if (!currentGame) return null;
  return currentGame.getCurrentLocationState();
});

ipcMain.handle('get-ship-data', () => {
  const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ships.json'), 'utf-8'));
  return shipsData;
});

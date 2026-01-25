const electron = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const { createUniverse } = require('./src/universe');
const { Game } = require('./src/game');  // Add this line

// Developer Dependencies.
const isDev = !app.isPackaged;

// Load game settings
const gameSettingsPath = path.join(__dirname, 'data', 'default', 'en-us', 'game_settings.json');
let gameSettings = {};
try {
  gameSettings = JSON.parse(fs.readFileSync(gameSettingsPath, 'utf-8'));
} catch (error) {
  console.error('Error loading game settings:', error);
  gameSettings = {
    initial_ship: "Shuttle",
    food_per_person: 1
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
  if (!playerData.name || !playerData.pronouns || !playerData.description ||
    !playerData.corporation || !playerData.corporation.name || !playerData.corporation.description) {
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

ipcMain.handle('get-location-state', () => {
  if (!currentGame) return null;
  const locationState = currentGame.getCurrentLocationState();

  // Add player state to the location state for the renderer
  locationState.playerState = currentGame.getPlayerState();

  return locationState;
});

ipcMain.handle('get-universe-state', () => {
  if (!currentGame || !currentGame.universe) return null;
  return {
    systems: currentGame.universe.systems,
    stellarObjects: currentGame.universe.stellarObjects
  };
});

ipcMain.handle('get-universe-map-data', () => {
  if (!currentGame || !currentGame.universe) return null;
  return {
    systems: currentGame.universe.systems,
    stellarObjects: currentGame.universe.stellarObjects,
    exploredSystems: currentGame.exploredSystems || []
  };
});

ipcMain.handle('get-ship-data', () => {
  const dataDir = gameSettings.data_directory || 'data/default/en-us';
  const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, dataDir, 'ships.json'), 'utf-8'));
  return shipsData;
});

// Handle get-game-messages request from renderer
ipcMain.handle('get-game-messages', (event, messageKey) => {
  try {
    const dataDir = gameSettings.data_directory || 'data/default/en-us';
    const messagesPath = path.join(__dirname, dataDir, 'game_messages.json');
    const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));

    if (messageKey) {
      // Support dot notation for nested keys (e.g., "navigation.jumping")
      const keys = messageKey.split('.');
      let result = messagesData;

      for (const key of keys) {
        if (result && typeof result === 'object' && key in result) {
          result = result[key];
        } else {
          return null; // Key path doesn't exist
        }
      }

      return result;
    }

    // Return all messages if no key specified
    return messagesData;
  } catch (error) {
    console.error('Error loading game messages:', error);
    return null;
  }
});

// Handle get-all-systems request from renderer
ipcMain.handle('get-all-systems', () => {
  if (!currentGame) {
    console.error('[DEBUG get-all-systems] currentGame is not initialized');
    return [];
  }
  if (!currentGame.universe) {
    console.error('[DEBUG get-all-systems] currentGame.universe is not initialized');
    return [];
  }
  if (!currentGame.universe.systems) {
    console.error('[DEBUG get-all-systems] currentGame.universe.systems is not initialized');
    return [];
  }
  console.log('[DEBUG get-all-systems] Returning', currentGame.universe.systems.length, 'systems');
  return currentGame.universe.systems.map(sys => ({ id: sys.id, name: sys.name }));
});

// Handle calculate-jump-route request from renderer
ipcMain.handle('calculate-jump-route', (event, { start, destination }) => {
  console.log('[DEBUG calculate-jump-route] start:', start, 'destination:', destination);
  if (!currentGame) {
    return { success: false, reason: 'No active game' };
  }

  const route = currentGame.universe.findShortestPath(start, destination);
  console.log('[DEBUG calculate-jump-route] route result:', route);

  if (!route) {
    return { success: false, reason: 'No route found between systems' };
  }

  // Calculate energy requirements
  const playerState = currentGame.getPlayerState();
  const energyPerJump = playerState.shipEnergy / (playerState.shipMaxEnergy || 1) > 0 ?
    currentGame.player.energyPerJump : 0;
  const energyRequired = (route.path.length - 1) * energyPerJump;

  return {
    success: true,
    route: route.path,
    cost: route.cost,
    energyRequired: energyRequired,
    currentEnergy: playerState.shipEnergy
  };
});

// Handle jump-to-system request from renderer
ipcMain.on('jump-to-system', (event, targetSystemId) => {
  if (!currentGame) {
    event.reply('jump-result', { success: false, reason: "No active game" });
    return;
  }

  // Convert targetSystemId to number if it's a string
  const systemId = parseInt(targetSystemId, 10);

  // Attempt to jump to the target system
  const result = currentGame.jumpToSystem(systemId);

  // Send the result back to the renderer
  event.reply('jump-result', result);
});

// Handle dock-at-station request from renderer
ipcMain.on('dock-at-station', (event, objectId) => {
  if (!currentGame) {
    event.reply('dock-result', { success: false, reason: "No active game" });
    return;
  }

  // Convert objectId to number if it's a string
  const stationId = parseInt(objectId, 10);

  // Attempt to dock at the station
  const result = currentGame.dockAtStation(stationId);

  // Send the result back to the renderer
  event.reply('dock-result', result);
});

// Handle land-on-surface request from renderer
ipcMain.on('land-on-surface', (event, objectId) => {
  if (!currentGame) {
    event.reply('land-result', { success: false, reason: "No active game" });
    return;
  }

  // Convert objectId to number if it's a string
  const planetId = parseInt(objectId, 10);

  // Attempt to land on the planet
  const result = currentGame.landOnPlanet(planetId);

  // Send the result back to the renderer
  event.reply('land-result', result);
});


// Handle take-off request from renderer (grouped with other game actions)
ipcMain.on('take-off', (event) => {
  if (!currentGame) {
    event.reply('takeoff-result', { success: false, reason: 'No active game' });
    return;
  }
  const result = currentGame.takeOff();
  event.reply('takeoff-result', result);
});
// Add this with your other IPC handlers
ipcMain.handle('get-game-settings', () => {
  return gameSettings;
});

// Handle save-game request from renderer
ipcMain.on('save-game', (event) => {
  if (!currentGame) {
    event.reply('save-game-result', { success: false, reason: "No active game" });
    return;
  }

  try {
    const saveData = currentGame.getSaveData();
    const savePath = path.join(os.homedir(), 'market_builder', 'saves');

    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const saveFilePath = path.join(savePath, `save_${Date.now()}.json`);
    fs.writeFileSync(saveFilePath, JSON.stringify(saveData, null, 2));

    event.reply('save-game-result', { success: true, savePath: saveFilePath });
  } catch (error) {
    console.error('Error saving game:', error);
    event.reply('save-game-result', { success: false, reason: "Error saving game" });
  }
});

// Handle get-save-files request from renderer
ipcMain.on('get-save-files', (event) => {
  const savePath = path.join(os.homedir(), 'market_builder', 'saves');
  try {
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }
    const files = fs.readdirSync(savePath)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(savePath, file));
    event.reply('save-files-list', files);
  } catch (error) {
    console.error('Error getting save files:', error);
    event.reply('save-files-list', []);
  }
});

// Handle open-load-game-dialog request from renderer
ipcMain.handle('open-load-game-dialog', async (event) => {
  const savePath = path.join(os.homedir(), 'market_builder', 'saves');

  // Ensure the save directory exists
  if (!fs.existsSync(savePath)) {
    fs.mkdirSync(savePath, { recursive: true });
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: savePath,
    filters: [
      { name: 'Save Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  } else {
    return { success: false, filePath: null };
  }
});

// Handle load-game request from renderer
ipcMain.on('load-game', (event, saveFilePath) => {
  try {
    const saveData = JSON.parse(fs.readFileSync(saveFilePath, 'utf-8'));
    currentGame = Game.loadGame(saveData);
    event.reply('load-game-result', { success: true });

    // Open the game window to start playing
    openGameWindow();
  } catch (error) {
    console.error('Error loading game:', error);
    event.reply('load-game-result', { success: false, reason: "Error loading game" });
  }
});

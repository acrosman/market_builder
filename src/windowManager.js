const { createUniverse } = require('./universe');
const { Game } = require('./game');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger, validLogLevels } = require('./logger');

/**
 * Register all main-process IPC listeners and handlers.
 * @param {Object} dependencies - Required callbacks and runtime state.
 * @param {Object} dependencies.ipcMain - Electron ipcMain instance.
 * @param {Object} dependencies.gameSettings - Loaded game settings.
 * @param {Function} dependencies.getGameSetupWindow - Returns active setup window.
 * @param {Function} dependencies.openGameSetupWindow - Opens setup window.
 * @param {Function} dependencies.openGameWindow - Opens main game window.
 * @param {Function} dependencies.getMainWindow - Returns active main window.
 * @returns {void}
 * @example
 * registerIpcHandlers({ ipcMain, gameSettings, getGameSetupWindow, openGameSetupWindow, openGameWindow, getMainWindow });
 */
function registerIpcHandlers({
  ipcMain,
  gameSettings,
  getGameSetupWindow,
  openGameSetupWindow,
  openGameWindow,
  getMainWindow
}) {
  const logger = createLogger('main');
  const baseDir = path.join(__dirname, '..');
  let currentUniverse = null;
  let currentGame = null;

  /**
   * Get a renderer-friendly company management snapshot.
   * @param {Object} corporation - Corporation instance.
   * @returns {Object|null} Company management state.
   * @example
   * const state = getCompanyManagementState(corporation);
   */
  function getCompanyManagementState(corporation) {
    if (!corporation || typeof corporation.getCompanyManagementState !== 'function') {
      return null;
    }

    return corporation.getCompanyManagementState(currentGame?.universe);
  }

  /**
   * Get all corporations controlled by the current player.
   * @returns {Object[]} Player-owned corporations.
   * @example
   * const companies = getPlayerControlledCorporations();
   */
  function getPlayerControlledCorporations() {
    if (!currentGame || !currentGame.player) {
      return [];
    }

    return currentGame.player.getOwnedCorporations(currentGame.corporations);
  }

  /**
   * Find a player-controlled corporation by name.
   * @param {string} companyName - Corporation name.
   * @returns {Object|null} Corporation instance or null.
   * @example
   * const corporation = findPlayerControlledCorporation('Acme Corp');
   */
  function findPlayerControlledCorporation(companyName) {
    if (!companyName) {
      return null;
    }

    return getPlayerControlledCorporations().find(corporation => corporation.name === companyName) || null;
  }

  /**
   * Build a graph-only universe response for renderer map previews.
   * @param {Object} universe - Universe instance.
   * @returns {Object} Renderer-friendly graph payload.
   * @example
   * const graph = getUniverseGraph(currentUniverse);
   */
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

  /**
   * Build a universe object summary used by new game setup screens.
   * @param {Object} universe - Universe instance.
   * @returns {Object} Summary counts by type and by system.
   * @example
   * const summary = getUniverseSummary(currentUniverse);
   */
  function getUniverseSummary(universe) {
    return {
      typeTotals: universe.getStellarObjectTypeTotals(),
      typeCountsBySystem: universe.getStellarObjectTypeCountsBySystem()
    };
  }

  // IPC: Open or focus the new game setup modal window.
  ipcMain.on('open-new-game', () => {
    try {
      openGameSetupWindow();
    } catch (error) {
      logger.error('Error opening game setup window:', error);
    }
  });

  // IPC: Forward renderer-side logs to main logger with validation.
  ipcMain.on('renderer-log', (event, payload = {}) => {
    const { level, scope = 'renderer', args = [] } = payload;

    if (!Array.isArray(args)) {
      logger.warn('Rejected renderer log with invalid arguments (expected an array):', [args]);
      return;
    }

    const rendererLogger = createLogger(`renderer:${scope}`);
    if (!validLogLevels.has(level)) {
      rendererLogger.error('Rejected renderer log with invalid level:', [level, args]);
      return;
    }
    rendererLogger[level](...args);
  });

  // IPC: Create a universe from setup inputs and return preview data.
  ipcMain.on('create-universe', (event, params) => {
    currentUniverse = createUniverse(
      params.systemCount,
      params.connectionCount,
      params.stellarObjectCount
    );

    const setupWindow = getGameSetupWindow();
    if (setupWindow) {
      setupWindow.webContents.send('universe-created', {
        graph: getUniverseGraph(currentUniverse),
        summary: getUniverseSummary(currentUniverse)
      });
    }
  });

  // IPC: Advance setup flow from universe creation to player creation screen.
  ipcMain.on('proceed-to-player-creation', () => {
    const setupWindow = getGameSetupWindow();
    if (setupWindow) {
      setupWindow.loadURL(`file://${path.join(baseDir, 'app', 'player_creation.html')}`);
    }
  });

  // IPC: Finalize player creation and start a new game session.
  ipcMain.on('create-player', (event, playerData) => {
    if (!playerData.name || !playerData.pronouns || !playerData.description ||
      !playerData.corporation || !playerData.corporation.name || !playerData.corporation.description) {
      event.reply('player-creation-error', { message: 'All fields are required' });
      return;
    }
    if (!currentUniverse) {
      event.reply('player-creation-error', { message: 'Universe must be created first' });
      return;
    }

    currentGame = new Game(currentUniverse, gameSettings);
    currentGame.initializeGame(playerData);

    const setupWindow = getGameSetupWindow();
    if (setupWindow) {
      setupWindow.close();
    }
    openGameWindow();
  });

  // IPC: Return setup flow from player creation back to universe creation screen.
  ipcMain.on('return-to-universe-creation', () => {
    const setupWindow = getGameSetupWindow();
    if (setupWindow) {
      setupWindow.loadURL(`file://${path.join(baseDir, 'app', 'new_game.html')}`);
    }
  });

  // IPC: Return universe graph data for renderer visualization.
  ipcMain.handle('get-universe-graph', () => {
    if (!currentUniverse) return null;
    return getUniverseGraph(currentUniverse);
  });

  // IPC: Return universe summary data for renderer UI panels.
  ipcMain.handle('get-universe-summary', () => {
    if (!currentUniverse) return null;
    return getUniverseSummary(currentUniverse);
  });

  // IPC: Return current location state and player snapshot for gameplay UI.
  ipcMain.handle('get-location-state', () => {
    if (!currentGame) return null;
    const locationState = currentGame.getCurrentLocationState();
    return {
      ...locationState,
      playerState: currentGame.getPlayerState()
    };
  });

  // IPC: Return full universe state for active game session.
  ipcMain.handle('get-universe-state', () => {
    if (!currentGame || !currentGame.universe) return null;
    return {
      systems: currentGame.universe.systems,
      stellarObjects: currentGame.universe.stellarObjects
    };
  });

  // IPC: Return all player-controlled company management snapshots.
  ipcMain.handle('get-player-companies', () => {
    return getPlayerControlledCorporations().map(corporation => getCompanyManagementState(corporation));
  });

  // IPC: Return one company management snapshot by company name.
  ipcMain.handle('get-company-management-state', (event, { companyName } = {}) => {
    const corporation = findPlayerControlledCorporation(companyName);
    return getCompanyManagementState(corporation);
  });

  // IPC: Update company profile details and synchronize owned object ownership names.
  ipcMain.handle('update-company-profile', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.currentName);
    if (!corporation) {
      return { success: false };
    }

    const previousName = corporation.name;

    if (typeof payload.name === 'string' && payload.name.trim().length > 0) {
      corporation.name = payload.name.trim();
    }

    if (typeof payload.description === 'string') {
      corporation.description = payload.description.trim();
    }

    if (previousName !== corporation.name) {
      currentGame.universe.stellarObjects.forEach((stellarObject) => {
        if (stellarObject.owner === previousName) {
          stellarObject.setOwner(corporation.name);
        }
      });
    }

    return { success: true, company: getCompanyManagementState(corporation) };
  });

  // IPC: Update a company dividend rate.
  ipcMain.handle('update-company-dividend-rate', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.companyName);
    if (!corporation) {
      return { success: false };
    }

    const dividendRate = Number(payload.dividendRate);
    const success = corporation.setDividendRate(dividendRate);
    return { success, company: getCompanyManagementState(corporation) };
  });

  // IPC: Issue additional company shares.
  ipcMain.handle('issue-company-shares', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.companyName);
    if (!corporation) {
      return { success: false };
    }

    const shares = Number(payload.shares);
    const success = corporation.issueShares(shares);
    return { success, company: getCompanyManagementState(corporation) };
  });

  // IPC: Take a new company loan.
  ipcMain.handle('take-company-loan', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.companyName);
    if (!corporation) {
      return { success: false };
    }

    const amount = Number(payload.amount);
    const loan = corporation.takeLoan(amount);
    return {
      success: Boolean(loan),
      loan,
      company: getCompanyManagementState(corporation)
    };
  });

  // IPC: Make a payment against an existing company loan.
  ipcMain.handle('make-company-loan-payment', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.companyName);
    if (!corporation) {
      return { success: false };
    }

    const loanId = Number(payload.loanId);
    const amount = Number(payload.amount);
    const success = corporation.makeLoanPayment(loanId, amount);
    return { success, company: getCompanyManagementState(corporation) };
  });

  // IPC: Set a recurring repayment rate for a company loan.
  ipcMain.handle('set-company-loan-repayment-rate', (event, payload = {}) => {
    const corporation = findPlayerControlledCorporation(payload.companyName);
    if (!corporation) {
      return { success: false };
    }

    const loanId = Number(payload.loanId);
    const repaymentRate = Number(payload.repaymentRate);
    const success = corporation.setLoanRepaymentRate(loanId, repaymentRate);
    return { success, company: getCompanyManagementState(corporation) };
  });

  // IPC: Return map data, including explored systems, for map rendering.
  ipcMain.handle('get-universe-map-data', () => {
    if (!currentGame || !currentGame.universe) return null;
    return {
      systems: currentGame.universe.systems,
      stellarObjects: currentGame.universe.stellarObjects,
      exploredSystems: currentGame.exploredSystems || []
    };
  });

  // IPC: Return ship definitions from configured data directory.
  ipcMain.handle('get-ship-data', () => {
    const dataDir = gameSettings.data_directory || 'data/default/en-us';
    const shipsData = JSON.parse(fs.readFileSync(path.join(baseDir, dataDir, 'ships.json'), 'utf-8'));
    return shipsData;
  });

  // IPC: Return game messages data, optionally by nested dot-notation key.
  ipcMain.handle('get-game-messages', (event, messageKey) => {
    try {
      const dataDir = gameSettings.data_directory || 'data/default/en-us';
      const messagesPath = path.join(baseDir, dataDir, 'game_messages.json');
      const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));

      if (messageKey) {
        const keys = messageKey.split('.');
        let result = messagesData;

        for (const key of keys) {
          if (result && typeof result === 'object' && key in result) {
            result = result[key];
          } else {
            return null;
          }
        }

        return result;
      }

      return messagesData;
    } catch (error) {
      logger.error('Error loading game messages:', error);
      return null;
    }
  });

  // IPC: Return simplified system list for jump planner UI.
  ipcMain.handle('get-all-systems', () => {
    if (!currentGame) {
      logger.error('[DEBUG get-all-systems] currentGame is not initialized');
      return [];
    }
    if (!currentGame.universe) {
      logger.error('[DEBUG get-all-systems] currentGame.universe is not initialized');
      return [];
    }
    if (!currentGame.universe.systems) {
      logger.error('[DEBUG get-all-systems] currentGame.universe.systems is not initialized');
      return [];
    }
    logger.debug('[DEBUG get-all-systems] Returning', currentGame.universe.systems.length, 'systems');
    return currentGame.universe.systems.map(sys => ({ id: sys.id, name: sys.name }));
  });

  // IPC: Calculate shortest jump route and required energy between systems.
  ipcMain.handle('calculate-jump-route', (event, { start, destination }) => {
    logger.debug('[DEBUG calculate-jump-route] start:', start, 'destination:', destination);
    if (!currentGame) {
      return { success: false, reason: 'No active game' };
    }

    const route = currentGame.universe.findShortestPath(start, destination);
    logger.debug('[DEBUG calculate-jump-route] route result:', route);

    if (!route) {
      return { success: false, reason: 'No route found between systems' };
    }

    const playerState = currentGame.getPlayerState();
    const energyPerJump = playerState.shipEnergy / (playerState.shipMaxEnergy || 1) > 0
      ? currentGame.player.energyPerJump
      : 0;
    const energyRequired = (route.path.length - 1) * energyPerJump;

    return {
      success: true,
      route: route.path,
      cost: route.cost,
      energyRequired,
      currentEnergy: playerState.shipEnergy
    };
  });

  // IPC: Attempt to jump player ship to another system.
  ipcMain.on('jump-to-system', (event, targetSystemId) => {
    if (!currentGame) {
      event.reply('jump-result', { success: false, reason: 'No active game' });
      return;
    }

    const systemId = parseInt(targetSystemId, 10);
    const result = currentGame.jumpToSystem(systemId);
    event.reply('jump-result', result);
  });

  // IPC: Attempt to dock at a station in the current system.
  ipcMain.on('dock-at-station', (event, objectId) => {
    if (!currentGame) {
      event.reply('dock-result', { success: false, reason: 'No active game' });
      return;
    }

    const stationId = parseInt(objectId, 10);
    const result = currentGame.dockAtStation(stationId);
    event.reply('dock-result', result);
  });

  // IPC: Attempt to land on a planetary surface in the current system.
  ipcMain.on('land-on-surface', (event, objectId) => {
    if (!currentGame) {
      event.reply('land-result', { success: false, reason: 'No active game' });
      return;
    }

    const planetId = parseInt(objectId, 10);
    const result = currentGame.landOnPlanet(planetId);
    event.reply('land-result', result);
  });

  // IPC: Attempt player ship takeoff from current landed location.
  ipcMain.on('take-off', (event) => {
    if (!currentGame) {
      event.reply('takeoff-result', { success: false, reason: 'No active game' });
      return;
    }
    const result = currentGame.takeOff();
    event.reply('takeoff-result', result);
  });

  // IPC: Return resolved game settings for renderer usage.
  ipcMain.handle('get-game-settings', () => {
    return gameSettings;
  });

  // IPC: Save current game state to user save directory.
  ipcMain.on('save-game', (event) => {
    if (!currentGame) {
      event.reply('save-game-result', { success: false, reason: 'No active game' });
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
      logger.error('Error saving game:', error);
      event.reply('save-game-result', { success: false, reason: 'Error saving game' });
    }
  });

  // IPC: List available save files from user save directory.
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
      logger.error('Error getting save files:', error);
      event.reply('save-files-list', []);
    }
  });

  // IPC: Open native file picker for save-game loading.
  ipcMain.handle('open-load-game-dialog', async () => {
    const { dialog } = require('electron');
    const savePath = path.join(os.homedir(), 'market_builder', 'saves');

    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const result = await dialog.showOpenDialog(getMainWindow(), {
      defaultPath: savePath,
      filters: [
        { name: 'Save Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    }

    return { success: false, filePath: null };
  });

  // IPC: Load a saved game file and open gameplay window.
  ipcMain.on('load-game', (event, saveFilePath) => {
    try {
      const saveData = JSON.parse(fs.readFileSync(saveFilePath, 'utf-8'));
      const loadedGame = Game.loadGame(saveData);
      if (!loadedGame || typeof loadedGame !== 'object') {
        throw new Error('Loaded save did not produce a valid game');
      }
      currentGame = loadedGame;
      currentUniverse = loadedGame.universe || null;
      event.reply('load-game-result', { success: true });
      openGameWindow();
    } catch (error) {
      logger.error('Error loading game:', error);
      event.reply('load-game-error', { reason: 'Error loading game' });
    }
  });

  // IPC: Return all ship definitions for UI menus and calculations.
  ipcMain.handle('get-ships-data', () => {
    const dataDir = gameSettings.data_directory || 'data/default/en-us';
    const shipsData = JSON.parse(fs.readFileSync(path.join(baseDir, dataDir, 'ships.json'), 'utf-8'));
    return shipsData;
  });

  // IPC: Return all goods definitions for market UI and trading.
  ipcMain.handle('get-goods-data', () => {
    const dataDir = gameSettings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(baseDir, dataDir, 'goods.json'), 'utf-8'));
    return goodsData;
  });

  // IPC: Return list of buildings available at current location.
  ipcMain.handle('get-buildable-buildings', () => {
    if (!currentGame) {
      return [];
    }
    return currentGame.getBuildableBuildingsForCurrentObject();
  });

  // IPC: Attempt building construction at current location.
  ipcMain.on('construct-building', (event, buildingType) => {
    if (!currentGame) {
      event.reply('build-result', { success: false, reason: 'No active game' });
      return;
    }

    const result = currentGame.buildBuildingAtCurrentObject(buildingType);
    event.reply('build-result', result);
  });

  // IPC: Calculate market price for a good at a specific location.
  ipcMain.handle('get-market-price', (event, { stellarObjectId, goodName, priceType }) => {
    if (!currentGame) {
      return null;
    }

    try {
      const stellarObject = currentGame.universe.stellarObjects.find(obj => obj.id === stellarObjectId);
      if (!stellarObject) {
        logger.error('Stellar object not found:', stellarObjectId);
        return null;
      }
      return currentGame.calculateMarketPrice(stellarObject, goodName, priceType);
    } catch (error) {
      logger.error('Error calculating market price:', error);
      return null;
    }
  });

  // IPC: Execute a buy or sell goods trade action.
  ipcMain.handle('trade-goods', (event, tradeData) => {
    if (!currentGame) {
      return { success: false, message: 'No active game' };
    }

    const { action, goodName, quantity, price, stellarObjectId } = tradeData;

    if (action === 'buy') {
      return currentGame.buyGood(stellarObjectId, goodName, quantity, price);
    }

    if (action === 'sell') {
      return currentGame.sellGood(stellarObjectId, goodName, quantity, price);
    }

    return { success: false, message: 'Invalid trade action' };
  });

  // IPC: Load passengers at current location.
  ipcMain.handle('load-passengers', (event, passengerData) => {
    if (!currentGame) {
      return { success: false, message: 'No active game' };
    }

    const { stellarObjectId, passengerCount } = passengerData;
    return currentGame.loadPassengers(stellarObjectId, passengerCount);
  });

  // IPC: Unload passengers at current location.
  ipcMain.handle('unload-passengers', (event, passengerData) => {
    if (!currentGame) {
      return { success: false, message: 'No active game' };
    }

    const { stellarObjectId, passengerCount } = passengerData;
    return currentGame.unloadPassengers(stellarObjectId, passengerCount);
  });
}

module.exports = {
  registerIpcHandlers
};

const { createUniverse } = require('./universe');
const { Game } = require('./game');
const { registerIpcHandlers } = require('./windowManager');

const mockShowOpenDialog = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockHomedir = jest.fn();
const mockCreateLogger = jest.fn();
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn()
};

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: (...args) => mockShowOpenDialog(...args)
  }
}));

jest.mock('fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
  existsSync: (...args) => mockExistsSync(...args),
  mkdirSync: (...args) => mockMkdirSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  readdirSync: (...args) => mockReaddirSync(...args)
}));

jest.mock('os', () => ({
  homedir: (...args) => mockHomedir(...args)
}));

jest.mock('./logger', () => ({
  createLogger: (...args) => mockCreateLogger(...args),
  validLogLevels: new Set(['error', 'warn', 'info', 'debug'])
}));

jest.mock('./universe', () => ({
  createUniverse: jest.fn()
}));

jest.mock('./game', () => ({
  Game: jest.fn()
}));

/**
 * Build a mock ipcMain object that records registrations.
 * @returns {Object} Mock ipcMain and handler maps.
 */
function createIpcMainMock() {
  const onHandlers = {};
  const handleHandlers = {};

  return {
    onHandlers,
    handleHandlers,
    ipcMain: {
      on: jest.fn((channel, handler) => {
        onHandlers[channel] = handler;
      }),
      handle: jest.fn((channel, handler) => {
        handleHandlers[channel] = handler;
      })
    }
  };
}

/**
 * Register IPC handlers with standard mocks.
 * @param {Object} [overrides={}] - Dependency overrides.
 * @returns {Object} Registration context and handlers.
 */
function registerWithMocks(overrides = {}) {
  const { ipcMain, onHandlers, handleHandlers } = createIpcMainMock();
  const setupWindow = {
    loadURL: jest.fn(),
    close: jest.fn(),
    webContents: {
      send: jest.fn()
    }
  };

  const dependencies = {
    ipcMain,
    gameSettings: { data_directory: 'data/default/en-us' },
    getGameSetupWindow: jest.fn(() => setupWindow),
    openGameSetupWindow: jest.fn(),
    openGameWindow: jest.fn(),
    getMainWindow: jest.fn(() => ({ id: 'main-window' })),
    ...overrides
  };

  registerIpcHandlers(dependencies);

  return {
    dependencies,
    onHandlers,
    handleHandlers,
    setupWindow
  };
}

/**
 * Create default valid player creation payload.
 * @returns {Object} Player payload.
 */
function createPlayerPayload() {
  return {
    name: 'Trader',
    pronouns: 'they/them',
    description: 'Test player',
    corporation: {
      name: 'Test Corp',
      description: 'Test corporation'
    }
  };
}

/**
 * Initialize current game state by creating universe + player.
 * @param {Object} context - Registration context.
 * @param {Object} universe - Universe mock.
 * @param {Object} game - Game instance mock.
 */
function initializeGame(context, universe, game) {
  createUniverse.mockReturnValue(universe);
  Game.mockImplementation(() => game);

  const event = { reply: jest.fn() };
  context.onHandlers['create-universe']({}, {
    systemCount: 2,
    connectionCount: 2,
    stellarObjectCount: 2
  });
  context.onHandlers['create-player'](event, createPlayerPayload());
}

describe('windowManager IPC registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Game.loadGame = jest.fn();

    mockCreateLogger.mockReturnValue(mockLogger);
    mockHomedir.mockReturnValue('/tmp/home');
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['save_1.json']);
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/save.json'] });

    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith('game_messages.json')) {
        return JSON.stringify({
          save_load: {
            load_failed: 'Failed to load game: {reason}'
          },
          navigation: {
            jumping: 'Jumping to System {systemId}...'
          }
        });
      }
      if (filePath.endsWith('ships.json')) {
        return JSON.stringify([{ id: 'ship-1' }]);
      }
      if (filePath.endsWith('goods.json')) {
        return JSON.stringify([{ id: 'good-1' }]);
      }
      return JSON.stringify({ save: true });
    });
  });

  test('registers on and handle listeners in ipcMain', () => {
    const { dependencies, onHandlers, handleHandlers } = registerWithMocks();

    expect(dependencies.ipcMain.on).toHaveBeenCalled();
    expect(dependencies.ipcMain.handle).toHaveBeenCalled();
    expect(onHandlers['open-new-game']).toEqual(expect.any(Function));
    expect(onHandlers['create-universe']).toEqual(expect.any(Function));
    expect(handleHandlers['get-universe-summary']).toEqual(expect.any(Function));
    expect(handleHandlers['get-game-messages']).toEqual(expect.any(Function));
  });

  test('handles renderer-log validation and forwarding', () => {
    const { onHandlers } = registerWithMocks();

    onHandlers['renderer-log']({}, { level: 'info', scope: 'ui', args: 'bad' });
    expect(mockLogger.warn).toHaveBeenCalled();

    onHandlers['renderer-log']({}, { level: 'bad-level', scope: 'ui', args: ['x'] });
    expect(mockLogger.error).toHaveBeenCalled();

    onHandlers['renderer-log']({}, { level: 'debug', scope: 'ui', args: ['ok'] });
    expect(mockLogger.debug).toHaveBeenCalledWith('ok');
    expect(mockCreateLogger).toHaveBeenCalledWith('renderer:ui');
  });

  test('navigates setup windows and handles basic setup responses', () => {
    const { onHandlers, handleHandlers, dependencies, setupWindow } = registerWithMocks();

    onHandlers['open-new-game']();
    expect(dependencies.openGameSetupWindow).toHaveBeenCalled();

    onHandlers['proceed-to-player-creation']();
    expect(setupWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('/app/player_creation.html'));

    onHandlers['return-to-universe-creation']();
    expect(setupWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('/app/new_game.html'));

    expect(handleHandlers['get-universe-graph']()).toBeNull();
    expect(handleHandlers['get-universe-summary']()).toBeNull();
  });

  test('creates universe and returns summary through handler', () => {
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Planet: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Planet: 1 } }))
    };
    createUniverse.mockReturnValue(universe);

    const { onHandlers, handleHandlers, setupWindow } = registerWithMocks();

    onHandlers['create-universe']({}, {
      systemCount: 5,
      connectionCount: 8,
      stellarObjectCount: 20
    });

    const summary = handleHandlers['get-universe-summary']();

    expect(createUniverse).toHaveBeenCalledWith(5, 8, 20);
    expect(summary).toEqual({
      typeTotals: { Planet: 1 },
      typeCountsBySystem: { 1: { Planet: 1 } }
    });
    expect(handleHandlers['get-universe-graph']()).toEqual({
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }]
    });
    expect(setupWindow.webContents.send).toHaveBeenCalledWith(
      'universe-created',
      expect.objectContaining({ summary })
    );
  });

  test('validates player creation input and universe prerequisite', () => {
    const { onHandlers } = registerWithMocks();
    const event = { reply: jest.fn() };

    onHandlers['create-player'](event, { name: '' });
    expect(event.reply).toHaveBeenCalledWith('player-creation-error', {
      message: 'All fields are required'
    });

    onHandlers['create-player'](event, createPlayerPayload());
    expect(event.reply).toHaveBeenCalledWith('player-creation-error', {
      message: 'Universe must be created first'
    });
  });

  test('creates player and returns location, universe, and map state', () => {
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Planet: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Planet: 1 } }))
    };
    const mockGame = {
      universe,
      exploredSystems: [1],
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({ locationId: 1 })),
      getPlayerState: jest.fn(() => ({ name: 'Trader', shipEnergy: 50, shipMaxEnergy: 100 })),
      player: { getOwnedCorporations: jest.fn(() => []) }
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    const locationState = context.handleHandlers['get-location-state']();

    expect(mockGame.initializeGame).toHaveBeenCalled();
    expect(context.setupWindow.close).toHaveBeenCalled();
    expect(context.dependencies.openGameWindow).toHaveBeenCalled();
    expect(locationState).toEqual({
      locationId: 1,
      playerState: { name: 'Trader', shipEnergy: 50, shipMaxEnergy: 100 }
    });
    expect(context.handleHandlers['get-universe-state']()).toEqual({
      systems: universe.systems,
      stellarObjects: universe.stellarObjects
    });
    expect(context.handleHandlers['get-universe-map-data']()).toEqual({
      systems: universe.systems,
      stellarObjects: universe.stellarObjects,
      exploredSystems: [1]
    });
  });

  test('handles company management flows', () => {
    const corporation = {
      name: 'Test Corp',
      description: 'Old description',
      setDividendRate: jest.fn(() => true),
      issueShares: jest.fn(() => true),
      takeLoan: jest.fn(() => ({ id: 7, amount: 5000 })),
      makeLoanPayment: jest.fn(() => true),
      setLoanRepaymentRate: jest.fn(() => true),
      getCompanyManagementState: jest.fn(() => ({ companyName: 'Test Corp' }))
    };

    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{
        id: 1,
        owner: 'Test Corp',
        setOwner: jest.fn(),
        type: 'Station',
        location: 1
      }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Station: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Station: 1 } }))
    };

    const mockGame = {
      universe,
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({ locationId: 1 })),
      getPlayerState: jest.fn(() => ({ name: 'Trader' })),
      player: { getOwnedCorporations: jest.fn(() => [corporation]) },
      corporations: [corporation]
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    expect(context.handleHandlers['get-player-companies']()).toEqual([{ companyName: 'Test Corp' }]);
    expect(context.handleHandlers['get-company-management-state']({}, { companyName: 'Test Corp' }))
      .toEqual({ companyName: 'Test Corp' });

    const updateResult = context.handleHandlers['update-company-profile']({}, {
      currentName: 'Test Corp',
      name: 'Renamed Corp',
      description: '  New desc  '
    });
    expect(updateResult.success).toBe(true);
    expect(universe.stellarObjects[0].setOwner).toHaveBeenCalledWith('Renamed Corp');

    expect(context.handleHandlers['update-company-dividend-rate']({}, {
      companyName: 'Renamed Corp',
      dividendRate: '0.12'
    }).success).toBe(true);

    expect(context.handleHandlers['issue-company-shares']({}, {
      companyName: 'Renamed Corp',
      shares: '100'
    }).success).toBe(true);

    expect(context.handleHandlers['take-company-loan']({}, {
      companyName: 'Renamed Corp',
      amount: '5000'
    })).toEqual(expect.objectContaining({ success: true, loan: { id: 7, amount: 5000 } }));

    expect(context.handleHandlers['make-company-loan-payment']({}, {
      companyName: 'Renamed Corp',
      loanId: '7',
      amount: '50'
    }).success).toBe(true);

    expect(context.handleHandlers['set-company-loan-repayment-rate']({}, {
      companyName: 'Renamed Corp',
      loanId: '7',
      repaymentRate: '0.04'
    }).success).toBe(true);

    expect(context.handleHandlers['update-company-profile']({}, { currentName: 'Missing' }))
      .toEqual({ success: false });
  });

  test('returns empty or failed company responses when game or company is unavailable', () => {
    const { handleHandlers } = registerWithMocks();

    expect(handleHandlers['get-player-companies']()).toEqual([]);
    expect(handleHandlers['get-company-management-state']({}, { companyName: 'Missing' })).toBeNull();
    expect(handleHandlers['update-company-dividend-rate']({}, { companyName: 'Missing', dividendRate: 0.1 }))
      .toEqual({ success: false });
    expect(handleHandlers['issue-company-shares']({}, { companyName: 'Missing', shares: 10 }))
      .toEqual({ success: false });
    expect(handleHandlers['take-company-loan']({}, { companyName: 'Missing', amount: 10 }))
      .toEqual({ success: false });
    expect(handleHandlers['make-company-loan-payment']({}, { companyName: 'Missing', loanId: 1, amount: 10 }))
      .toEqual({ success: false });
    expect(handleHandlers['set-company-loan-repayment-rate']({}, { companyName: 'Missing', loanId: 1, repaymentRate: 0.1 }))
      .toEqual({ success: false });
  });

  test('reads nested game messages and handles missing keys and read errors', () => {
    const { handleHandlers } = registerWithMocks();

    expect(handleHandlers['get-game-messages']({}, 'navigation.jumping')).toBe('Jumping to System {systemId}...');
    expect(handleHandlers['get-game-messages']({}, 'navigation.bad')).toBeNull();
    expect(handleHandlers['get-game-messages']()).toEqual(expect.objectContaining({ navigation: expect.any(Object) }));

    const failingContext = registerWithMocks({
      gameSettings: { data_directory: 'data/default/cache-miss' }
    });
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('read failed'); });
    expect(failingContext.handleHandlers['get-game-messages']({}, 'navigation.jumping')).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('returns system list diagnostics for game state variants', () => {
    const { handleHandlers } = registerWithMocks();
    expect(handleHandlers['get-all-systems']()).toEqual([]);

    const context = registerWithMocks();
    const universe = {
      systems: [{ id: 2, name: 'Beta', connections: {} }],
      stellarObjects: [],
      getStellarObjectTypeTotals: jest.fn(() => ({})),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({}))
    };
    const gameNoUniverseSystems = {
      universe: {},
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({})),
      getPlayerState: jest.fn(() => ({})),
      player: { getOwnedCorporations: jest.fn(() => []) }
    };

    initializeGame(context, universe, gameNoUniverseSystems);
    expect(context.handleHandlers['get-all-systems']()).toEqual([]);

    gameNoUniverseSystems.universe = universe;
    expect(context.handleHandlers['get-all-systems']()).toEqual([{ id: 2, name: 'Beta' }]);
  });

  test('calculates jump routes with no game, no route, and success', () => {
    const { handleHandlers } = registerWithMocks();
    expect(handleHandlers['calculate-jump-route']({}, { start: 1, destination: 2 }))
      .toEqual({ success: false, reason: 'No active game' });

    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [],
      findShortestPath: jest.fn()
    };
    universe.findShortestPath.mockReturnValueOnce(null);
    universe.findShortestPath.mockReturnValueOnce({ path: [1, 3, 2], cost: 11 });
    universe.getStellarObjectTypeTotals = jest.fn(() => ({}));
    universe.getStellarObjectTypeCountsBySystem = jest.fn(() => ({}));

    const mockGame = {
      universe,
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({})),
      getPlayerState: jest.fn(() => ({ shipEnergy: 50, shipMaxEnergy: 100 })),
      player: { energyPerJump: 6, getOwnedCorporations: jest.fn(() => []) }
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    expect(context.handleHandlers['calculate-jump-route']({}, { start: 1, destination: 2 }))
      .toEqual({ success: false, reason: 'No route found between systems' });

    expect(context.handleHandlers['calculate-jump-route']({}, { start: 1, destination: 2 }))
      .toEqual({
        success: true,
        route: [1, 3, 2],
        cost: 11,
        energyRequired: 12,
        currentEnergy: 50
      });
  });

  test('handles travel and construction events without and with active game', () => {
    const { onHandlers } = registerWithMocks();
    const event = { reply: jest.fn() };

    onHandlers['jump-to-system'](event, '3');
    onHandlers['dock-at-station'](event, '4');
    onHandlers['land-on-surface'](event, '5');
    onHandlers['take-off'](event);
    onHandlers['construct-building'](event, 'Mine');

    expect(event.reply).toHaveBeenCalledWith('jump-result', { success: false, reason: 'No active game' });
    expect(event.reply).toHaveBeenCalledWith('dock-result', { success: false, reason: 'No active game' });
    expect(event.reply).toHaveBeenCalledWith('land-result', { success: false, reason: 'No active game' });
    expect(event.reply).toHaveBeenCalledWith('takeoff-result', { success: false, reason: 'No active game' });
    expect(event.reply).toHaveBeenCalledWith('build-result', { success: false, reason: 'No active game' });

    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [],
      getStellarObjectTypeTotals: jest.fn(() => ({})),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({}))
    };

    const mockGame = {
      universe,
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({})),
      getPlayerState: jest.fn(() => ({})),
      player: { getOwnedCorporations: jest.fn(() => []) },
      jumpToSystem: jest.fn(() => ({ success: true })),
      dockAtStation: jest.fn(() => ({ success: true })),
      landOnPlanet: jest.fn(() => ({ success: true })),
      takeOff: jest.fn(() => ({ success: true })),
      buildBuildingAtCurrentObject: jest.fn(() => ({ success: true }))
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    const activeEvent = { reply: jest.fn() };
    context.onHandlers['jump-to-system'](activeEvent, '7');
    context.onHandlers['dock-at-station'](activeEvent, '8');
    context.onHandlers['land-on-surface'](activeEvent, '9');
    context.onHandlers['take-off'](activeEvent);
    context.onHandlers['construct-building'](activeEvent, 'Factory');

    expect(mockGame.jumpToSystem).toHaveBeenCalledWith(7);
    expect(mockGame.dockAtStation).toHaveBeenCalledWith(8);
    expect(mockGame.landOnPlanet).toHaveBeenCalledWith(9);
    expect(activeEvent.reply).toHaveBeenCalledWith('takeoff-result', { success: true });
    expect(activeEvent.reply).toHaveBeenCalledWith('build-result', { success: true });
  });

  test('saves game and returns success, no-game, and error responses', () => {
    const { onHandlers } = registerWithMocks();
    const event = { reply: jest.fn() };

    onHandlers['save-game'](event);
    expect(event.reply).toHaveBeenCalledWith('save-game-result', { success: false, reason: 'No active game' });

    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [],
      getStellarObjectTypeTotals: jest.fn(() => ({})),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({}))
    };
    const mockGame = {
      universe,
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({})),
      getPlayerState: jest.fn(() => ({})),
      player: { getOwnedCorporations: jest.fn(() => []) },
      getSaveData: jest.fn(() => ({ test: true }))
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(12345);
    mockExistsSync.mockReturnValueOnce(false);
    context.onHandlers['save-game'](event);

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/home/market_builder/saves', { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/home/market_builder/saves/save_12345.json',
      JSON.stringify({ test: true }, null, 2)
    );

    mockWriteFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
    context.onHandlers['save-game'](event);
    expect(event.reply).toHaveBeenCalledWith('save-game-result', { success: false, reason: 'Error saving game' });

    nowSpy.mockRestore();
  });

  test('returns save files and handles directory read errors', () => {
    const { onHandlers } = registerWithMocks();
    const event = { reply: jest.fn() };

    mockExistsSync.mockReturnValueOnce(false);
    mockReaddirSync.mockReturnValueOnce(['a.json', 'b.txt', 'c.json']);

    onHandlers['get-save-files'](event);
    expect(event.reply).toHaveBeenCalledWith('save-files-list', [
      '/tmp/home/market_builder/saves/a.json',
      '/tmp/home/market_builder/saves/c.json'
    ]);

    mockReaddirSync.mockImplementationOnce(() => { throw new Error('read fail'); });
    onHandlers['get-save-files'](event);
    expect(event.reply).toHaveBeenCalledWith('save-files-list', []);
  });

  test('opens load dialog for success and cancellation', async () => {
    const { handleHandlers, dependencies } = registerWithMocks();

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/slot1.json'] });
    await expect(handleHandlers['open-load-game-dialog']()).resolves.toEqual({
      success: true,
      filePath: '/tmp/slot1.json'
    });

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(handleHandlers['open-load-game-dialog']()).resolves.toEqual({
      success: false,
      filePath: null
    });

    expect(mockShowOpenDialog).toHaveBeenCalledWith(
      dependencies.getMainWindow(),
      expect.objectContaining({ properties: ['openFile'] })
    );
  });

  test('loads game successfully and emits load-game-error on failures', () => {
    const loadedGame = {
      universe: {
        systems: [{ id: 1, name: 'Alpha' }],
        stellarObjects: [{ id: 1, type: 'Station', location: 1 }],
        getStellarObjectTypeTotals: jest.fn(() => ({ Station: 1 })),
        getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Station: 1 } }))
      },
      getCurrentLocationState: jest.fn(() => ({ locationId: 1 })),
      getPlayerState: jest.fn(() => ({ name: 'Loaded Player' })),
      player: { getOwnedCorporations: jest.fn(() => []) }
    };

    const { onHandlers, handleHandlers, dependencies } = registerWithMocks();
    const event = { reply: jest.fn() };

    Game.loadGame.mockReturnValueOnce(loadedGame);
    onHandlers['load-game'](event, '/tmp/save.json');

    expect(Game.loadGame).toHaveBeenCalledWith({ save: true });
    expect(event.reply).toHaveBeenCalledWith('load-game-result', { success: true });
    expect(dependencies.openGameWindow).toHaveBeenCalled();
    expect(handleHandlers['get-universe-summary']()).toEqual({
      typeTotals: { Station: 1 },
      typeCountsBySystem: { 1: { Station: 1 } }
    });

    Game.loadGame.mockReturnValueOnce(null);
    onHandlers['load-game'](event, '/tmp/save.json');
    expect(event.reply).toHaveBeenCalledWith('load-game-error', { reason: 'Error loading game' });

    mockReadFileSync.mockImplementationOnce(() => { throw new Error('bad json'); });
    onHandlers['load-game'](event, '/tmp/save.json');
    expect(event.reply).toHaveBeenCalledWith('load-game-error', { reason: 'Error loading game' });
  });

  test('returns data payloads and market/trade/passenger handler results', () => {
    const { handleHandlers } = registerWithMocks();

    expect(handleHandlers['get-ships-data']()).toEqual([{ id: 'ship-1' }]);
    expect(handleHandlers['get-goods-data']()).toEqual([{ id: 'good-1' }]);
    expect(handleHandlers['get-buildable-buildings']()).toEqual([]);
    expect(handleHandlers['get-market-price']({}, { stellarObjectId: 1, goodName: 'ore', priceType: 'buy' })).toBeNull();
    expect(handleHandlers['trade-goods']({}, { action: 'buy' })).toEqual({ success: false, message: 'No active game' });
    expect(handleHandlers['load-passengers']({}, { stellarObjectId: 1, passengerCount: 5 }))
      .toEqual({ success: false, message: 'No active game' });
    expect(handleHandlers['unload-passengers']({}, { stellarObjectId: 1, passengerCount: 5 }))
      .toEqual({ success: false, message: 'No active game' });

    const stellarObject = { id: 1 };
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [stellarObject],
      getStellarObjectTypeTotals: jest.fn(() => ({ Station: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Station: 1 } }))
    };

    const mockGame = {
      universe,
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({})),
      getPlayerState: jest.fn(() => ({})),
      player: { getOwnedCorporations: jest.fn(() => []) },
      getBuildableBuildingsForCurrentObject: jest.fn(() => ['Mine']),
      calculateMarketPrice: jest.fn(() => 42),
      buyGood: jest.fn(() => ({ success: true, action: 'buy' })),
      sellGood: jest.fn(() => ({ success: true, action: 'sell' })),
      loadPassengers: jest.fn(() => ({ success: true, loaded: 2 })),
      unloadPassengers: jest.fn(() => ({ success: true, unloaded: 2 }))
    };

    const context = registerWithMocks();
    initializeGame(context, universe, mockGame);

    expect(context.handleHandlers['get-buildable-buildings']()).toEqual(['Mine']);
    expect(context.handleHandlers['get-market-price']({}, { stellarObjectId: 1, goodName: 'ore', priceType: 'buy' })).toBe(42);

    universe.stellarObjects = [];
    expect(context.handleHandlers['get-market-price']({}, { stellarObjectId: 1, goodName: 'ore', priceType: 'buy' })).toBeNull();

    universe.stellarObjects = [stellarObject];
    mockGame.calculateMarketPrice.mockImplementationOnce(() => { throw new Error('calc fail'); });
    expect(context.handleHandlers['get-market-price']({}, { stellarObjectId: 1, goodName: 'ore', priceType: 'buy' })).toBeNull();

    expect(context.handleHandlers['trade-goods']({}, {
      action: 'buy',
      goodName: 'ore',
      quantity: 1,
      price: 10,
      stellarObjectId: 1
    })).toEqual({ success: true, action: 'buy' });

    expect(context.handleHandlers['trade-goods']({}, {
      action: 'sell',
      goodName: 'ore',
      quantity: 1,
      price: 10,
      stellarObjectId: 1
    })).toEqual({ success: true, action: 'sell' });

    expect(context.handleHandlers['trade-goods']({}, {
      action: 'invalid',
      goodName: 'ore',
      quantity: 1,
      price: 10,
      stellarObjectId: 1
    })).toEqual({ success: false, message: 'Invalid trade action' });

    expect(context.handleHandlers['load-passengers']({}, { stellarObjectId: 1, passengerCount: 2 }))
      .toEqual({ success: true, loaded: 2 });
    expect(context.handleHandlers['unload-passengers']({}, { stellarObjectId: 1, passengerCount: 2 }))
      .toEqual({ success: true, unloaded: 2 });
  });
});

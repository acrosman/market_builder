const { createUniverse } = require('./universe');
const { Game } = require('./game');
const { registerIpcHandlers } = require('./windowManager');

jest.mock('./universe', () => ({
  createUniverse: jest.fn()
}));

jest.mock('./game', () => ({
  Game: jest.fn()
}));

/**
 * Build a mock ipcMain object that records registrations.
 * @returns {Object} Mock ipcMain and handler maps.
 * @example
 * const { ipcMain, onHandlers, handleHandlers } = createIpcMainMock();
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
 * @returns {Object} Registration context and handler maps.
 * @example
 * const context = registerWithMocks();
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
    dialog: { showOpenDialog: jest.fn() },
    logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() })),
    validLogLevels: new Set(['error', 'warn', 'info', 'debug']),
    gameSettings: { data_directory: 'data/default/en-us' },
    fs: { readFileSync: jest.fn(), existsSync: jest.fn(), mkdirSync: jest.fn(), writeFileSync: jest.fn(), readdirSync: jest.fn() },
    path: { join: jest.fn((...parts) => parts.join('/')) },
    os: { homedir: jest.fn(() => '/tmp/home') },
    getGameSetupWindow: jest.fn(() => setupWindow),
    openGameSetupWindow: jest.fn(),
    openGameWindow: jest.fn(),
    getMainWindow: jest.fn(() => ({ id: 'main-window' })),
    baseDir: '/repo',
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

describe('windowManager IPC registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Game.loadGame = jest.fn();
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
    expect(setupWindow.webContents.send).toHaveBeenCalledWith(
      'universe-created',
      expect.objectContaining({ summary })
    );
  });

  test('reads nested game messages using dot-notation keys', () => {
    const messagesData = {
      navigation: {
        jumping: 'Jumping to System {systemId}...'
      }
    };

    const { dependencies, handleHandlers } = registerWithMocks({
      fs: {
        readFileSync: jest.fn(() => JSON.stringify(messagesData)),
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        readdirSync: jest.fn()
      }
    });

    const result = handleHandlers['get-game-messages']({}, 'navigation.jumping');

    expect(result).toBe('Jumping to System {systemId}...');
    expect(dependencies.fs.readFileSync).toHaveBeenCalledWith(
      '/repo/data/default/en-us/game_messages.json',
      'utf-8'
    );
  });

  test('returns no active game when trade-goods runs before game creation', () => {
    const { handleHandlers } = registerWithMocks();

    const result = handleHandlers['trade-goods']({}, { action: 'buy' });

    expect(result).toEqual({ success: false, message: 'No active game' });
  });

  test('creates player and returns location state with player snapshot', () => {
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Planet: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Planet: 1 } }))
    };
    createUniverse.mockReturnValue(universe);

    const mockGame = {
      initializeGame: jest.fn(),
      getCurrentLocationState: jest.fn(() => ({ locationId: 1 })),
      getPlayerState: jest.fn(() => ({ name: 'Trader' }))
    };
    Game.mockImplementation(() => mockGame);

    const { onHandlers, handleHandlers, dependencies } = registerWithMocks();
    const event = { reply: jest.fn() };

    onHandlers['create-universe']({}, {
      systemCount: 2,
      connectionCount: 2,
      stellarObjectCount: 2
    });

    onHandlers['create-player'](event, {
      name: 'Trader',
      pronouns: 'they/them',
      description: 'Test player',
      corporation: {
        name: 'Test Corp',
        description: 'Test corporation'
      }
    });

    const locationState = handleHandlers['get-location-state']();

    expect(Game).toHaveBeenCalledWith(universe, dependencies.gameSettings);
    expect(mockGame.initializeGame).toHaveBeenCalled();
    expect(dependencies.openGameWindow).toHaveBeenCalled();
    expect(locationState).toEqual({
      locationId: 1,
      playerState: { name: 'Trader' }
    });
  });

  test('rejects player creation when universe has not been generated', () => {
    const { onHandlers } = registerWithMocks();
    const event = { reply: jest.fn() };

    onHandlers['create-player'](event, {
      name: 'Trader',
      pronouns: 'they/them',
      description: 'Test player',
      corporation: {
        name: 'Test Corp',
        description: 'Test corporation'
      }
    });

    expect(Game).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith('player-creation-error', {
      message: 'Universe must be created first'
    });
  });

  test('saves game and replies with save path', () => {
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Planet: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Planet: 1 } }))
    };
    createUniverse.mockReturnValue(universe);
    const mockGame = {
      initializeGame: jest.fn(),
      getSaveData: jest.fn(() => ({ test: true }))
    };
    Game.mockImplementation(() => mockGame);

    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(12345);
    const { onHandlers, dependencies } = registerWithMocks({
      fs: {
        readFileSync: jest.fn(),
        existsSync: jest.fn(() => false),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        readdirSync: jest.fn()
      }
    });
    const event = { reply: jest.fn() };

    onHandlers['create-universe']({}, { systemCount: 1, connectionCount: 1, stellarObjectCount: 1 });
    onHandlers['create-player'](event, {
      name: 'Trader',
      pronouns: 'they/them',
      description: 'Test player',
      corporation: { name: 'Test Corp', description: 'Test corporation' }
    });
    onHandlers['save-game'](event);

    expect(dependencies.fs.mkdirSync).toHaveBeenCalledWith('/tmp/home/market_builder/saves', { recursive: true });
    expect(dependencies.fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/home/market_builder/saves/save_12345.json',
      JSON.stringify({ test: true }, null, 2)
    );
    expect(event.reply).toHaveBeenCalledWith('save-game-result', {
      success: true,
      savePath: '/tmp/home/market_builder/saves/save_12345.json'
    });

    dateNowSpy.mockRestore();
  });

  test('returns save error when writing save file fails', () => {
    const universe = {
      systems: [{ id: 1, name: 'Alpha', connections: {} }],
      stellarObjects: [{ id: 10, type: 'Planet', location: 1 }],
      getStellarObjectTypeTotals: jest.fn(() => ({ Planet: 1 })),
      getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Planet: 1 } }))
    };
    createUniverse.mockReturnValue(universe);
    const mockGame = {
      initializeGame: jest.fn(),
      getSaveData: jest.fn(() => ({ test: true }))
    };
    Game.mockImplementation(() => mockGame);

    const { onHandlers, dependencies } = registerWithMocks({
      fs: {
        readFileSync: jest.fn(),
        existsSync: jest.fn(() => true),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(() => { throw new Error('disk full'); }),
        readdirSync: jest.fn()
      }
    });
    const event = { reply: jest.fn() };

    onHandlers['create-universe']({}, { systemCount: 1, connectionCount: 1, stellarObjectCount: 1 });
    onHandlers['create-player'](event, {
      name: 'Trader',
      pronouns: 'they/them',
      description: 'Test player',
      corporation: { name: 'Test Corp', description: 'Test corporation' }
    });
    onHandlers['save-game'](event);

    expect(dependencies.logger.error).toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith('save-game-result', {
      success: false,
      reason: 'Error saving game'
    });
  });

  test('loads game successfully and opens gameplay window', () => {
    const loadedGame = {
      id: 'loaded-game',
      universe: {
        getStellarObjectTypeTotals: jest.fn(() => ({ Station: 2 })),
        getStellarObjectTypeCountsBySystem: jest.fn(() => ({ 1: { Station: 2 } }))
      }
    };
    Game.loadGame.mockReturnValue(loadedGame);

    const { onHandlers, handleHandlers, dependencies } = registerWithMocks({
      fs: {
        readFileSync: jest.fn(() => JSON.stringify({ save: true })),
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        readdirSync: jest.fn()
      }
    });
    const event = { reply: jest.fn() };

    onHandlers['load-game'](event, '/tmp/save.json');
    const summary = handleHandlers['get-universe-summary']();

    expect(Game.loadGame).toHaveBeenCalledWith({ save: true });
    expect(event.reply).toHaveBeenCalledWith('load-game-result', { success: true });
    expect(dependencies.openGameWindow).toHaveBeenCalled();
    expect(summary).toEqual({
      typeTotals: { Station: 2 },
      typeCountsBySystem: { 1: { Station: 2 } }
    });
  });

  test('returns load error when loaded game is invalid', () => {
    Game.loadGame.mockReturnValue(null);

    const { onHandlers, dependencies } = registerWithMocks({
      fs: {
        readFileSync: jest.fn(() => JSON.stringify({ save: true })),
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        readdirSync: jest.fn()
      }
    });
    const event = { reply: jest.fn() };

    onHandlers['load-game'](event, '/tmp/save.json');

    expect(dependencies.logger.error).toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith('load-game-error', {
      reason: 'Error loading game'
    });
    expect(event.reply).toHaveBeenCalledWith('load-game-result', {
      success: false,
      reason: 'Error loading game'
    });
    expect(dependencies.openGameWindow).not.toHaveBeenCalled();
  });
});

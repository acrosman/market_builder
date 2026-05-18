/**
 * Integration tests for preload.js
 * Tests the actual preload script by loading it with a mocked electron module.
 * jest.mock is hoisted to the top of the file before any other code runs.
 */

jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn()
  },
  ipcRenderer: {
    send: jest.fn(),
    invoke: jest.fn().mockResolvedValue({}),
    on: jest.fn()
  }
}));

describe('preload.js (integration)', () => {
  let api;
  let logger;
  let ipcRenderer;

  beforeAll(() => {
    jest.resetModules();
    require('./preload');
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
    // Extract the api and logger objects exposed via contextBridge.exposeInMainWorld(...)
    api = electron.contextBridge.exposeInMainWorld.mock.calls.find(call => call[0] === 'api')[1];
    logger = electron.contextBridge.exposeInMainWorld.mock.calls.find(call => call[0] === 'logger')[1];
  });

  beforeEach(() => {
    ipcRenderer.send.mockClear();
    ipcRenderer.invoke.mockClear();
    ipcRenderer.on.mockClear();
  });

  describe('send()', () => {
    const validChannels = [
      'open-new-game',
      'create-universe',
      'create-player',
      'return-to-universe-creation',
      'proceed-to-player-creation',
      'get-location-info',
      'jump-to-system',
      'dock-at-station',
      'land-on-surface',
      'save-game',
      'load-game',
      'get-save-files',
      'take-off'
    ];

    test.each(validChannels)('sends on valid channel "%s"', (channel) => {
      api.send(channel, { payload: 'test' });
      expect(ipcRenderer.send).toHaveBeenCalledWith(channel, { payload: 'test' });
    });

    test('ignores invalid channel', () => {
      api.send('evil-channel', { payload: 'test' });
      expect(ipcRenderer.send).not.toHaveBeenCalled();
    });
  });

  describe('invoke()', () => {
    const validChannels = [
      'get-location-state',
      'get-game-settings',
      'get-ship-data',
      'get-universe-graph',
      'get-universe-summary',
      'get-universe-state',
      'get-universe-map-data',
      'open-load-game-dialog',
      'get-all-systems',
      'calculate-jump-route',
      'get-game-messages',
      'get-ships-data',
      'get-goods-data',
      'get-market-price',
      'trade-goods',
      'load-passengers',
      'unload-passengers'
    ];

    test.each(validChannels)('invokes valid channel "%s"', (channel) => {
      api.invoke(channel, { data: 'test' });
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, { data: 'test' });
    });

    test('returns undefined for invalid channel', () => {
      const result = api.invoke('invalid-channel', { data: 'test' });
      expect(result).toBeUndefined();
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe('receive()', () => {
    const validChannels = [
      'universe-created',
      'player-creation-error',
      'player-creation-success',
      'location-update',
      'jump-result',
      'dock-result',
      'land-result',
      'save-game-result',
      'load-game-result',
      'save-files-list',
      'takeoff-result'
    ];

    test.each(validChannels)('registers listener for valid channel "%s"', (channel) => {
      api.receive(channel, jest.fn());
      expect(ipcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function));
      ipcRenderer.on.mockClear();
    });

    test('strips event object from callback arguments', () => {
      let registeredHandler;
      ipcRenderer.on.mockImplementation((_channel, handler) => {
        registeredHandler = handler;
      });

      const mockCallback = jest.fn();
      api.receive('jump-result', mockCallback);

      // Simulate ipcRenderer calling the wrapped handler with the event + args
      registeredHandler({ sender: 'main' }, { success: true, reason: null });
      expect(mockCallback).toHaveBeenCalledWith({ success: true, reason: null });
    });

    test('does not register listener for invalid channel', () => {
      api.receive('malicious-channel', jest.fn());
      expect(ipcRenderer.on).not.toHaveBeenCalled();
    });
  });

  describe('helper methods', () => {
    test('getLocationState() invokes get-location-state', () => {
      api.getLocationState();
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-location-state');
    });

    test('getUniverseState() invokes get-universe-state', () => {
      api.getUniverseState();
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-universe-state');
    });

    test('getUniverseMapData() invokes get-universe-map-data', () => {
      api.getUniverseMapData();
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-universe-map-data');
    });

    test('getGameSettings() invokes get-game-settings', () => {
      api.getGameSettings();
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-game-settings');
    });

    test('getShipData() invokes get-ship-data', () => {
      api.getShipData();
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-ship-data');
    });

    test('getGameData("ships") invokes get-ship-data', () => {
      api.getGameData('ships');
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-ship-data');
    });

    test('getGameData with unknown type returns null', () => {
      const result = api.getGameData('unknown-type');
      expect(result).toBeNull();
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe('logger bridge', () => {
    test('exposes logger object in main world', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    test('sends renderer logs with expected level and scope', () => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');

      expect(ipcRenderer.send).toHaveBeenNthCalledWith(1, 'renderer-log', {
        level: 'debug',
        scope: 'ui',
        args: ['d']
      });
      expect(ipcRenderer.send).toHaveBeenNthCalledWith(2, 'renderer-log', {
        level: 'info',
        scope: 'ui',
        args: ['i']
      });
      expect(ipcRenderer.send).toHaveBeenNthCalledWith(3, 'renderer-log', {
        level: 'warn',
        scope: 'ui',
        args: ['w']
      });
    });

    test('serializes Error objects before sending log payload', () => {
      const error = new Error('Boom');
      logger.error('message', error);

      expect(ipcRenderer.send).toHaveBeenCalledWith('renderer-log', {
        level: 'error',
        scope: 'ui',
        args: [
          'message',
          expect.objectContaining({
            name: 'Error',
            message: 'Boom',
            stack: expect.any(String)
          })
        ]
      });
    });
  });
});

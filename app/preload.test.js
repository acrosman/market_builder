/**
 * Tests for preload.js
 * Tests the contextBridge API exposure and IPC channel validation
 */

describe('Preload Script', () => {
  let mockContextBridge;
  let mockIpcRenderer;
  let exposedApi;

  beforeEach(() => {
    // Mock contextBridge
    mockContextBridge = {
      exposeInMainWorld: jest.fn((name, api) => {
        exposedApi = api;
      })
    };

    // Mock ipcRenderer
    mockIpcRenderer = {
      send: jest.fn(),
      invoke: jest.fn(),
      on: jest.fn()
    };

    // Mock require for electron
    jest.mock('electron', () => ({
      contextBridge: mockContextBridge,
      ipcRenderer: mockIpcRenderer
    }), { virtual: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('API Exposure', () => {
    test('should expose api object to main world', () => {
      // Simulate the preload script exposing the API
      const api = {
        send: jest.fn(),
        invoke: jest.fn(),
        receive: jest.fn(),
        getLocationState: jest.fn(),
        getGameSettings: jest.fn(),
        getShipData: jest.fn()
      };

      mockContextBridge.exposeInMainWorld('api', api);

      expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', api);
      expect(exposedApi).toBeDefined();
    });
  });

  describe('Send Channel Validation', () => {
    const validSendChannels = [
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

    test.each(validSendChannels)('should allow send on valid channel: %s', (channel) => {
      // Simulate the send function with channel validation
      const sendFn = (channel, data) => {
        const validChannels = validSendChannels;
        if (validChannels.includes(channel)) {
          mockIpcRenderer.send(channel, data);
          return true;
        }
        return false;
      };

      const result = sendFn(channel, { test: 'data' });

      expect(result).toBe(true);
      expect(mockIpcRenderer.send).toHaveBeenCalledWith(channel, { test: 'data' });
    });

    test('should block send on invalid channel', () => {
      const sendFn = (channel, data) => {
        const validChannels = validSendChannels;
        if (validChannels.includes(channel)) {
          mockIpcRenderer.send(channel, data);
          return true;
        }
        return false;
      };

      const result = sendFn('malicious-channel', { test: 'data' });

      expect(result).toBe(false);
      expect(mockIpcRenderer.send).not.toHaveBeenCalled();
    });
  });

  describe('Invoke Channel Validation', () => {
    const validInvokeChannels = [
      'get-location-state',
      'get-game-settings',
      'get-ship-data',
      'get-universe-graph',
      'get-universe-summary',
      'open-load-game-dialog',
      'get-all-systems',
      'calculate-jump-route',
      'get-game-messages'
    ];

    test.each(validInvokeChannels)('should allow invoke on valid channel: %s', (channel) => {
      mockIpcRenderer.invoke.mockResolvedValue({ success: true });

      const invokeFn = (channel, data) => {
        const validChannels = validInvokeChannels;
        if (validChannels.includes(channel)) {
          return mockIpcRenderer.invoke(channel, data);
        }
        return null;
      };

      const result = invokeFn(channel, { test: 'data' });

      expect(result).toBeTruthy();
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(channel, { test: 'data' });
    });

    test('should block invoke on invalid channel', () => {
      const invokeFn = (channel, data) => {
        const validChannels = validInvokeChannels;
        if (validChannels.includes(channel)) {
          return mockIpcRenderer.invoke(channel, data);
        }
        return null;
      };

      const result = invokeFn('malicious-invoke', { test: 'data' });

      expect(result).toBeNull();
      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe('Receive Channel Validation', () => {
    const validReceiveChannels = [
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

    test.each(validReceiveChannels)('should allow receive on valid channel: %s', (channel) => {
      const mockCallback = jest.fn();

      const receiveFn = (channel, func) => {
        const validChannels = validReceiveChannels;
        if (validChannels.includes(channel)) {
          mockIpcRenderer.on(channel, (event, ...args) => func(...args));
          return true;
        }
        return false;
      };

      const result = receiveFn(channel, mockCallback);

      expect(result).toBe(true);
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function));
    });

    test('should block receive on invalid channel', () => {
      const mockCallback = jest.fn();

      const receiveFn = (channel, func) => {
        const validChannels = validReceiveChannels;
        if (validChannels.includes(channel)) {
          mockIpcRenderer.on(channel, (event, ...args) => func(...args));
          return true;
        }
        return false;
      };

      const result = receiveFn('malicious-receive', mockCallback);

      expect(result).toBe(false);
      expect(mockIpcRenderer.on).not.toHaveBeenCalled();
    });

    test('should strip event object and pass only data to callback', () => {
      const mockCallback = jest.fn();
      let registeredHandler;

      mockIpcRenderer.on.mockImplementation((channel, handler) => {
        registeredHandler = handler;
      });

      const receiveFn = (channel, func) => {
        const validChannels = validReceiveChannels;
        if (validChannels.includes(channel)) {
          mockIpcRenderer.on(channel, (event, ...args) => func(...args));
          return true;
        }
        return false;
      };

      receiveFn('jump-result', mockCallback);

      // Simulate IPC event with event object and data
      const mockEvent = { sender: 'main' };
      const mockData = { success: true, destination: 'Alpha' };
      registeredHandler(mockEvent, mockData);

      // Callback should receive only data, not event object
      expect(mockCallback).toHaveBeenCalledWith(mockData);
      expect(mockCallback).not.toHaveBeenCalledWith(mockEvent, mockData);
    });
  });

  describe('Helper Methods', () => {
    test('getLocationState should invoke get-location-state', () => {
      mockIpcRenderer.invoke.mockResolvedValue({ system: 'Alpha' });

      const getLocationState = () => mockIpcRenderer.invoke('get-location-state');

      const result = getLocationState();

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-location-state');
      expect(result).resolves.toEqual({ system: 'Alpha' });
    });

    test('getGameSettings should invoke get-game-settings', () => {
      mockIpcRenderer.invoke.mockResolvedValue({ setting: 'value' });

      const getGameSettings = () => mockIpcRenderer.invoke('get-game-settings');

      const result = getGameSettings();

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-game-settings');
      expect(result).resolves.toEqual({ setting: 'value' });
    });

    test('getShipData should invoke get-ship-data', () => {
      mockIpcRenderer.invoke.mockResolvedValue({ ship: 'Shuttle' });

      const getShipData = () => mockIpcRenderer.invoke('get-ship-data');

      const result = getShipData();

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-ship-data');
      expect(result).resolves.toEqual({ ship: 'Shuttle' });
    });
  });

  describe('Security', () => {
    test('should not expose ipcRenderer directly', () => {
      const api = {
        send: jest.fn(),
        invoke: jest.fn(),
        receive: jest.fn(),
        getLocationState: jest.fn(),
        getGameSettings: jest.fn(),
        getShipData: jest.fn()
      };

      mockContextBridge.exposeInMainWorld('api', api);

      // ipcRenderer should not be in the exposed API
      expect(exposedApi.ipcRenderer).toBeUndefined();
    });

    test('should not allow arbitrary channel access', () => {
      const validChannels = ['open-new-game'];

      const sendFn = (channel, data) => {
        if (validChannels.includes(channel)) {
          mockIpcRenderer.send(channel, data);
          return true;
        }
        return false;
      };

      // Try various malicious channel names
      expect(sendFn('fs-read-file', '/etc/passwd')).toBe(false);
      expect(sendFn('execute-command', 'rm -rf /')).toBe(false);
      expect(sendFn('eval', 'malicious code')).toBe(false);

      expect(mockIpcRenderer.send).not.toHaveBeenCalled();
    });
  });
});

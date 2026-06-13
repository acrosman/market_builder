const navigationHandlers = require('./navigationHandlers');

describe('navigationHandlers', () => {
  let mockApi;
  let mockContext;
  let consoleDiv;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="game-console"></div>
      <input id="game-input" />
      <div id="jump-buttons"></div>
      <div id="local-buttons"></div>
      <button id="jump-planner-btn">Jump Planner</button>
      <button id="universe-map-btn">Universe Map</button>
      <button id="save-game-btn">Save Game</button>
      <button id="load-game-btn">Load Game</button>
      <button id="player-status-btn">Player Status</button>
      <button id="game-settings-btn">Game Settings</button>
    `;
    consoleDiv = document.getElementById('game-console');

    mockApi = {
      send: jest.fn(),
      invoke: jest.fn(),
      receive: jest.fn(),
      getLocationState: jest.fn()
    };

    mockContext = {
      api: mockApi,
      commandParser: {
        normalizeCommandText: jest.fn(text => (text || '').trim().toLowerCase()),
        parseNumericSystemId: jest.fn(() => null),
        parseJumpSystemId: jest.fn(() => null),
        applyAlias: jest.fn(cmd => cmd),
        resolveUniqueFirstWord: jest.fn(() => null)
      },
      commandAliases: { l: 'land', d: 'dock', b: 'build' },
      addMessage: jest.fn(),
      resolveMessageText: jest.fn().mockResolvedValue(''),
      updateLocationDisplay: jest.fn().mockResolvedValue(undefined),
      updateShipStatus: jest.fn().mockResolvedValue(undefined),
      displayStellarObjectProperties: jest.fn().mockResolvedValue(undefined),
      closeModal: jest.fn(),
      openTradeModal: jest.fn(),
      openBuildingsModal: jest.fn()
    };

    navigationHandlers.init(mockContext);

    global.fetch = jest.fn();
    jest.clearAllMocks();

    // Re-init after clearing mocks so receive handlers are registered
    navigationHandlers.init(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('setCommandInputBusy', () => {
    test('disables input when isBusy is true', () => {
      const input = document.getElementById('game-input');
      navigationHandlers.setCommandInputBusy(true);
      expect(input.disabled).toBe(true);
    });

    test('enables input when isBusy is false', () => {
      const input = document.getElementById('game-input');
      input.disabled = true;
      navigationHandlers.setCommandInputBusy(false);
      expect(input.disabled).toBe(false);
    });

    test('does not throw when game-input is absent', () => {
      document.getElementById('game-input').remove();
      expect(() => navigationHandlers.setCommandInputBusy(true)).not.toThrow();
    });
  });

  describe('getCommandButtons', () => {
    test('returns static UI buttons', () => {
      const buttons = navigationHandlers.getCommandButtons();
      const ids = buttons.map(b => b.id);
      expect(ids).toContain('jump-planner-btn');
      expect(ids).toContain('save-game-btn');
      expect(ids).toContain('player-status-btn');
    });

    test('includes dynamically added action buttons', () => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      document.getElementById('jump-buttons').appendChild(btn);
      const buttons = navigationHandlers.getCommandButtons();
      expect(buttons).toContain(btn);
    });
  });

  describe('executeCommandButton', () => {
    test('returns false for null button', () => {
      expect(navigationHandlers.executeCommandButton(null)).toBe(false);
    });

    test('clicks enabled button and returns true', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Jump to System 2';
      btn.disabled = false;
      const clickSpy = jest.fn();
      btn.addEventListener('click', clickSpy);
      document.body.appendChild(btn);

      expect(navigationHandlers.executeCommandButton(btn)).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });

    test('shows unavailable message for disabled button and returns true', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Jump to System 2';
      btn.disabled = true;
      document.body.appendChild(btn);

      expect(navigationHandlers.executeCommandButton(btn)).toBe(true);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.unavailable', { command: 'Jump to System 2' });
    });
  });

  describe('executeLocalActionShortcut', () => {
    test('shows no_action_available when no matching button exists', () => {
      navigationHandlers.executeLocalActionShortcut('dock');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.no_action_available', { action: 'dock' });
    });

    test('clicks first available matching button', () => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.dataset.action = 'dock';
      btn.textContent = 'Dock at Station Alpha';
      btn.disabled = false;
      const clickSpy = jest.fn();
      btn.addEventListener('click', clickSpy);
      document.getElementById('local-buttons').appendChild(btn);

      navigationHandlers.executeLocalActionShortcut('dock');
      expect(clickSpy).toHaveBeenCalled();
    });

    test('falls back to first disabled button if all disabled', () => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.dataset.action = 'land';
      btn.textContent = 'Land on Terra';
      btn.disabled = true;
      document.getElementById('local-buttons').appendChild(btn);

      // Will call executeCommandButton on the disabled button → shows unavailable
      navigationHandlers.executeLocalActionShortcut('land');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.unavailable', { command: 'Land on Terra' });
    });
  });

  describe('handleJump', () => {
    test('sends jump-to-system IPC message', () => {
      navigationHandlers.handleJump(5);
      expect(mockApi.send).toHaveBeenCalledWith('jump-to-system', 5);
    });

    test('displays navigation message', () => {
      navigationHandlers.handleJump(5);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.jumping', { systemId: 5 });
    });

    test('disables action buttons', () => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.disabled = false;
      document.getElementById('jump-buttons').appendChild(btn);

      navigationHandlers.handleJump(5);
      expect(btn.disabled).toBe(true);
    });

    test('disables command input', () => {
      navigationHandlers.handleJump(5);
      expect(document.getElementById('game-input').disabled).toBe(true);
    });
  });

  describe('handleDock', () => {
    test('sends dock-at-station IPC message', () => {
      navigationHandlers.handleDock(42, 'Station Alpha');
      expect(mockApi.send).toHaveBeenCalledWith('dock-at-station', 42);
    });

    test('displays docking request message', () => {
      navigationHandlers.handleDock(42, 'Station Alpha');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.docking_request', { objectName: 'Station Alpha' });
    });

    test('disables command input', () => {
      navigationHandlers.handleDock(42, 'Station Alpha');
      expect(document.getElementById('game-input').disabled).toBe(true);
    });
  });

  describe('handleLand', () => {
    test('sends land-on-surface with numeric ID', () => {
      navigationHandlers.handleLand('101', 'New Terra');
      expect(mockApi.send).toHaveBeenCalledWith('land-on-surface', 101);
    });

    test('passes numeric ID as-is when already a number', () => {
      navigationHandlers.handleLand(101, 'New Terra');
      expect(mockApi.send).toHaveBeenCalledWith('land-on-surface', 101);
    });

    test('displays landing request message', () => {
      navigationHandlers.handleLand(101, 'New Terra');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.landing_request', { objectName: 'New Terra' });
    });
  });

  describe('handleTakeOff', () => {
    test('sends take-off IPC message', () => {
      navigationHandlers.handleTakeOff();
      expect(mockApi.send).toHaveBeenCalledWith('take-off');
    });

    test('displays taking off message', () => {
      navigationHandlers.handleTakeOff();
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.taking_off');
    });

    test('disables command input', () => {
      navigationHandlers.handleTakeOff();
      expect(document.getElementById('game-input').disabled).toBe(true);
    });
  });

  describe('handleBuild', () => {
    test('sends construct-building IPC message', () => {
      navigationHandlers.handleBuild('Mine');
      expect(mockApi.send).toHaveBeenCalledWith('construct-building', 'Mine');
    });

    test('displays build request message', () => {
      navigationHandlers.handleBuild('Mine');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.build_request', { buildingType: 'Mine' });
    });
  });

  describe('offerRouteAndJump', () => {
    test('shows takeoff_required when player is docked', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: 5, landedOn: null, location: 1 }
      });
      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.takeoff_required');
    });

    test('shows takeoff_required when player is landed', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: 10, location: 1 }
      });
      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.takeoff_required');
    });

    test('shows already_here when destination equals current system', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 3 }
      });
      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.already_here', { systemId: 3 });
    });

    test('shows system_not_found when destination does not exist', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // get-all-systems
      await navigationHandlers.offerRouteAndJump(99);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.system_not_found', { systemId: 99 });
    });

    test('shows route_failed when route calculation fails', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke
        .mockResolvedValueOnce([{ id: 1 }, { id: 3 }]) // get-all-systems
        .mockResolvedValueOnce({ success: false, reason: 'No path' }); // calculate-jump-route
      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.route_failed', { reason: 'No path' });
    });

    test('cancels when user declines confirm dialog', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke
        .mockResolvedValueOnce([{ id: 1 }, { id: 3 }]) // get-all-systems
        .mockResolvedValueOnce({ success: true, route: [1, 3], cost: 5, energyRequired: 10, currentEnergy: 20 }); // calculate-jump-route
      mockContext.resolveMessageText.mockResolvedValue('Confirm?');
      window.confirm = jest.fn().mockReturnValue(false);

      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.route_cancelled', { systemId: 3 });
    });

    test('returns early when locationState is null', async () => {
      mockApi.getLocationState.mockResolvedValue(null);
      await navigationHandlers.offerRouteAndJump(3);
      expect(mockContext.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('updateAvailableActions', () => {
    const baseLocationState = {
      playerState: { dockedAt: null, landedOn: null },
      system: { connections: { 2: {}, 3: {} } },
      objects: []
    };

    test('creates jump buttons for each connected system', () => {
      navigationHandlers.updateAvailableActions(baseLocationState);
      const buttons = document.querySelectorAll('#jump-buttons .action-btn');
      expect(buttons.length).toBe(2);
    });

    test('jump buttons are enabled when in space', () => {
      navigationHandlers.updateAvailableActions(baseLocationState);
      document.querySelectorAll('#jump-buttons .action-btn').forEach(btn => {
        expect(btn.disabled).toBe(false);
      });
    });

    test('jump buttons are disabled when docked', () => {
      const state = { ...baseLocationState, playerState: { dockedAt: 5, landedOn: null } };
      state.objects = [{ id: 5, type: 'Space Station', name: 'Station', capabilities: {} }];
      navigationHandlers.updateAvailableActions(state);
      document.querySelectorAll('#jump-buttons .action-btn').forEach(btn => {
        expect(btn.disabled).toBe(true);
      });
    });

    test('creates dock button for Space Station when in space', () => {
      const state = {
        ...baseLocationState,
        objects: [{ id: 5, type: 'Space Station', name: 'Station Alpha', capabilities: {} }]
      };
      navigationHandlers.updateAvailableActions(state);
      const dockBtn = document.querySelector('#local-buttons [data-action="dock"]');
      expect(dockBtn).not.toBeNull();
      expect(dockBtn.textContent).toBe('Dock at Station Alpha');
    });

    test('creates land button for Planet when in space', () => {
      const state = {
        ...baseLocationState,
        objects: [{ id: 10, type: 'Planet', name: 'New Terra', capabilities: {} }]
      };
      navigationHandlers.updateAvailableActions(state);
      const landBtn = document.querySelector('#local-buttons [data-action="land"]');
      expect(landBtn).not.toBeNull();
      expect(landBtn.textContent).toBe('Land on New Terra');
    });

    test('creates land button for Asteroid when in space', () => {
      const state = {
        ...baseLocationState,
        objects: [{ id: 11, type: 'Asteroid', name: 'Rock Omega', capabilities: {} }]
      };
      navigationHandlers.updateAvailableActions(state);
      const landBtn = document.querySelector('#local-buttons [data-action="land"]');
      expect(landBtn).not.toBeNull();
    });

    test('creates takeoff button when docked', () => {
      const state = {
        ...baseLocationState,
        playerState: { dockedAt: 5, landedOn: null },
        objects: [{ id: 5, type: 'Space Station', name: 'Station', capabilities: {} }]
      };
      navigationHandlers.updateAvailableActions(state);
      const takeoffBtn = document.querySelector('#local-buttons [data-action="takeoff"]');
      expect(takeoffBtn).not.toBeNull();
    });

    test('shows trade button when landed on market-capable object', () => {
      const state = {
        ...baseLocationState,
        playerState: { dockedAt: null, landedOn: 10 },
        objects: [{ id: 10, type: 'Planet', name: 'Market World', capabilities: { market: true } }]
      };
      navigationHandlers.updateAvailableActions(state);
      const tradeBtn = document.querySelector('#local-buttons [data-action="trade"]');
      expect(tradeBtn).not.toBeNull();
    });

    test('does not show trade button when landed on non-market object', () => {
      const state = {
        ...baseLocationState,
        playerState: { dockedAt: null, landedOn: 10 },
        objects: [{ id: 10, type: 'Planet', name: 'Barren World', capabilities: { market: false } }]
      };
      navigationHandlers.updateAvailableActions(state);
      const tradeBtn = document.querySelector('#local-buttons [data-action="trade"]');
      expect(tradeBtn).toBeNull();
    });

    test('shows buildings modal button when buildable buildings are provided', () => {
      const state = {
        ...baseLocationState,
        playerState: { dockedAt: null, landedOn: 10 },
        objects: [{ id: 10, type: 'Planet', name: 'New Terra', capabilities: { market: false } }]
      };
      const buildableBuildings = [{ type: 'Mine' }, { type: 'Warehouse' }];
      navigationHandlers.updateAvailableActions(state, buildableBuildings);
      const buildingsButton = document.querySelector('#local-buttons [data-action="buildings"]');
      expect(buildingsButton).not.toBeNull();
      expect(buildingsButton.textContent).toBe('Buildings');
      buildingsButton.click();
      expect(mockContext.openBuildingsModal).toHaveBeenCalledWith(state.objects[0], buildableBuildings);
    });

    test('clears previous buttons before rendering new ones', () => {
      navigationHandlers.updateAvailableActions(baseLocationState);
      navigationHandlers.updateAvailableActions(baseLocationState);
      const buttons = document.querySelectorAll('#jump-buttons .action-btn');
      expect(buttons.length).toBe(2); // not 4
    });
  });

  describe('executeInputCommand', () => {
    beforeEach(() => {
      // Reset command parser to a real-like implementation
      mockContext.commandParser.normalizeCommandText.mockImplementation(
        text => (text || '').trim().toLowerCase().replace(/\s+/g, ' ')
      );
    });

    test('returns early for empty command', async () => {
      mockContext.commandParser.normalizeCommandText.mockReturnValue('');
      await navigationHandlers.executeInputCommand('   ');
      expect(mockContext.addMessage).not.toHaveBeenCalled();
    });

    test('calls offerRouteAndJump for numeric commands', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(5);
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke.mockResolvedValueOnce([{ id: 1 }, { id: 5 }]);
      mockApi.invoke.mockResolvedValueOnce({ success: false, reason: 'No path' });

      await navigationHandlers.executeInputCommand('5');
      expect(mockApi.invoke).toHaveBeenCalledWith('get-all-systems');
    });

    test('shows unknown command for unmatched input', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.applyAlias.mockReturnValue('florp');
      await navigationHandlers.executeInputCommand('florp');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.unknown', { command: 'florp' });
    });

    test('calls executeLocalActionShortcut for dock command', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.applyAlias.mockReturnValue('dock');
      await navigationHandlers.executeInputCommand('d');
      // No dock buttons exist → shows no_action_available
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.no_action_available', { action: 'dock' });
    });

    test('calls executeLocalActionShortcut for land command', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.applyAlias.mockReturnValue('land');
      await navigationHandlers.executeInputCommand('l');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.no_action_available', { action: 'land' });
    });

    test('calls executeLocalActionShortcut for build command', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.applyAlias.mockReturnValue('build');
      await navigationHandlers.executeInputCommand('b');
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:commands.no_action_available', { action: 'buildings' });
    });

    test('clicks exact-matching button', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.normalizeCommandText
        .mockImplementation(text => (text || '').trim().toLowerCase().replace(/\s+/g, ' '));
      mockContext.commandParser.applyAlias.mockImplementation(cmd => cmd);

      const btn = document.getElementById('save-game-btn');
      const clickSpy = jest.fn();
      btn.addEventListener('click', clickSpy);

      await navigationHandlers.executeInputCommand('save game');
      expect(clickSpy).toHaveBeenCalled();
    });

    test('clicks unique first-word matching button', async () => {
      mockContext.commandParser.parseNumericSystemId.mockReturnValue(null);
      mockContext.commandParser.parseJumpSystemId.mockReturnValue(null);
      mockContext.commandParser.applyAlias.mockImplementation(cmd => cmd);
      mockContext.commandParser.resolveUniqueFirstWord.mockReturnValue('trade goods');

      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = 'Trade Goods';
      const clickSpy = jest.fn();
      btn.addEventListener('click', clickSpy);
      document.getElementById('local-buttons').appendChild(btn);

      await navigationHandlers.executeInputCommand('trade');

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('IPC result handlers (registered by init)', () => {
    function getReceiveHandler(channel) {
      const calls = mockApi.receive.mock.calls;
      const call = calls.find(c => c[0] === channel);
      return call ? call[1] : null;
    }

    test('jump-result success calls updateLocationDisplay and updateShipStatus', async () => {
      const handler = getReceiveHandler('jump-result');
      expect(handler).not.toBeNull();

      await handler({ success: true, locationState: { system: { name: 'Beta System' } } });

      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.jump_success', { systemName: 'Beta System' });
      expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
      expect(mockContext.updateShipStatus).toHaveBeenCalled();
    });

    test('jump-result failure shows failed message', async () => {
      const handler = getReceiveHandler('jump-result');
      await handler({ success: false, reason: 'Out of fuel' });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.jump_failed', { reason: 'Out of fuel' });
    });

    test('jump-result re-enables buttons', async () => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.disabled = true;
      document.getElementById('jump-buttons').appendChild(btn);

      const handler = getReceiveHandler('jump-result');
      await handler({ success: true, locationState: { system: { name: 'X' } } });
      expect(btn.disabled).toBe(false);
    });

    test('dock-result success calls updateLocationDisplay', async () => {
      const handler = getReceiveHandler('dock-result');
      await handler({ success: true, dockedObject: { name: 'Station Alpha' } });
      expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
    });

    test('dock-result success shows dock_success message', async () => {
      const handler = getReceiveHandler('dock-result');
      await handler({ success: true, dockedObject: { name: 'Station Alpha' } });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.dock_success', { objectName: 'Station Alpha' });
    });

    test('dock-result failure shows dock_failed message', async () => {
      const handler = getReceiveHandler('dock-result');
      await handler({ success: false, reason: 'Dock full' });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.dock_failed', { reason: 'Dock full' });
    });

    test('land-result success calls displayStellarObjectProperties', async () => {
      const handler = getReceiveHandler('land-result');
      const obj = { name: 'New Terra', description: 'A green world.' };
      await handler({ success: true, landedObject: obj });
      expect(mockContext.displayStellarObjectProperties).toHaveBeenCalledWith(obj);
    });

    test('land-result success shows land_success message', async () => {
      const handler = getReceiveHandler('land-result');
      await handler({ success: true, landedObject: { name: 'New Terra' } });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.land_success', { objectName: 'New Terra' });
    });

    test('land-result failure shows land_failed message', async () => {
      const handler = getReceiveHandler('land-result');
      await handler({ success: false, reason: 'No landing pad' });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.land_failed', { reason: 'No landing pad' });
    });

    test('takeoff-result success shows takeoff_success message', async () => {
      const handler = getReceiveHandler('takeoff-result');
      await handler({ success: true });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.takeoff_success');
    });

    test('takeoff-result failure shows takeoff_failed message', async () => {
      const handler = getReceiveHandler('takeoff-result');
      await handler({ success: false, reason: 'Blocked' });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.takeoff_failed', { reason: 'Blocked' });
    });

    test('build-result success shows build_success message', async () => {
      const handler = getReceiveHandler('build-result');
      await handler({ success: true, buildingType: 'Mine', ticksRemaining: 10 });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.build_success', { buildingType: 'Mine', ticks: 10 });
      expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
    });

    test('build-result failure shows build_failed message', async () => {
      const handler = getReceiveHandler('build-result');
      await handler({ success: false, reason: 'Insufficient metal at this location' });
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:navigation.build_failed', { reason: 'Insufficient metal at this location' });
    });

    test('dock-result success with description shows description message', async () => {
      const handler = getReceiveHandler('dock-result');
      await handler({ success: true, dockedObject: { name: 'Station Alpha', description: 'A busy space station.' } });
      expect(mockContext.addMessage).toHaveBeenCalledWith('A busy space station.');
    });

    test('jump-result failure shows route cancelled message when confirm is denied', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      const handler = getReceiveHandler('jump-result');

      await handler({ success: false, reason: 'Denied' });

      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('executeJumpSequence', () => {
    test('completes a multi-hop route successfully', async () => {
      // Each hop calls _api.receive('jump-result', cb) then _api.send('jump-to-system', id)
      // Wire mockApi.send to resolve the most recently registered jump-result handler
      let lastJumpResultHandler = null;
      mockApi.receive.mockImplementation((channel, handler) => {
        if (channel === 'jump-result') {
          lastJumpResultHandler = handler;
        }
      });
      mockApi.send.mockImplementation((channel, _data) => {
        if (channel === 'jump-to-system' && lastJumpResultHandler) {
          const h = lastJumpResultHandler;
          lastJumpResultHandler = null;
          Promise.resolve().then(() => h({ success: true }));
        }
      });

      navigationHandlers.init(mockContext);

      const route = [1, 2, 3];
      await navigationHandlers.executeJumpSequence(route);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        'message:jump_planner.sequence_complete',
        { destinationId: 3 }
      );
      expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
    });

    test('stops and shows error when a hop fails', async () => {
      let lastJumpResultHandler = null;
      mockApi.receive.mockImplementation((channel, handler) => {
        if (channel === 'jump-result') {
          lastJumpResultHandler = handler;
        }
      });
      mockApi.send.mockImplementation((channel, _data) => {
        if (channel === 'jump-to-system' && lastJumpResultHandler) {
          const h = lastJumpResultHandler;
          lastJumpResultHandler = null;
          Promise.resolve().then(() => h({ success: false, reason: 'Blocked' }));
        }
      });

      navigationHandlers.init(mockContext);

      const route = [1, 2, 3];
      await navigationHandlers.executeJumpSequence(route);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        'message:jump_planner.sequence_failed',
        { systemId: 2, reason: 'Blocked' }
      );
    });
  });
});

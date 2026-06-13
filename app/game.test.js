/**
 * Tests for game.js coordinator
 * Tests the DOMContentLoaded initialization and core coordinator functions
 */

const gameHelpers = require('./gameHelpers');

function buildFullDom() {
  document.body.innerHTML = `
    <div id="game-console"></div>
    <div id="location-status"></div>
    <div id="ship-status"></div>
    <img id="location-image" src="" alt="System View" />
    <div id="no-image-placeholder">No System Image Available</div>
    <input id="game-input" type="text" />
    <div id="jump-buttons"></div>
    <div id="local-buttons"></div>
    <button id="jump-planner-btn">Jump Planner</button>
    <button id="universe-map-btn">Universe Map</button>
    <button id="save-game-btn">Save</button>
    <button id="load-game-btn">Load</button>
    <button id="player-status-btn">Player Status</button>
    <button id="game-settings-btn">Settings</button>
    <div id="game-modal" class="modal">
      <div class="modal-content">
        <h2 id="modal-title"></h2>
        <button id="modal-close-btn">&times;</button>
        <div id="modal-body"></div>
      </div>
    </div>
  `;
}

const LOCATION_STATUS_HTML = `
  <p>System: <span id="system-name"></span></p>
  <p>Objects: <span id="objects-list"></span></p>
  <p>Total Population: <span id="total-population"></span></p>
  <p id="current-location-status" class="hidden">
    <span id="location-type"></span>: <span id="location-name"></span>
    Owner: <span id="location-owner"></span>
    <span id="location-population" class="hidden">
      Population: <span id="location-population-current"></span> / <span id="location-population-limit"></span>
    </span>
  </p>
`;

const SHIP_STATUS_HTML = `
  <p>Ship: <span id="ship-type"></span></p>
  <p id="ship-status-text"></p>
  <p>Clock: <span id="ship-clock"></span></p>
  <p>HP: <span id="ship-hp"></span>/<span id="ship-max-hp"></span></p>
  <p>Cargo: <span id="ship-cargo"></span>/<span id="ship-max-cargo"></span></p>
  <p>Shields: <span id="ship-shields"></span>/<span id="ship-max-shields"></span></p>
  <p>Energy: <span id="ship-energy"></span>/<span id="ship-max-energy"></span></p>
`;

const STELLAR_PROPS_HTML = `
  <div class="stellar-properties">
    <span class="obj-name"></span>
    <span class="obj-type"></span>
    <span class="obj-class"></span>
    <span class="obj-owner"></span>
    <span class="obj-value"></span>
    <div class="population-section">
      <span class="obj-population"></span>
      <span class="obj-population-limit"></span>
      <span class="obj-population-percent"></span>
      <span class="obj-growth-rate"></span>
    </div>
    <div class="buildings-section">
      <span class="obj-building-limit"></span>
      <span class="obj-building-credits"></span>
      <span class="obj-buildings"></span>
      <div class="construction-list"><span class="obj-construction"></span></div>
    </div>
    <span class="obj-capabilities"></span>
    <div class="fighters-section"><span class="obj-fighters"></span></div>
    <span class="obj-prod-metal"></span>
    <span class="obj-prod-food"></span>
    <span class="obj-prod-chemicals"></span>
    <span class="obj-prod-energy"></span>
    <div class="market-section"><span class="obj-market"></span></div>
  </div>
`;

function createMockApi() {
  return {
    send: jest.fn(),
    invoke: jest.fn().mockResolvedValue(null),
    receive: jest.fn(),
    getLocationState: jest.fn().mockResolvedValue(null),
    getGameSettings: jest.fn().mockResolvedValue({ initial_ship: 'Cargo Hauler' }),
    getShipData: jest.fn().mockResolvedValue({
      'Cargo Hauler': { energy: 100, hitPoints: 50, cargoCapacity: 100, shields: 25 }
    }),
    getUniverseState: jest.fn().mockResolvedValue(null),
    getGameData: jest.fn().mockResolvedValue(null)
  };
}

function createMockLocationState(overrides = {}) {
  return {
    system: {
      id: 1,
      name: 'Alpha System',
      connections: {},
      image: 'data/images/space.jpg'
    },
    objects: [],
    playerState: {
      name: 'TestCaptain',
      dockedAt: null,
      landedOn: null,
      shipEnergy: 80,
      shipMaxEnergy: 100,
      ticks: 42,
      cargo: {}
    },
    ...overrides
  };
}

async function loadGameJs() {
  jest.resetModules();
  buildFullDom();
  if (!window.api) {
    window.api = createMockApi();
  }
  window.commandParser = { parse: jest.fn() };
  window.gameHelpers = {
    calculateCargoMass: jest.fn().mockReturnValue(0),
    loadTemplate: gameHelpers.loadTemplate,
    replaceMessageVariables: jest.fn((msg, vars) => {
      return msg.replace(/\{(\w+)\}/g, (match, key) =>
        vars[key] !== undefined ? String(vars[key]) : match
      );
    })
  };
  window.navigationHandlers = {
    init: jest.fn(),
    updateAvailableActions: jest.fn(),
    executeInputCommand: jest.fn().mockResolvedValue(undefined),
    executeJumpSequence: jest.fn().mockResolvedValue(undefined)
  };
  window.modalManager = {
    init: jest.fn(),
    openPlayerStatusModal: jest.fn(),
    openUniverseMapModal: jest.fn(),
    openJumpPlanner: jest.fn(),
    openTradeModal: jest.fn(),
    openBuildingsModal: jest.fn(),
    closeModal: jest.fn()
  };

  jest.isolateModules(() => {
    require('./game.js');
  });

  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('location-status')) {
      return Promise.resolve({ ok: true, text: async () => LOCATION_STATUS_HTML });
    }
    if (url.includes('ship-status')) {
      return Promise.resolve({ ok: true, text: async () => SHIP_STATUS_HTML });
    }
    if (url.includes('stellar-object-properties')) {
      return Promise.resolve({ ok: true, text: async () => STELLAR_PROPS_HTML });
    }
    return Promise.resolve({ ok: true, text: async () => '<div></div>' });
  });

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe('game.js coordinator', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.api;
    delete window.commandParser;
    delete window.gameHelpers;
    delete window.navigationHandlers;
    delete window.modalManager;
  });

  describe('DOMContentLoaded initialization', () => {
    test('calls navigationHandlers.init with context', async () => {
      await loadGameJs();
      expect(window.navigationHandlers.init).toHaveBeenCalledTimes(1);
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      expect(typeof ctx.addMessage).toBe('function');
      expect(typeof ctx.resolveMessageText).toBe('function');
      expect(typeof ctx.updateLocationDisplay).toBe('function');
      expect(typeof ctx.updateShipStatus).toBe('function');
      expect(typeof ctx.closeModal).toBe('function');
      expect(typeof ctx.openTradeModal).toBe('function');
      expect(typeof ctx.openBuildingsModal).toBe('function');
    });

    test('calls modalManager.init with context', async () => {
      await loadGameJs();
      expect(window.modalManager.init).toHaveBeenCalledTimes(1);
      const ctx = window.modalManager.init.mock.calls[0][0];
      expect(typeof ctx.addMessage).toBe('function');
      expect(typeof ctx.resolveMessageText).toBe('function');
      expect(typeof ctx.executeJumpSequence).toBe('function');
    });

    test('context.closeModal delegates to modalManager.closeModal', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.closeModal();
      expect(window.modalManager.closeModal).toHaveBeenCalled();
    });

    test('context.openTradeModal delegates to modalManager.openTradeModal', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const mockObj = { id: 1, name: 'Test Station' };
      ctx.openTradeModal(mockObj);
      expect(window.modalManager.openTradeModal).toHaveBeenCalledWith(mockObj);
    });

    test('context.openBuildingsModal delegates to modalManager.openBuildingsModal', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const mockObj = { id: 1, name: 'Test Planet' };
      const buildableBuildings = [{ type: 'Mine' }];
      ctx.openBuildingsModal(mockObj, buildableBuildings);
      expect(window.modalManager.openBuildingsModal).toHaveBeenCalledWith(mockObj, buildableBuildings);
    });

    test('context.executeJumpSequence delegates to navigationHandlers.executeJumpSequence', async () => {
      await loadGameJs();
      const ctx = window.modalManager.init.mock.calls[0][0];
      const route = [1, 2, 3];
      ctx.executeJumpSequence(route);
      expect(window.navigationHandlers.executeJumpSequence).toHaveBeenCalledWith(route);
    });
  });

  describe('addMessage function', () => {
    test('appends plain text to console div', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('Hello World');
      const consoleDiv = document.getElementById('game-console');
      expect(consoleDiv.textContent).toContain('Hello World');
    });

    test('appends multiple lines separately', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('Line 1\nLine 2');
      const consoleDiv = document.getElementById('game-console');
      const paragraphs = consoleDiv.querySelectorAll('p');
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    });

    test('appends non-breaking space for empty string', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('');
      const consoleDiv = document.getElementById('game-console');
      const p = consoleDiv.querySelector('p');
      expect(p.textContent).toBe('\u00A0');
    });

    test('loads message group for messages: prefix', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({
        playerState: { name: 'TestCaptain', corporation: { name: 'MyCorp' } }
      });
      window.api.invoke.mockResolvedValue({ title: 'Welcome', intro: 'Hello {playerName}' });

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('messages:game_start');

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'game_start');
    });

    test('loads single message for message: prefix with variable replacement', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue('Jump to System {systemId} complete.');

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('message:navigation.jump_success', { systemId: 5 });

      await new Promise(resolve => setTimeout(resolve, 50));
      const consoleDiv = document.getElementById('game-console');
      expect(consoleDiv.textContent).toContain('Jump to System 5 complete.');
    });

    test('handles IPC error gracefully for message: prefix', async () => {
      await loadGameJs();
      // Override invoke to reject AFTER init has completed
      window.api.invoke.mockRejectedValue(new Error('IPC error'));
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      expect(() => ctx.addMessage('message:navigation.test')).not.toThrow();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('handles null IPC return for message: prefix', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue(null);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      ctx.addMessage('message:navigation.test');

      await new Promise(resolve => setTimeout(resolve, 50));
      const consoleDiv = document.getElementById('game-console');
      expect(consoleDiv.children.length).toBe(0);
    });

    test('handles error for messages: group loading', async () => {
      await loadGameJs();
      // Override invoke to reject AFTER init has completed
      window.api.invoke.mockRejectedValue(new Error('IPC fail'));
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      expect(() => ctx.addMessage('messages:game_start')).not.toThrow();
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('resolveMessageText function', () => {
    test('resolves message key to text with variable replacement', async () => {
      window.api = createMockApi();
      window.api.invoke.mockResolvedValue('Jump to System {systemId}...');

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const result = await ctx.resolveMessageText('navigation.jumping', { systemId: 3 });
      expect(result).toBe('Jump to System 3...');
    });

    test('returns fallback when IPC returns non-string', async () => {
      window.api = createMockApi();
      window.api.invoke.mockResolvedValue({ nested: 'object' });

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const result = await ctx.resolveMessageText('navigation.test', {}, 'fallback text');
      expect(result).toBe('fallback text');
    });

    test('returns fallback on error', async () => {
      window.api = createMockApi();
      window.api.invoke.mockRejectedValue(new Error('IPC error'));

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const result = await ctx.resolveMessageText('navigation.test', {}, 'error fallback');
      expect(result).toBe('error fallback');
    });

    test('returns empty string as default fallback', async () => {
      window.api = createMockApi();
      window.api.invoke.mockResolvedValue(null);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      const result = await ctx.resolveMessageText('navigation.test');
      expect(result).toBe('');
    });
  });

  describe('updateLocationDisplay function', () => {
    test('returns early when locationState is null', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(null);

      await loadGameJs();
      const locationStatus = document.getElementById('location-status');
      const initialContent = locationStatus.innerHTML;

      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();
      expect(locationStatus.innerHTML).toBe(initialContent);
    });

    test('displays system name and updates navigation', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      expect(document.getElementById('system-name').textContent).toBe('Alpha System');
      expect(window.navigationHandlers.updateAvailableActions).toHaveBeenCalledWith(locationState, []);
    });

    test('shows system image when in space', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      const locationImage = document.getElementById('location-image');
      expect(locationImage.src).toContain('space.jpg');
      expect(locationImage.style.display).toBe('block');
    });

    test('adjusts path for data/ prefix images', async () => {
      const locationState = createMockLocationState({
        system: { id: 1, name: 'Test', connections: {}, image: 'data/images/space.jpg' }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      const locationImage = document.getElementById('location-image');
      expect(locationImage.src).toContain('data/images/space.jpg');
    });

    test('shows landedImage when docked at station', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 100, type: 'Space Station', name: 'Port Alpha', className: 'Commercial', landedImage: 'images/station.jpg' }],
        playerState: { dockedAt: 100, landedOn: null, shipEnergy: 80, shipMaxEnergy: 100, ticks: 0, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      expect(document.getElementById('location-image').src).toContain('station.jpg');
    });

    test('shows landedImage when landed on planet', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 200, type: 'Planet', name: 'Terra Nova', className: 'EarthLike', landedImage: 'images/planet.jpg', population: { current: 1000, limit: 2000 }, owner: 'Republic' }],
        playerState: { dockedAt: null, landedOn: 200, shipEnergy: 80, shipMaxEnergy: 100, ticks: 0, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      expect(document.getElementById('location-image').src).toContain('planet.jpg');
    });

    test('hides image when no image is available', async () => {
      const locationState = createMockLocationState({
        system: { id: 1, name: 'Dark System', connections: {}, image: null }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      const locationImage = document.getElementById('location-image');
      expect(locationImage.style.display).toBe('none');
      expect(document.getElementById('no-image-placeholder').style.display).toBe('block');
    });

    test('shows docked status in location panel', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 100, type: 'Space Station', name: 'Port Alpha', className: 'Commercial', landedImage: '', owner: 'Trade Guild' }],
        playerState: { dockedAt: 100, landedOn: null, shipEnergy: 80, shipMaxEnergy: 100, ticks: 0, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      expect(document.getElementById('location-type').textContent).toBe('Docked at');
      expect(document.getElementById('location-name').textContent).toBe('Port Alpha');
    });

    test('shows population when object has population data', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 200, type: 'Planet', name: 'Terra Nova', className: 'EarthLike', landedImage: '', owner: 'Republic', population: { current: 5000, limit: 10000 } }],
        playerState: { dockedAt: null, landedOn: 200, shipEnergy: 80, shipMaxEnergy: 100, ticks: 0, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();

      expect(document.getElementById('location-population-current').textContent).toBe('5,000');
    });

    test('falls back gracefully on template fetch error', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);

      await loadGameJs();
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateLocationDisplay();
    });
  });

  describe('updateShipStatus function', () => {
    test('displays ship type and status', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();

      expect(document.getElementById('ship-type').textContent).toBe('Cargo Hauler');
    });

    test('returns early when locationState is null', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(null);

      await loadGameJs();
      const shipStatus = document.getElementById('ship-status');
      const initialContent = shipStatus.innerHTML;

      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();
      expect(shipStatus.innerHTML).toBe(initialContent);
    });

    test('shows docked status in ship panel', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 100, name: 'Port Alpha', type: 'Space Station' }],
        playerState: { dockedAt: 100, landedOn: null, shipEnergy: 80, shipMaxEnergy: 100, ticks: 10, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();

      expect(document.getElementById('ship-status-text').textContent).toContain('Docked at');
    });

    test('shows landed status in ship panel', async () => {
      const locationState = createMockLocationState({
        objects: [{ id: 200, name: 'Terra Nova', type: 'Planet' }],
        playerState: { dockedAt: null, landedOn: 200, shipEnergy: 80, shipMaxEnergy: 100, ticks: 10, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();

      expect(document.getElementById('ship-status-text').textContent).toContain('Landed on');
    });

    test('shows in-space status when not docked or landed', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();

      expect(document.getElementById('ship-status-text').textContent).toContain('In Space');
    });

    test('uses ship energy from playerState', async () => {
      const locationState = createMockLocationState({
        playerState: { dockedAt: null, landedOn: null, shipEnergy: 55, shipMaxEnergy: 100, ticks: 0, cargo: {} }
      });
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();

      expect(document.getElementById('ship-energy').textContent).toBe('55');
    });

    test('falls back gracefully on template fetch error', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue({});

      await loadGameJs();
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.updateShipStatus();
    });
  });

  describe('displayStellarObjectProperties function', () => {
    function createMockStellarObject(overrides = {}) {
      return {
        name: 'Test Planet',
        type: 'Planet',
        className: 'EarthLike',
        owner: 'Republic',
        value: 50000,
        population: { current: 5000, limit: 10000, growthRate: 0.01 },
        capabilities: { market: true, buildings: true, shipyard: false, shields: false, cannons: false, fighters: false, resistance: false },
        buildings: { Mine: { count: 2 } },
        buildingsUnderConstruction: [],
        buildingLimit: 10,
        buildingCredits: 1000,
        productivityModifiers: { metal: 5, food: 7, chemicals: 3, energy: 4 },
        marketState: { inventory: { Iron: { quantity: 100, price: 50 } } },
        fighters: 0,
        ...overrides
      };
    }

    test('populates stellar object properties template', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject());

      const nameEl = document.getElementById('game-console').querySelector('.obj-name');
      expect(nameEl.textContent).toBe('Test Planet');
    });

    test('hides population section when no population', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject({ population: null }));

      const popSection = document.getElementById('game-console').querySelector('.population-section');
      expect(popSection.style.display).toBe('none');
    });

    test('hides buildings section when buildings not enabled', async () => {
      await loadGameJs();
      const obj = createMockStellarObject({
        capabilities: { market: true, buildings: false, shipyard: false, shields: false, cannons: false, fighters: false, resistance: false }
      });
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(obj);

      const buildSection = document.getElementById('game-console').querySelector('.buildings-section');
      expect(buildSection.style.display).toBe('none');
    });

    test('shows fighters when capability enabled and count > 0', async () => {
      await loadGameJs();
      const obj = createMockStellarObject({
        capabilities: { market: false, buildings: false, shipyard: false, shields: false, cannons: false, fighters: true, resistance: false },
        fighters: 5
      });
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(obj);

      expect(document.getElementById('game-console').querySelector('.obj-fighters').textContent).toBe('5');
    });

    test('hides fighters section when no fighters', async () => {
      await loadGameJs();
      const obj = createMockStellarObject({
        capabilities: { market: false, buildings: false, shipyard: false, shields: false, cannons: false, fighters: false, resistance: false }
      });
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(obj);

      expect(document.getElementById('game-console').querySelector('.fighters-section').style.display).toBe('none');
    });

    test('hides market section when no marketState', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject({ marketState: null }));

      expect(document.getElementById('game-console').querySelector('.market-section').style.display).toBe('none');
    });

    test('shows empty market message when inventory is empty', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject({ marketState: { inventory: {} } }));

      expect(document.getElementById('game-console').querySelector('.obj-market').textContent).toBe('Empty');
    });

    test('shows construction list when buildings under construction', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject({ buildingsUnderConstruction: [{ type: 'Mine', ticksRemaining: 5 }] }));

      expect(document.getElementById('game-console').querySelector('.obj-construction').textContent).toContain('Mine');
    });

    test('hides construction list when nothing under construction', async () => {
      await loadGameJs();
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject({ buildingsUnderConstruction: [] }));

      expect(document.getElementById('game-console').querySelector('.construction-list').style.display).toBe('none');
    });

    test('handles fetch error gracefully', async () => {
      await loadGameJs();
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(createMockStellarObject());
    });

    test('lists all capabilities', async () => {
      await loadGameJs();
      const obj = createMockStellarObject({
        capabilities: { market: true, buildings: true, shipyard: true, shields: true, cannons: true, fighters: false, resistance: true },
        fighters: 0
      });
      const ctx = window.navigationHandlers.init.mock.calls[0][0];
      await ctx.displayStellarObjectProperties(obj);

      const capEl = document.getElementById('game-console').querySelector('.obj-capabilities');
      expect(capEl.textContent).toContain('Market');
      expect(capEl.textContent).toContain('Shipyard');
      expect(capEl.textContent).toContain('Shields');
    });
  });

  describe('save/load button wiring', () => {
    test('save button sends save-game IPC message', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(createMockLocationState());
      window.api.invoke.mockResolvedValue('Saving...');

      await loadGameJs();
      document.getElementById('save-game-btn').click();
      expect(window.api.send).toHaveBeenCalledWith('save-game');
    });

    test('playerStatusBtn opens player status modal', async () => {
      await loadGameJs();
      document.getElementById('player-status-btn').click();
      expect(window.modalManager.openPlayerStatusModal).toHaveBeenCalled();
    });

    test('universeMapBtn opens universe map modal', async () => {
      await loadGameJs();
      document.getElementById('universe-map-btn').click();
      expect(window.modalManager.openUniverseMapModal).toHaveBeenCalled();
    });

    test('jumpPlannerBtn opens jump planner', async () => {
      await loadGameJs();
      document.getElementById('jump-planner-btn').click();
      expect(window.modalManager.openJumpPlanner).toHaveBeenCalled();
    });

    test('game-settings button triggers settings.not_implemented message', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue('Settings not yet implemented.');

      await loadGameJs();
      document.getElementById('game-settings-btn').click();

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'settings.not_implemented');
    });
  });

  describe('IPC receive handlers', () => {
    test('save-game-result success triggers save_success message', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue('Game saved to {savePath}');

      await loadGameJs();

      const saveResultHandler = window.api.receive.mock.calls.find(c => c[0] === 'save-game-result')?.[1];
      expect(saveResultHandler).toBeDefined();

      saveResultHandler({ success: true, savePath: '/saves/game.json' });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'save_load.save_success');
    });

    test('save-game-result failure triggers save_failed message', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue('Failed to save: {reason}');

      await loadGameJs();
      const saveResultHandler = window.api.receive.mock.calls.find(c => c[0] === 'save-game-result')?.[1];
      saveResultHandler({ success: false, reason: 'disk full' });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'save_load.save_failed');
    });

    test('load-game-result success updates display', async () => {
      const locationState = createMockLocationState();
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue(locationState);
      window.api.invoke.mockResolvedValue('Game loaded successfully.');

      await loadGameJs();
      const loadResultHandler = window.api.receive.mock.calls.find(c => c[0] === 'load-game-result')?.[1];
      expect(loadResultHandler).toBeDefined();

      loadResultHandler({ success: true });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.navigationHandlers.updateAvailableActions).toHaveBeenCalled();
    });

    test('load-game-result failure triggers load_failed message', async () => {
      window.api = createMockApi();
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });
      window.api.invoke.mockResolvedValue('Failed to load: {reason}');

      await loadGameJs();
      const loadResultHandler = window.api.receive.mock.calls.find(c => c[0] === 'load-game-result')?.[1];
      loadResultHandler({ success: false, reason: 'file not found' });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'save_load.load_failed');
    });

    test('save-files-list with empty array sends no-saves message', async () => {
      await loadGameJs();
      const saveFilesHandler = window.api.receive.mock.calls.find(c => c[0] === 'save-files-list')?.[1];
      expect(saveFilesHandler).toBeDefined();

      saveFilesHandler([]);
      expect(document.getElementById('game-console').textContent).toContain('No save files found');
    });

    test('save-files-list loads most recent save file', async () => {
      await loadGameJs();
      const saveFilesHandler = window.api.receive.mock.calls.find(c => c[0] === 'save-files-list')?.[1];
      saveFilesHandler(['/saves/game1.json', '/saves/game2.json']);
      expect(window.api.send).toHaveBeenCalledWith('load-game', '/saves/game2.json');
    });
  });

  describe('command input wiring', () => {
    test('Enter key on input calls executeInputCommand', async () => {
      await loadGameJs();

      const input = document.getElementById('game-input');
      input.value = 'help';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(window.navigationHandlers.executeInputCommand).toHaveBeenCalledWith('help');
    });

    test('non-Enter key does not call executeInputCommand', async () => {
      await loadGameJs();

      const input = document.getElementById('game-input');
      input.value = 'hel';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.navigationHandlers.executeInputCommand).not.toHaveBeenCalled();
    });

    test('empty input does not call executeInputCommand', async () => {
      await loadGameJs();

      const input = document.getElementById('game-input');
      input.value = '   ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.navigationHandlers.executeInputCommand).not.toHaveBeenCalled();
    });

    test('input is cleared after command submitted', async () => {
      await loadGameJs();

      const input = document.getElementById('game-input');
      input.value = 'help';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(input.value).toBe('');
    });
  });

  describe('load game button', () => {
    test('opens file dialog and sends load-game on success', async () => {
      window.api = createMockApi();
      window.api.invoke.mockImplementation((channel) => {
        if (channel === 'open-load-game-dialog') {
          return Promise.resolve({ success: true, filePath: '/saves/game.json' });
        }
        return Promise.resolve('Loading game...');
      });
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });

      await loadGameJs();
      document.getElementById('load-game-btn').click();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(window.api.send).toHaveBeenCalledWith('load-game', '/saves/game.json');
    });

    test('handles dialog error gracefully', async () => {
      window.api = createMockApi();
      window.api.invoke.mockImplementation((channel) => {
        if (channel === 'open-load-game-dialog') {
          return Promise.reject(new Error('dialog error'));
        }
        return Promise.resolve('Error opening dialog.');
      });
      window.api.getLocationState.mockResolvedValue({ playerState: { name: 'TestCaptain' } });

      await loadGameJs();
      document.getElementById('load-game-btn').click();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'save_load.load_dialog_error');
    });
  });
});

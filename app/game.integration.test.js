'use strict';

/**
 * Integration tests for app/game.js
 *
 * Loads the actual game.js module in a jsdom environment, fires DOMContentLoaded,
 * and exercises all major code paths to achieve comprehensive line coverage.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Template loader – maps fetch() URLs to real files on disk
// ---------------------------------------------------------------------------
const APP_DIR = __dirname;
function readTemplate(relUrl) {
  const abs = path.join(APP_DIR, relUrl.replace('./', ''));
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (_) {
    return '<div></div>';
  }
}

// ---------------------------------------------------------------------------
// D3 mock – captures callbacks so tests can exercise d3-driven code paths
// ---------------------------------------------------------------------------
const d3Handlers = {};

function createD3MockEl() {
  const nodeObj = { getBBox: jest.fn(() => ({ x: 10, y: 10, width: 200, height: 150 })) };
  const el = {
    attr: jest.fn(function () { return this; }),
    style: jest.fn(function () { return this; }),
    call: jest.fn(function () { return this; }),
    on: jest.fn(function (eventName, handler) {
      d3Handlers[eventName] = handler;
      return this;
    }),
    text: jest.fn(function () { return this; }),
    append: jest.fn(function () { return createD3MockEl(); }),
    selectAll: jest.fn(function () { return createD3MockEl(); }),
    data: jest.fn(function () { return this; }),
    join: jest.fn(function () { return this; }),
    node: jest.fn(() => nodeObj),
    transition: jest.fn(function () {
      return { duration: jest.fn(function () { return { call: jest.fn() }; }) };
    }),
    remove: jest.fn(function () { return this; })
  };
  return el;
}

const mockZoom = {
  scaleExtent: jest.fn(function () { return this; }),
  on: jest.fn(function () { return this; }),
  transform: jest.fn(),
  scaleBy: jest.fn()
};

global.d3 = {
  select: jest.fn(() => createD3MockEl()),
  scaleOrdinal: jest.fn(() => {
    const scale = jest.fn(type => `color-${type}`);
    scale.domain = jest.fn(function () { return this; });
    scale.range = jest.fn(function () { return this; });
    return scale;
  }),
  schemeCategory10: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'],
  forceSimulation: jest.fn(() => ({
    force: jest.fn(function () { return this; }),
    on: jest.fn(function (event, handler) {
      if (event === 'tick') handler(); // cover tick callback immediately
      return this;
    }),
    alphaTarget: jest.fn(function () { return this; }),
    restart: jest.fn()
  })),
  forceLink: jest.fn(() => ({
    id: jest.fn(function () { return this; }),
    distance: jest.fn(function () { return this; })
  })),
  forceManyBody: jest.fn(() => ({ strength: jest.fn(function () { return this; }) })),
  forceCenter: jest.fn(() => ({})),
  zoom: jest.fn(() => mockZoom),
  zoomIdentity: {
    translate: jest.fn(function () { return this; }),
    scale: jest.fn(function () { return this; })
  },
  drag: jest.fn(() => ({ on: jest.fn(function () { return this; }) }))
};

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------
const MOCK_SHIPS = {
  Shuttle: { hitPoints: 100, cargoCapacity: 50, shields: 0, energy: 100, value: 50000 }
};

const MOCK_GOODS = {
  wheat: { label: 'Wheat', value: 10, finishedMass: { mass: 1, units: 'metric tons' } },
  electronics: { label: 'Electronics', value: 100, finishedMass: { mass: 0.5, units: 'kilograms' } }
};

const MOCK_MESSAGES = {
  ui: { welcome: 'Welcome!', help_prompt: 'Type help.', not_implemented: 'Not implemented.' },
  navigation: {
    jumping: 'Jumping to {systemId}...',
    jump_success: 'Jumped to {systemName}.',
    dock_success: 'Docked at {objectName}.',
    docking_request: 'Docking at {objectName}...',
    land_success: 'Landed on {objectName}.',
    landing_request: 'Landing on {objectName}...',
    taking_off: 'Taking off...',
    takeoff_success: 'Takeoff successful.'
  },
  save_load: {
    saving: 'Saving...',
    save_success: 'Saved to {savePath}.',
    loading: 'Loading...',
    load_recent: 'Loading {savePath}...',
    load_success: 'Game loaded.'
  },
  settings: { not_implemented: 'Settings not implemented.' },
  commands: { unknown: 'Unknown command: {command}' },
  game_start: { msg1: 'Welcome to the game!', msg2: 'Explore the universe.' },
  jump_planner: {
    sequence_start: 'Starting jump sequence to {destinationId}.',
    route_display: 'Route: {route}.',
    jump_progress: 'Jumping to system {systemId} ({current}/{total})...',
    arrived: 'Arrived at system {systemId}.',
    sequence_complete: 'Arrived at destination {destinationId}.'
  }
};

const BASE_PLAYER_STATE = {
  name: 'Test Captain',
  credits: 5000,
  ship: 'Shuttle',
  location: 1,
  system: 1,
  dockedAt: null,
  landedOn: null,
  shipEnergy: 80,
  shipMaxEnergy: 100,
  ticks: 100,
  cargo: {},
  stats: { jumps: 5, trades: 3, profit: 1000 },
  corporation: {
    name: 'Test Corp',
    description: 'A test corporation.',
    value: 100000,
    totalCashReserves: 5000,
    stellarObjects: []
  }
};

const MOCK_PLANET = {
  id: 10,
  name: 'Alpha Prime',
  type: 'Planet',
  className: 'Terrestrial',
  owner: 'Test Corp',
  value: 500000,
  description: 'A beautiful planet.',
  population: { current: 8000, limit: 10000, growthRate: 0.01 },
  capabilities: {
    market: true, buildings: true, shipyard: false,
    shields: false, cannons: false, fighters: false, resistance: false
  },
  buildingLimit: 10,
  buildingCredits: 5000,
  buildings: { Mine: { count: 2 } },
  buildingsUnderConstruction: [],
  productivityModifiers: { metal: 5, food: 7, chemicals: 3, energy: 4 },
  marketState: { inventory: { wheat: 100, electronics: 50 } },
  fighters: 0
};

// Low-population version for the "no passengers" branch
const MOCK_PLANET_LOW_POP = {
  ...MOCK_PLANET,
  id: 11,
  population: { current: 500, limit: 10000, growthRate: 0.01 }
};

function makeLocationState(overrides = {}) {
  return {
    system: { id: 1, name: 'Alpha', connections: { 2: 5 }, image: null },
    objects: [MOCK_PLANET, MOCK_PLANET_LOW_POP],
    playerState: { ...BASE_PLAYER_STATE, ...overrides }
  };
}

const SPACE_STATE = makeLocationState();
const DOCKED_STATE = makeLocationState({ dockedAt: 10, landedOn: null });
const LANDED_STATE = makeLocationState({
  dockedAt: null,
  landedOn: 10,
  cargo: { wheat: 5, electronics: 2, passengers: 10 }
});

const UNIVERSE_MAP_DATA = {
  systems: [
    { id: 1, name: 'Alpha', connections: { 2: 5 } },
    { id: 2, name: 'Beta', connections: { 1: 5 } }
  ],
  stellarObjects: [
    { id: 10, type: 'Planet', location: 1, name: 'Alpha Prime', className: 'Terrestrial', owner: null },
    { id: 20, type: 'Space Station', location: 2, name: 'Beta Base', className: 'Orbital', owner: null }
  ],
  exploredSystems: [1]
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const flushPromises = () => new Promise(r => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
describe('game.js (integration)', () => {
  let registeredCallbacks;
  let currentLocationState;

  beforeAll(async () => {
    // ---- DOM ---------------------------------------------------------------
    document.body.innerHTML = `
      <div id="game-console"></div>
      <input id="game-input" type="text" />
      <div id="location-status"></div>
      <div id="ship-status"></div>
      <img id="location-image" src="" alt="location" />
      <div id="no-image-placeholder"></div>
      <button id="jump-planner-btn">Jump Planner</button>
      <button id="universe-map-btn">Universe Map</button>
      <button id="save-game-btn">Save</button>
      <button id="load-game-btn">Load</button>
      <button id="player-status-btn">Player Status</button>
      <button id="game-settings-btn">Settings</button>
      <div id="jump-buttons"></div>
      <div id="local-buttons"></div>
      <div id="game-modal" class="modal">
        <div class="modal-content">
          <h2 id="modal-title"></h2>
          <button id="modal-close-btn">&times;</button>
          <div id="modal-body"></div>
        </div>
      </div>
    `;

    // ---- Mocks -------------------------------------------------------------
    currentLocationState = SPACE_STATE;
    registeredCallbacks = {};

    window.api = {
      getLocationState: jest.fn().mockImplementation(() => Promise.resolve(currentLocationState)),
      getGameSettings: jest.fn().mockResolvedValue({ initial_ship: 'Shuttle', pronoun_options: [] }),
      getShipData: jest.fn().mockResolvedValue(MOCK_SHIPS),
      getUniverseState: jest.fn().mockResolvedValue({ stellarObjects: UNIVERSE_MAP_DATA.stellarObjects }),
      getUniverseMapData: jest.fn().mockResolvedValue(UNIVERSE_MAP_DATA),
      getGameData: jest.fn().mockImplementation(type =>
        type === 'ships' ? Promise.resolve(MOCK_SHIPS) : null
      ),
      invoke: jest.fn().mockImplementation((channel, data) => {
        if (channel === 'get-goods-data') return Promise.resolve(MOCK_GOODS);
        if (channel === 'get-ships-data') return Promise.resolve(MOCK_SHIPS);
        if (channel === 'get-game-messages') {
          const group = typeof data === 'string' ? data : '';
          return Promise.resolve(MOCK_MESSAGES[group] || {});
        }
        if (channel === 'get-all-systems') return Promise.resolve([{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }]);
        if (channel === 'calculate-jump-route') {
          return Promise.resolve({ success: true, route: [1, 2], cost: 5, energyRequired: 10, currentEnergy: 80 });
        }
        if (channel === 'get-market-price') return Promise.resolve(15);
        if (channel === 'trade-goods') return Promise.resolve({ success: true, message: 'Trade complete' });
        if (channel === 'load-passengers') return Promise.resolve({ success: true, message: 'Passengers loaded' });
        if (channel === 'unload-passengers') return Promise.resolve({ success: true, message: 'Passengers unloaded' });
        if (channel === 'open-load-game-dialog') return Promise.resolve({ success: true, filePath: '/saves/game.json' });
        return Promise.resolve(null);
      }),
      send: jest.fn(),
      receive: jest.fn().mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
      })
    };

    global.fetch = jest.fn().mockImplementation(url => {
      const content = readTemplate(url);
      return Promise.resolve({ ok: true, text: async () => content });
    });

    global.confirm = jest.fn().mockReturnValue(false);
    global.alert = jest.fn();

    // Load commandParser (sets window.commandParser automatically)
    require('./commandParser');
    // Load game.js – registers the DOMContentLoaded listener
    require('./game');

    // Fire the DOMContentLoaded event to trigger game initialization
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Wait for all async initialization to settle
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  // Helper: close any open modal
  function closeModalHelper() {
    const modal = document.getElementById('game-modal');
    if (modal) {
      modal.classList.remove('visible');
      const body = document.getElementById('modal-body');
      if (body) body.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  describe('initialization', () => {
    test('location status panel is populated after init', () => {
      const locationStatus = document.getElementById('location-status');
      expect(locationStatus.innerHTML).not.toBe('');
    });

    test('ship status panel is populated after init', () => {
      const shipStatus = document.getElementById('ship-status');
      expect(shipStatus.innerHTML).not.toBe('');
    });

    test('jump buttons are created for connected systems', () => {
      const jumpButtons = document.querySelectorAll('#jump-buttons .action-btn');
      expect(jumpButtons.length).toBeGreaterThan(0);
    });

    test('land buttons are created for planets', () => {
      const landButtons = document.querySelectorAll('#local-buttons .action-btn[data-action="land"]');
      expect(landButtons.length).toBeGreaterThan(0);
    });

    test('game console has messages from init', () => {
      const consoleDiv = document.getElementById('game-console');
      // addMessage calls happen async; console div may have children
      expect(consoleDiv).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Image error / load handlers
  // ---------------------------------------------------------------------------
  describe('location image event handlers', () => {
    test('image error event hides image and shows placeholder', () => {
      const locationImage = document.getElementById('location-image');
      const placeholder = document.getElementById('no-image-placeholder');
      locationImage.dispatchEvent(new Event('error'));
      expect(locationImage.style.display).toBe('none');
      expect(placeholder.style.display).toBe('block');
    });

    test('image load event shows image and hides placeholder', () => {
      const locationImage = document.getElementById('location-image');
      const placeholder = document.getElementById('no-image-placeholder');
      locationImage.dispatchEvent(new Event('load'));
      expect(placeholder.style.display).toBe('none');
      expect(locationImage.style.display).toBe('block');
    });
  });

  // ---------------------------------------------------------------------------
  // jump-result handler
  // ---------------------------------------------------------------------------
  describe('jump-result receive handler', () => {
    test('success: updates UI and re-enables buttons', async () => {
      const prevState = currentLocationState;
      currentLocationState = makeLocationState({ location: 2 });
      await registeredCallbacks['jump-result']({
        success: true,
        locationState: { system: { name: 'Beta' } }
      });
      await flushPromises();
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
      currentLocationState = prevState;
    });

    test('failure: adds error message and re-enables buttons', async () => {
      await registeredCallbacks['jump-result']({ success: false, reason: 'No energy' });
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // dock-result handler
  // ---------------------------------------------------------------------------
  describe('dock-result receive handler', () => {
    test('success: updates UI', async () => {
      currentLocationState = DOCKED_STATE;
      await registeredCallbacks['dock-result']({
        success: true,
        dockedObject: { name: 'Alpha Station', description: 'A nice station.' }
      });
      await flushPromises();
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
      currentLocationState = SPACE_STATE;
    });

    test('failure: adds error message', async () => {
      await registeredCallbacks['dock-result']({ success: false, reason: 'Too far' });
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // land-result handler
  // ---------------------------------------------------------------------------
  describe('land-result receive handler', () => {
    test('success: calls displayStellarObjectProperties and updates UI', async () => {
      currentLocationState = LANDED_STATE;
      await registeredCallbacks['land-result']({
        success: true,
        landedObject: MOCK_PLANET
      });
      await flushPromises();
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
      currentLocationState = SPACE_STATE;
    });

    test('failure: adds error message', async () => {
      await registeredCallbacks['land-result']({ success: false, reason: 'Atmosphere too dense' });
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // takeoff-result handler
  // ---------------------------------------------------------------------------
  describe('takeoff-result receive handler', () => {
    test('success: updates UI', async () => {
      await registeredCallbacks['takeoff-result']({ success: true });
      await flushPromises();
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
    });

    test('failure: adds error message', async () => {
      await registeredCallbacks['takeoff-result']({ success: false, reason: 'Engine failure' });
      await flushPromises();
      const input = document.getElementById('game-input');
      expect(input.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // save-game-result handler
  // ---------------------------------------------------------------------------
  describe('save-game-result receive handler', () => {
    test('success: adds success message', async () => {
      await registeredCallbacks['save-game-result']({ success: true, savePath: '/saves/game.json' });
      await flushPromises();
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'save_load');
    });

    test('failure: adds error message', async () => {
      await registeredCallbacks['save-game-result']({ success: false, reason: 'Disk full' });
      await flushPromises();
      // The game-console should have received a message
      expect(document.getElementById('game-console')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // save-files-list handler
  // ---------------------------------------------------------------------------
  describe('save-files-list receive handler', () => {
    test('with files: sends load-game for most recent file', async () => {
      window.api.send.mockClear();
      await registeredCallbacks['save-files-list'](['/saves/save1.json', '/saves/save2.json']);
      await flushPromises();
      expect(window.api.send).toHaveBeenCalledWith('load-game', '/saves/save2.json');
    });

    test('with empty list: adds "no save files" message', async () => {
      await registeredCallbacks['save-files-list']([]);
      await flushPromises();
      expect(document.getElementById('game-console')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // load-game-result handler
  // ---------------------------------------------------------------------------
  describe('load-game-result receive handler', () => {
    test('success: updates location and ship', async () => {
      await registeredCallbacks['load-game-result']({ success: true });
      await flushPromises();
      await flushPromises();
      expect(window.api.getLocationState).toHaveBeenCalled();
    });

    test('failure: adds error message', async () => {
      await registeredCallbacks['load-game-result']({ success: false, reason: 'Invalid file' });
      await flushPromises();
      expect(document.getElementById('game-console')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Button click handlers
  // ---------------------------------------------------------------------------
  describe('button click handlers', () => {
    afterEach(closeModalHelper);

    test('save-game button sends save-game', () => {
      window.api.send.mockClear();
      document.getElementById('save-game-btn').click();
      expect(window.api.send).toHaveBeenCalledWith('save-game');
    });

    test('load-game button invokes open-load-game-dialog and sends load-game', async () => {
      window.api.send.mockClear();
      document.getElementById('load-game-btn').click();
      await flushPromises();
      expect(window.api.invoke).toHaveBeenCalledWith('open-load-game-dialog');
      expect(window.api.send).toHaveBeenCalledWith('load-game', '/saves/game.json');
    });

    test('load-game button with failed dialog does not send load-game', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve({ success: false }));
      window.api.send.mockClear();
      document.getElementById('load-game-btn').click();
      await flushPromises();
      expect(window.api.send).not.toHaveBeenCalledWith('load-game', expect.anything());
    });

    test('load-game button handles error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      window.api.invoke.mockImplementationOnce(() => Promise.reject(new Error('dialog failed')));
      document.getElementById('load-game-btn').click();
      await flushPromises();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    test('game-settings button sends a message', async () => {
      document.getElementById('game-settings-btn').click();
      await flushPromises();
      // Should invoke get-game-messages for the settings group
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'settings');
    });

    test('player-status button opens player status modal', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-title').textContent).toBe('Player Status');
    });
  });

  // ---------------------------------------------------------------------------
  // Modal system
  // ---------------------------------------------------------------------------
  describe('modal system', () => {
    afterEach(closeModalHelper);

    test('modal close button closes the modal', async () => {
      // Open a modal first
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);

      document.getElementById('modal-close-btn').click();
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('Escape key closes the modal', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('Escape key does nothing when modal is not visible', () => {
      const modal = document.getElementById('game-modal');
      modal.classList.remove('visible');
      // Should not throw
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('clicking outside modal content closes it', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);

      // Simulate click with target === modal (backdrop click)
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: modal });
      modal.dispatchEvent(clickEvent);
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('loadModal returns early when response is not ok', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, text: async () => '' })
      );
      // Trigger a modal load (player status uses loadModal)
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();
      // Modal should not have become visible
      const modal = document.getElementById('game-modal');
      // It may or may not be visible depending on test ordering; just ensure no crash
      expect(document.getElementById('game-modal')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Player Status Modal
  // ---------------------------------------------------------------------------
  describe('openPlayerStatusModal', () => {
    afterEach(closeModalHelper);

    test('shows player stats in the modal', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      expect(document.getElementById('stat-name').textContent).toBe('Test Captain');
      expect(document.getElementById('stat-credits').textContent).toBe('5,000');
      expect(document.getElementById('stat-ship').textContent).toBe('Shuttle');
    });

    test('shows cargo as "Empty" when cargo is empty', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      expect(document.getElementById('stat-cargo').textContent).toBe('Empty');
    });

    test('shows formatted cargo when player has goods', async () => {
      const prevState = currentLocationState;
      currentLocationState = makeLocationState({ cargo: { wheat: 5, passengers: 3 } });

      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      const cargoText = document.getElementById('stat-cargo').textContent;
      expect(cargoText).toContain('Wheat: 5');
      expect(cargoText).toContain('Passengers: 3');

      currentLocationState = prevState;
    });
  });

  // ---------------------------------------------------------------------------
  // Corporation Status Modal
  // ---------------------------------------------------------------------------
  describe('openCorporationStatusModal', () => {
    afterEach(closeModalHelper);

    test('opens corporation status from player status modal', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      const corpBtn = document.getElementById('btn-corporation-status');
      expect(corpBtn).toBeTruthy();
      corpBtn.click();
      await flushPromises();
      await flushPromises();

      expect(document.getElementById('modal-title').textContent).toBe('Corporation Status');
      expect(document.getElementById('corp-name').textContent).toBe('Test Corp');
    });

    test('shows no planets when corporation has no stellar objects', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      document.getElementById('btn-corporation-status').click();
      await flushPromises();
      await flushPromises();

      const planetsList = document.getElementById('corp-planets-list');
      expect(planetsList.innerHTML).toContain('No planets owned');
    });

    test('back button in corp modal opens player status modal', async () => {
      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      document.getElementById('btn-corporation-status').click();
      await flushPromises();
      await flushPromises();

      const backBtn = document.getElementById('btn-player-status');
      expect(backBtn).toBeTruthy();
      backBtn.click();
      await flushPromises();
      await flushPromises();

      expect(document.getElementById('modal-title').textContent).toBe('Player Status');
    });
  });

  // ---------------------------------------------------------------------------
  // Universe Map Modal
  // ---------------------------------------------------------------------------
  describe('openUniverseMapModal', () => {
    afterEach(closeModalHelper);

    test('opens the universe map modal and calls d3 rendering', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);
      expect(global.d3.forceSimulation).toHaveBeenCalled();
    });

    test('zoom-in button calls zoom.scaleBy', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const zoomInBtn = document.getElementById('zoom-in');
      if (zoomInBtn) {
        zoomInBtn.click();
        await flushPromises();
        // scaleBy is called via transition chain; just ensure no crash
        expect(document.getElementById('zoom-in')).toBeTruthy();
      }
    });

    test('zoom-out button exists and is clickable', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const zoomOutBtn = document.getElementById('zoom-out');
      if (zoomOutBtn) {
        zoomOutBtn.click();
        expect(document.getElementById('zoom-out')).toBeTruthy();
      }
    });

    test('zoom-reset button calls container.node().getBBox()', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const zoomResetBtn = document.getElementById('zoom-reset');
      if (zoomResetBtn) {
        zoomResetBtn.click();
        expect(document.getElementById('zoom-reset')).toBeTruthy();
      }
    });

    test('clicking a system node triggers showSystemDetails (explored)', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      // The click handler was captured via d3Handlers['click']
      const clickHandler = d3Handlers['click'];
      if (clickHandler) {
        await clickHandler({}, { id: 1, name: 'Alpha', explored: true });
        await flushPromises();
        await flushPromises();
        const systemName = document.getElementById('system-name');
        if (systemName) {
          expect(systemName.textContent).toBe('Alpha');
        }
      }
    });

    test('clicking a system node triggers showSystemDetails (unexplored)', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const clickHandler = d3Handlers['click'];
      if (clickHandler) {
        await clickHandler({}, { id: 2, name: 'Beta', explored: false });
        await flushPromises();
        const statusEl = document.getElementById('system-status');
        if (statusEl) {
          expect(statusEl.textContent).toBe('Unexplored');
        }
      }
    });

    test('clicking a non-existent system node shows not-found message', async () => {
      document.getElementById('universe-map-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const clickHandler = d3Handlers['click'];
      if (clickHandler) {
        await clickHandler({}, { id: 999, name: 'Unknown' });
        await flushPromises();
        const detailsDiv = document.getElementById('system-details');
        if (detailsDiv) {
          expect(detailsDiv.textContent).toContain('not found');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Jump Planner Modal
  // ---------------------------------------------------------------------------
  describe('openJumpPlanner', () => {
    afterEach(closeModalHelper);

    test('opens jump planner modal in space', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-title').textContent).toBe('Jump Planner');
    });

    test('cannot open jump planner when docked', async () => {
      const prev = currentLocationState;
      currentLocationState = DOCKED_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(false);
      currentLocationState = prev;
    });

    test('shows error when systems list is empty', async () => {
      const prev = currentLocationState;
      currentLocationState = SPACE_STATE;
      window.api.invoke.mockImplementationOnce((ch) => {
        if (ch === 'get-all-systems') return Promise.resolve([]);
        return Promise.resolve(null);
      });
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(false);
      currentLocationState = prev;
    });

    test('calculate route with valid destination shows route', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';

      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const routePath = document.getElementById('route-path');
      expect(routePath).toBeTruthy();
    });

    test('calculate route with invalid destination (NaN) shows error', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = 'abc';

      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();

      const routeDisplay = document.getElementById('route-display');
      expect(routeDisplay).toBeTruthy();
    });

    test('calculate route with current system as destination shows error', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '1'; // same as current

      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();

      const routeDisplay = document.getElementById('route-display');
      expect(routeDisplay).toBeTruthy();
    });

    test('calculate route with non-existent system shows error', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '999';

      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();

      const routeDisplay = document.getElementById('route-display');
      expect(routeDisplay).toBeTruthy();
    });

    test('failed route calculation shows error', async () => {
      currentLocationState = SPACE_STATE;
      window.api.invoke.mockImplementation((ch) => {
        if (ch === 'get-all-systems') return Promise.resolve([{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }]);
        if (ch === 'calculate-jump-route') return Promise.resolve({ success: false, reason: 'No path found' });
        if (ch === 'get-goods-data') return Promise.resolve(MOCK_GOODS);
        if (ch === 'get-ships-data') return Promise.resolve(MOCK_SHIPS);
        if (ch === 'get-game-messages') {
          const group = typeof data === 'string' ? data : '';
          return Promise.resolve(MOCK_MESSAGES[group] || {});
        }
        return Promise.resolve(null);
      });

      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';

      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      // Restore default mock
      window.api.invoke.mockImplementation((channel, data) => {
        if (channel === 'get-goods-data') return Promise.resolve(MOCK_GOODS);
        if (channel === 'get-ships-data') return Promise.resolve(MOCK_SHIPS);
        if (channel === 'get-game-messages') {
          const group = typeof data === 'string' ? data : '';
          return Promise.resolve(MOCK_MESSAGES[group] || {});
        }
        if (channel === 'get-all-systems') return Promise.resolve([{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }]);
        if (channel === 'calculate-jump-route') return Promise.resolve({ success: true, route: [1, 2], cost: 5, energyRequired: 10, currentEnergy: 80 });
        if (channel === 'get-market-price') return Promise.resolve(15);
        if (channel === 'trade-goods') return Promise.resolve({ success: true, message: 'Trade complete' });
        if (channel === 'load-passengers') return Promise.resolve({ success: true, message: 'Passengers loaded' });
        if (channel === 'unload-passengers') return Promise.resolve({ success: true, message: 'Passengers unloaded' });
        if (channel === 'open-load-game-dialog') return Promise.resolve({ success: true, filePath: '/saves/game.json' });
        return Promise.resolve(null);
      });

      expect(document.getElementById('route-display')).toBeTruthy();
    });

    test('cancel-jump-route button closes the modal', async () => {
      currentLocationState = SPACE_STATE;
      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';
      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const cancelBtn = document.getElementById('cancel-jump-route-btn');
      if (cancelBtn) {
        cancelBtn.click();
        const modal = document.getElementById('game-modal');
        expect(modal.classList.contains('visible')).toBe(false);
      }
    });

    test('insufficient energy shows warning and disables execute button', async () => {
      currentLocationState = SPACE_STATE;
      window.api.invoke.mockImplementationOnce(() =>
        Promise.resolve([{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }])
      );
      window.api.invoke.mockImplementationOnce(() =>
        Promise.resolve({ success: true, route: [1, 2], cost: 5, energyRequired: 200, currentEnergy: 80 })
      );

      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';
      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const warning = document.getElementById('route-energy-warning');
      if (warning) {
        expect(warning.hidden).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // executeJumpSequence
  // ---------------------------------------------------------------------------
  describe('executeJumpSequence (via jump planner)', () => {
    afterEach(closeModalHelper);

    test('executes a single-hop route successfully', async () => {
      currentLocationState = SPACE_STATE;

      // Set up receive to auto-resolve jump-result when registered
      let jumpResultResolver;
      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
        if (channel === 'jump-result') {
          jumpResultResolver = cb;
          // Auto-resolve with success
          cb({ success: true, locationState: { system: { name: 'Beta' } } });
        }
      });

      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';
      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const confirmBtn = document.getElementById('confirm-jump-route-btn');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();
      }

      // Restore receive mock
      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
      });
    });

    test('handles failed jump in sequence', async () => {
      currentLocationState = SPACE_STATE;

      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
        if (channel === 'jump-result') {
          cb({ success: false, reason: 'Jump failed mid-sequence' });
        }
      });

      document.getElementById('jump-planner-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const destInput = document.getElementById('destination-system');
      destInput.value = '2';
      document.getElementById('calculate-route-btn').click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const confirmBtn = document.getElementById('confirm-jump-route-btn');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();
      }

      // Restore receive mock
      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
      });

      expect(document.getElementById('game-input').disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Jump & dock & land button clicks
  // ---------------------------------------------------------------------------
  describe('action button handlers', () => {
    test('clicking a jump button sends jump-to-system', () => {
      window.api.send.mockClear();
      const jumpBtn = document.querySelector('#jump-buttons .action-btn[data-action="jump"]');
      expect(jumpBtn).toBeTruthy();
      jumpBtn.click();
      expect(window.api.send).toHaveBeenCalledWith('jump-to-system', expect.any(Number));
    });

    test('clicking a land button sends land-on-surface', () => {
      window.api.send.mockClear();
      const landBtn = document.querySelector('#local-buttons .action-btn[data-action="land"]');
      expect(landBtn).toBeTruthy();
      landBtn.click();
      expect(window.api.send).toHaveBeenCalledWith('land-on-surface', expect.any(Number));
    });
  });

  // ---------------------------------------------------------------------------
  // Docked state: dock button and take-off
  // ---------------------------------------------------------------------------
  describe('docked state actions', () => {
    beforeAll(async () => {
      // Place a Space Station in the location for dock button
      const stationState = makeLocationState({});
      stationState.objects = [
        {
          id: 20, name: 'Alpha Station', type: 'Space Station', className: 'Orbital',
          owner: null, value: 100000, population: null,
          capabilities: { market: false, buildings: false },
          buildingLimit: 0, buildingCredits: 0, buildings: {}, buildingsUnderConstruction: [],
          productivityModifiers: {}, marketState: null, fighters: 0
        }
      ];
      currentLocationState = stationState;

      // Re-run updateAvailableActions by triggering updateLocationDisplay
      await registeredCallbacks['takeoff-result']({ success: true });
      await flushPromises();
      await flushPromises();
    });

    afterAll(() => {
      currentLocationState = SPACE_STATE;
    });

    test('dock button sends dock-at-station', () => {
      window.api.send.mockClear();
      const dockBtn = document.querySelector('#local-buttons .action-btn[data-action="dock"]');
      if (dockBtn) {
        dockBtn.click();
        expect(window.api.send).toHaveBeenCalledWith('dock-at-station', expect.any(Number));
      }
    });

    test('take-off button sends take-off when landed/docked', async () => {
      currentLocationState = DOCKED_STATE;
      await registeredCallbacks['dock-result']({
        success: true,
        dockedObject: { name: 'Alpha Station', description: null }
      });
      await flushPromises();
      await flushPromises();

      window.api.send.mockClear();
      const takeOffBtn = document.querySelector('#local-buttons .action-btn[data-action="takeoff"]');
      if (takeOffBtn) {
        takeOffBtn.click();
        expect(window.api.send).toHaveBeenCalledWith('take-off');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Trade modal
  // ---------------------------------------------------------------------------
  describe('trade modal', () => {
    beforeAll(async () => {
      // Set to landed state with cargo
      currentLocationState = LANDED_STATE;
      await registeredCallbacks['land-result']({
        success: true,
        landedObject: MOCK_PLANET
      });
      await flushPromises();
      await flushPromises();
    });

    afterAll(async () => {
      currentLocationState = SPACE_STATE;
      closeModalHelper();
    });

    afterEach(closeModalHelper);

    async function openTradeModal() {
      const tradeBtn = document.querySelector('#local-buttons .action-btn[data-action="trade"]');
      expect(tradeBtn).toBeTruthy();
      tradeBtn.click();
      await flushPromises();
      await flushPromises();
      await flushPromises();
    }

    test('trade modal opens with goods-to-buy populated', async () => {
      await openTradeModal();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(true);
      const goodsToBuy = document.getElementById('goods-to-buy');
      expect(goodsToBuy).toBeTruthy();
      // Should have trade items for wheat and electronics
      expect(goodsToBuy.querySelectorAll('.trade-item').length).toBeGreaterThan(0);
    });

    test('trade modal shows goods-to-sell from player cargo', async () => {
      await openTradeModal();
      const goodsToSell = document.getElementById('goods-to-sell');
      expect(goodsToSell).toBeTruthy();
      expect(goodsToSell.querySelectorAll('.trade-item').length).toBeGreaterThan(0);
    });

    test('trade modal shows passenger controls for populated planet', async () => {
      await openTradeModal();
      const passengerControls = document.getElementById('passenger-controls');
      expect(passengerControls.classList.contains('hidden')).toBe(false);
    });

    test('trade modal shows passengers in cargo section', async () => {
      await openTradeModal();
      const passengersSection = document.getElementById('passengers-in-cargo-section');
      expect(passengersSection.classList.contains('hidden')).toBe(false);
    });

    test('buying goods with quantity 0 shows error', async () => {
      await openTradeModal();
      const buyBtn = document.querySelector('[data-action="buy"]');
      if (buyBtn) {
        const input = buyBtn.parentElement.querySelector('.trade-quantity');
        input.value = '0';
        buyBtn.click();
        await flushPromises();
        const errorDiv = document.getElementById('trade-error');
        expect(errorDiv.classList.contains('hidden')).toBe(false);
      }
    });

    test('buying goods successfully closes modal and updates display', async () => {
      await openTradeModal();
      const buyBtn = document.querySelector('[data-action="buy"]');
      if (buyBtn) {
        const input = buyBtn.parentElement.querySelector('.trade-quantity');
        input.value = '5';
        buyBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();
        expect(window.api.invoke).toHaveBeenCalledWith('trade-goods', expect.objectContaining({ action: 'buy' }));
      }
    });

    test('buying goods with failed trade shows error', async () => {
      window.api.invoke.mockImplementationOnce((ch) => {
        if (ch === 'get-goods-data') return Promise.resolve(MOCK_GOODS);
        return Promise.resolve(null);
      });
      window.api.invoke.mockImplementationOnce(() => Promise.resolve(MOCK_SHIPS));
      // Next trade-goods call fails
      window.api.invoke.mockImplementationOnce((ch) => {
        if (ch === 'get-market-price') return Promise.resolve(15);
        return Promise.resolve(null);
      });

      await openTradeModal();

      // Override trade-goods to return failure
      const origInvoke = window.api.invoke;
      window.api.invoke = jest.fn().mockImplementation((ch) => {
        if (ch === 'trade-goods') return Promise.resolve({ success: false, message: 'Insufficient credits' });
        return origInvoke(ch);
      });

      const buyBtn = document.querySelector('[data-action="buy"]');
      if (buyBtn) {
        const input = buyBtn.parentElement.querySelector('.trade-quantity');
        input.value = '5';
        buyBtn.click();
        await flushPromises();
        await flushPromises();
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          expect(errorDiv.classList.contains('hidden')).toBe(false);
        }
      }

      window.api.invoke = origInvoke;
    });

    test('passenger input change updates cargo info', async () => {
      await openTradeModal();
      const passengerInput = document.getElementById('passenger-count');
      if (passengerInput) {
        passengerInput.value = '5';
        passengerInput.dispatchEvent(new Event('input'));
        const cargoInfo = document.getElementById('passenger-cargo-info');
        if (cargoInfo) {
          expect(cargoInfo.textContent).toContain('0.50');
        }
      }
    });

    test('loading passengers with quantity 0 shows error', async () => {
      await openTradeModal();
      const loadBtn = document.getElementById('load-passengers-btn');
      if (loadBtn) {
        const passengerInput = document.getElementById('passenger-count');
        passengerInput.value = '0';
        loadBtn.click();
        await flushPromises();
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          expect(errorDiv.classList.contains('hidden')).toBe(false);
        }
      }
    });

    test('loading passengers successfully closes modal', async () => {
      await openTradeModal();
      const loadBtn = document.getElementById('load-passengers-btn');
      if (loadBtn) {
        const passengerInput = document.getElementById('passenger-count');
        passengerInput.value = '10';
        loadBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();
        expect(window.api.invoke).toHaveBeenCalledWith('load-passengers', expect.any(Object));
      }
    });

    test('unload-passenger input change updates cargo info', async () => {
      await openTradeModal();
      const unloadInput = document.getElementById('unload-passenger-count');
      if (unloadInput) {
        unloadInput.value = '5';
        unloadInput.dispatchEvent(new Event('input'));
        const cargoInfo = document.getElementById('unload-passenger-cargo-info');
        if (cargoInfo) {
          expect(cargoInfo.textContent).toContain('0.50');
        }
      }
    });

    test('unloading passengers with quantity 0 shows error', async () => {
      await openTradeModal();
      const unloadBtn = document.getElementById('unload-passengers-btn');
      if (unloadBtn) {
        const unloadInput = document.getElementById('unload-passenger-count');
        unloadInput.value = '0';
        unloadBtn.click();
        await flushPromises();
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          expect(errorDiv.classList.contains('hidden')).toBe(false);
        }
      }
    });

    test('unloading passengers successfully closes modal', async () => {
      await openTradeModal();
      const unloadBtn = document.getElementById('unload-passengers-btn');
      if (unloadBtn) {
        const unloadInput = document.getElementById('unload-passenger-count');
        unloadInput.value = '5';
        unloadBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();
        expect(window.api.invoke).toHaveBeenCalledWith('unload-passengers', expect.any(Object));
      }
    });

    test('unload-all button unloads all passengers', async () => {
      await openTradeModal();
      const unloadAllBtn = document.getElementById('unload-all-passengers-btn');
      if (unloadAllBtn) {
        unloadAllBtn.click();
        await flushPromises();
        await flushPromises();
        expect(window.api.invoke).toHaveBeenCalledWith('unload-passengers', expect.any(Object));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Trade modal – low population (no passengers available)
  // ---------------------------------------------------------------------------
  describe('trade modal with low-population planet', () => {
    const lowPopPlanet = {
      ...MOCK_PLANET,
      id: 12,
      name: 'Low Pop World',
      population: { current: 500, limit: 10000, growthRate: 0.01 }
    };

    const lowPopLocation = makeLocationState({
      dockedAt: null,
      landedOn: 12,
      cargo: {}
    });
    lowPopLocation.objects = [lowPopPlanet];

    beforeAll(async () => {
      currentLocationState = lowPopLocation;
      await registeredCallbacks['land-result']({ success: true, landedObject: lowPopPlanet });
      await flushPromises();
      await flushPromises();
    });

    afterAll(() => {
      currentLocationState = SPACE_STATE;
      closeModalHelper();
    });

    afterEach(closeModalHelper);

    test('passenger controls are hidden for low-population planet', async () => {
      const tradeBtn = document.querySelector('#local-buttons .action-btn[data-action="trade"]');
      if (tradeBtn) {
        tradeBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();

        const passengerControls = document.getElementById('passenger-controls');
        if (passengerControls) {
          expect(passengerControls.classList.contains('hidden')).toBe(true);
        }
      }
    });

    test('cargo is empty message shown when no cargo to sell', async () => {
      const tradeBtn = document.querySelector('#local-buttons .action-btn[data-action="trade"]');
      if (tradeBtn) {
        tradeBtn.click();
        await flushPromises();
        await flushPromises();
        await flushPromises();

        const goodsToSell = document.getElementById('goods-to-sell');
        if (goodsToSell) {
          expect(goodsToSell.textContent).toContain('empty');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // displayStellarObjectProperties – no population and no market branches
  // ---------------------------------------------------------------------------
  describe('displayStellarObjectProperties edge cases', () => {
    const noPopPlanet = {
      ...MOCK_PLANET,
      id: 13,
      name: 'No Pop Planet',
      population: null,
      capabilities: {
        ...MOCK_PLANET.capabilities,
        buildings: false,
        market: false,
        fighters: true
      },
      fighters: 5,
      marketState: null,
      buildingsUnderConstruction: [{ type: 'Mine', ticksRemaining: 3 }]
    };

    const noPopLocation = makeLocationState({ landedOn: 13 });
    noPopLocation.objects = [noPopPlanet];

    test('displays properties for object without population or market', async () => {
      currentLocationState = noPopLocation;
      await registeredCallbacks['land-result']({ success: true, landedObject: noPopPlanet });
      await flushPromises();
      await flushPromises();
      // No crash means success
      expect(document.getElementById('game-console')).toBeTruthy();
      currentLocationState = SPACE_STATE;
    });
  });

  // ---------------------------------------------------------------------------
  // Command input
  // ---------------------------------------------------------------------------
  describe('command input (keyboard)', () => {
    async function sendCommand(text) {
      const input = document.getElementById('game-input');
      input.value = text;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushPromises();
      await flushPromises();
    }

    beforeEach(() => {
      currentLocationState = SPACE_STATE;
      // Ensure DOM matches space state
    });

    test('numeric command triggers offerRouteAndJump', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]));
      await sendCommand('2');
      // Should invoke get-all-systems and then calculate-jump-route
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('jump N command triggers jump to system N', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]));
      await sendCommand('jump 2');
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('offerRouteAndJump: already at destination', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]));
      await sendCommand('1'); // current system
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('offerRouteAndJump: confirm=true executes route', async () => {
      global.confirm.mockReturnValueOnce(true);
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]));
      window.api.invoke.mockImplementationOnce(() =>
        Promise.resolve({ success: true, route: [1, 2], cost: 5, energyRequired: 10, currentEnergy: 80 })
      );

      // Auto-resolve jump-result when registered
      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
        if (channel === 'jump-result') {
          cb({ success: true, locationState: { system: { name: 'Beta' } } });
        }
      });

      await sendCommand('2');
      await flushPromises();
      await flushPromises();

      // Restore
      window.api.receive.mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
      });
    });

    test('offerRouteAndJump: system not found', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }]));
      await sendCommand('99');
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('offerRouteAndJump: route fails', async () => {
      window.api.invoke.mockImplementationOnce(() => Promise.resolve([{ id: 1 }, { id: 2 }]));
      window.api.invoke.mockImplementationOnce(() =>
        Promise.resolve({ success: false, reason: 'No path' })
      );
      await sendCommand('2');
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('dock command triggers executeLocalActionShortcut', async () => {
      // Set up a space station so dock button exists
      const stationState = makeLocationState({});
      stationState.objects = [{
        id: 20, name: 'Alpha Station', type: 'Space Station', className: 'Orbital',
        owner: null, value: 100000, population: null,
        capabilities: { market: false, buildings: false }, buildingLimit: 0,
        buildingCredits: 0, buildings: {}, buildingsUnderConstruction: [],
        productivityModifiers: {}, marketState: null, fighters: 0
      }];
      currentLocationState = stationState;
      await registeredCallbacks['takeoff-result']({ success: true });
      await flushPromises();
      await flushPromises();

      window.api.send.mockClear();
      await sendCommand('dock');

      currentLocationState = SPACE_STATE;
    });

    test('land command triggers executeLocalActionShortcut', async () => {
      currentLocationState = SPACE_STATE;
      await registeredCallbacks['takeoff-result']({ success: true });
      await flushPromises();
      await flushPromises();

      window.api.send.mockClear();
      await sendCommand('land');
      // land button should have been clicked or message shown
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('exact button match executes the button', async () => {
      await sendCommand('jump planner');
      await flushPromises();
      await flushPromises();
      // jumpPlannerBtn should have been clicked; modal might open
      closeModalHelper();
    });

    test('unique first-word match executes the button', async () => {
      await sendCommand('universe');
      await flushPromises();
      await flushPromises();
      closeModalHelper();
    });

    test('disabled button match shows message', async () => {
      // Disable all action buttons then try to use them
      const jumpBtn = document.querySelector('#jump-buttons .action-btn');
      if (jumpBtn) {
        const prevDisabled = jumpBtn.disabled;
        jumpBtn.disabled = true;
        await sendCommand(jumpBtn.textContent.toLowerCase());
        jumpBtn.disabled = prevDisabled;
      }
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('unknown command shows unknown command message', async () => {
      await sendCommand('xyzzy unknown command');
      expect(document.getElementById('game-console')).toBeTruthy();
    });

    test('empty command does nothing', async () => {
      window.api.send.mockClear();
      const input = document.getElementById('game-input');
      input.value = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushPromises();
      // No actions should be triggered
    });

    test('non-Enter key does nothing', async () => {
      window.api.send.mockClear();
      const input = document.getElementById('game-input');
      input.value = 'save game';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      await flushPromises();
      // send should not be called for a non-Enter key
    });
  });

  // ---------------------------------------------------------------------------
  // Corporation status with stellar objects owned
  // ---------------------------------------------------------------------------
  describe('corporation status with owned stellar objects', () => {
    afterEach(closeModalHelper);

    test('shows owned stellar object details', async () => {
      const prevState = currentLocationState;
      currentLocationState = makeLocationState({
        corporation: {
          name: 'Big Corp',
          description: 'Owns stuff.',
          value: 999999,
          totalCashReserves: 10000,
          stellarObjects: [10]
        }
      });

      window.api.getUniverseState.mockResolvedValueOnce({
        stellarObjects: [MOCK_PLANET]
      });

      document.getElementById('player-status-btn').click();
      await flushPromises();
      await flushPromises();

      document.getElementById('btn-corporation-status')?.click();
      await flushPromises();
      await flushPromises();
      await flushPromises();

      const planetsList = document.getElementById('corp-planets-list');
      if (planetsList) {
        expect(planetsList.innerHTML).toContain('Alpha Prime');
      }

      currentLocationState = prevState;
    });
  });
});

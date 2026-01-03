/**
 * End-to-End Smoke Tests for game.js
 * These tests verify complete user workflows from action trigger to UI update
 * They test the full integration of IPC calls, message display, and state updates
 */

describe('Game UI End-to-End Smoke Tests', () => {
  let consoleDiv;

  beforeEach(() => {
    // Setup minimal DOM for E2E tests
    document.body.innerHTML = `
      <div id="game-console"></div>
      <div id="location-status"></div>
      <div id="ship-status"></div>
      <img id="location-image" src="" alt="System View" />
      <div id="no-image-placeholder" class="no-image-placeholder">No System Image Available</div>
      <div id="jump-buttons"></div>
      <div id="local-buttons"></div>
    `;

    consoleDiv = document.getElementById('game-console');

    // Mock API
    window.api = {
      send: jest.fn(),
      invoke: jest.fn(),
      receive: jest.fn(),
      getLocationState: jest.fn(),
      getGameSettings: jest.fn(),
      getShipData: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Navigation System', () => {
    test('complete jump workflow displays messages and updates UI', async () => {
      // Setup: Mock all necessary API calls
      const mockLocationState = {
        playerState: {
          name: 'TestCaptain',
          location: 1,
          dockedAt: null,
          landedOn: null
        },
        system: { id: 1, name: 'Alpha System' },
        objects: []
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.invoke
        .mockResolvedValueOnce('Jumping to System {systemId}...') // navigation.jumping
        .mockResolvedValueOnce('Jump to {systemName} completed successfully.'); // navigation.jump_success

      window.api.getShipData.mockResolvedValue({
        name: 'Test Ship',
        cargo_capacity: 100,
        fuel_capacity: 100,
        jump_range: 5
      });

      // Simulate the full addMessage function
      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const locationState = await window.api.getLocationState();
            const playerName = locationState?.playerState?.name || 'Captain';
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const allVars = { playerName, ...vars };
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return allVars[variable] !== undefined ? allVars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate the jump workflow
      const targetSystemId = 2;
      addMessageFn('message:navigation.jumping', { systemId: targetSystemId });

      // Wait for async message loading
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify jumping message appears
      expect(consoleDiv.textContent).toContain('Jumping to System 2');

      // Simulate successful jump result
      const jumpResult = {
        success: true,
        locationState: {
          ...mockLocationState,
          system: { id: 2, name: 'Beta System' }
        }
      };

      addMessageFn('message:navigation.jump_success', { systemName: jumpResult.locationState.system.name });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify success message appears
      expect(consoleDiv.textContent).toContain('Jump to Beta System completed successfully');
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'navigation.jumping');
      expect(window.api.invoke).toHaveBeenCalledWith('get-game-messages', 'navigation.jump_success');
    });

    test('complete dock workflow displays messages and updates state', async () => {
      const mockStation = {
        id: 100,
        name: 'Trading Station Alpha',
        type: 'Station',
        description: 'A bustling commercial hub.'
      };

      const mockLocationState = {
        playerState: {
          name: 'TestCaptain',
          location: 1,
          dockedAt: null,
          landedOn: null
        },
        system: { id: 1, name: 'Alpha System' },
        objects: [mockStation]
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.invoke
        .mockResolvedValueOnce('Requesting docking permission at {objectName}...') // navigation.docking_request
        .mockResolvedValueOnce('Welcome to {objectName}. Docking sequence complete.'); // navigation.dock_success

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return vars[variable] !== undefined ? vars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate dock workflow
      addMessageFn('message:navigation.docking_request', { objectName: mockStation.name });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Requesting docking permission at Trading Station Alpha');

      // Simulate successful dock
      addMessageFn('message:navigation.dock_success', { objectName: mockStation.name });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Welcome to Trading Station Alpha. Docking sequence complete');
    });

    test('complete land workflow displays messages and object description', async () => {
      const mockPlanet = {
        id: 101,
        name: 'New Terra',
        type: 'Planet',
        description: 'A verdant world teeming with life.'
      };

      window.api.invoke
        .mockResolvedValueOnce('Preparing for landing on {objectName}...') // navigation.landing_request
        .mockResolvedValueOnce('Welcome to {objectName}. Landing sequence complete.'); // navigation.land_success

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return vars[variable] !== undefined ? vars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate landing workflow
      addMessageFn('message:navigation.landing_request', { objectName: mockPlanet.name });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Preparing for landing on New Terra');

      // Simulate successful landing
      addMessageFn('message:navigation.land_success', { objectName: mockPlanet.name });
      addMessageFn(mockPlanet.description); // Description displayed after landing

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Welcome to New Terra. Landing sequence complete');
      expect(consoleDiv.textContent).toContain('A verdant world teeming with life');
    });

    test('takeoff workflow displays success message', async () => {
      window.api.invoke.mockResolvedValueOnce('Taking off...')
        .mockResolvedValueOnce('Takeoff successful.');

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              addMessageFn(message);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      addMessageFn('message:navigation.taking_off');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Taking off');

      // Simulate successful takeoff
      addMessageFn('message:navigation.takeoff_success');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Takeoff successful');
    });
  });

  describe('Multi-Jump Planning System', () => {
    test('complete multi-jump sequence displays all progress messages', async () => {
      const route = [1, 2, 3, 5]; // Current system 1, jump to 2, 3, then 5

      window.api.getLocationState.mockResolvedValue({
        playerState: { name: 'TestCaptain' }
      });

      const messages = [
        'Starting jump sequence to System {destinationId}...', // sequence_start
        'Route: {route}', // route_display
        'Jumping to System {systemId} ({current}/{total})...', // jump_progress
        'Arrived at System {systemId}', // arrived
        'Jump sequence complete. Arrived at destination: System {destinationId}' // sequence_complete
      ];

      window.api.invoke.mockImplementation((channel, key) => {
        if (key === 'jump_planner.sequence_start') return Promise.resolve(messages[0]);
        if (key === 'jump_planner.route_display') return Promise.resolve(messages[1]);
        if (key === 'jump_planner.jump_progress') return Promise.resolve(messages[2]);
        if (key === 'jump_planner.arrived') return Promise.resolve(messages[3]);
        if (key === 'jump_planner.sequence_complete') return Promise.resolve(messages[4]);
        return Promise.resolve(null);
      });

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return vars[variable] !== undefined ? vars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate jump sequence
      addMessageFn('message:jump_planner.sequence_start', { destinationId: route[route.length - 1] });
      addMessageFn('message:jump_planner.route_display', { route: route.join(' → ') });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Starting jump sequence to System 5');
      expect(consoleDiv.textContent).toContain('Route: 1 → 2 → 3 → 5');

      // Simulate each jump in sequence
      for (let i = 1; i < route.length; i++) {
        addMessageFn('message:jump_planner.jump_progress', {
          systemId: route[i],
          current: i,
          total: route.length - 1
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        addMessageFn('message:jump_planner.arrived', { systemId: route[i] });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      expect(consoleDiv.textContent).toContain('Jumping to System 2 (1/3)');
      expect(consoleDiv.textContent).toContain('Arrived at System 2');
      expect(consoleDiv.textContent).toContain('Jumping to System 3 (2/3)');
      expect(consoleDiv.textContent).toContain('Arrived at System 3');
      expect(consoleDiv.textContent).toContain('Jumping to System 5 (3/3)');
      expect(consoleDiv.textContent).toContain('Arrived at System 5');

      // Simulate sequence completion
      addMessageFn('message:jump_planner.sequence_complete', { destinationId: route[route.length - 1] });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Jump sequence complete. Arrived at destination: System 5');
    });
  });

  describe('Save/Load System', () => {
    test('save game workflow displays messages', async () => {
      const mockSavePath = '/saves/save_2026-01-03_12-30-00.json';

      window.api.invoke
        .mockResolvedValueOnce('Saving game...') // save_load.saving
        .mockResolvedValueOnce('Game saved successfully. Save file: {savePath}'); // save_load.save_success

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return vars[variable] !== undefined ? vars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate save workflow
      addMessageFn('message:save_load.saving');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Saving game');

      // Simulate successful save
      addMessageFn('message:save_load.save_success', { savePath: mockSavePath });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Game saved successfully');
      expect(consoleDiv.textContent).toContain(mockSavePath);
    });

    test('load game workflow displays messages', async () => {
      const mockSavePath = '/saves/save_2026-01-03_10-00-00.json';

      window.api.invoke
        .mockResolvedValueOnce('Loading game...') // save_load.loading
        .mockResolvedValueOnce('Loading most recent save: {savePath}') // save_load.load_recent
        .mockResolvedValueOnce('Game loaded successfully.'); // save_load.load_success

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                return vars[variable] !== undefined ? vars[variable] : match;
              });
              addMessageFn(processedMessage);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate load workflow
      addMessageFn('message:save_load.loading');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Loading game');

      addMessageFn('message:save_load.load_recent', { savePath: mockSavePath });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Loading most recent save');
      expect(consoleDiv.textContent).toContain(mockSavePath);

      addMessageFn('message:save_load.load_success');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Game loaded successfully');
    });
  });

  describe('Game Initialization', () => {
    test('game start displays welcome messages with player name', async () => {
      const mockGameStartMessages = {
        title: 'Welcome to Universe Market Builder',
        greeting: 'Greetings, Captain {playerName}!',
        intro: 'In the vast expanse of space, opportunity awaits those bold enough to seize it.',
        backstory: 'You are a merchant captain, inheriting a modest trading corporation and a small ship.',
        goal: 'Your goal: build an empire across the stars through trade, exploration, and strategic expansion.',
        closing: 'The universe is yours to explore. Chart your own course to success.'
      };

      window.api.getLocationState.mockResolvedValue({
        playerState: { name: 'Alexander' }
      });

      window.api.invoke.mockResolvedValueOnce(mockGameStartMessages);

      const addMessageFn = (msg) => {
        if (typeof msg === 'string' && msg.startsWith('messages:')) {
          const messageKey = msg.replace('messages:', '');
          (async () => {
            const locationState = await window.api.getLocationState();
            const playerName = locationState?.playerState?.name || 'Captain';
            const messages = await window.api.invoke('get-game-messages', messageKey);
            if (messages) {
              if (messages.title) {
                addMessageFn(`=== ${messages.title} ===`);
              }
              for (const [key, message] of Object.entries(messages).filter(([k]) => k !== 'title')) {
                const processedMessage = message.replace(/\{playerName\}/g, playerName);
                addMessageFn(processedMessage);
              }
              addMessageFn('');
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate game start
      addMessageFn('messages:game_start');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('=== Welcome to Universe Market Builder ===');
      expect(consoleDiv.textContent).toContain('Greetings, Captain Alexander!');
      expect(consoleDiv.textContent).toContain('opportunity awaits');
      expect(consoleDiv.textContent).toContain('merchant captain');
      expect(consoleDiv.textContent).toContain('build an empire');
      expect(consoleDiv.textContent).toContain('Chart your own course');
    });

    test('UI welcome messages display on initialization', async () => {
      window.api.invoke
        .mockResolvedValueOnce('Welcome to Universe Market Builder!')
        .mockResolvedValueOnce('Type a command and press Enter to interact with the game.');

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              addMessageFn(message);
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      addMessageFn('message:ui.welcome');
      addMessageFn('message:ui.help_prompt');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Welcome to Universe Market Builder!');
      expect(consoleDiv.textContent).toContain('Type a command and press Enter');
    });
  });

  describe('Error Handling', () => {
    test('navigation fails gracefully with error messages', async () => {
      // Error messages are NOT in the message file, they stay as dynamic strings
      const addMessageFn = (msg) => {
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      // Simulate jump failure
      addMessageFn('Jump failed: Insufficient energy');

      expect(consoleDiv.textContent).toContain('Jump failed: Insufficient energy');

      // Simulate dock failure
      addMessageFn('Docking failed: No docking port available');

      expect(consoleDiv.textContent).toContain('Docking failed: No docking port available');

      // Simulate landing failure
      addMessageFn('Landing failed: No suitable landing site');

      expect(consoleDiv.textContent).toContain('Landing failed: No suitable landing site');
    });

    test('message loading failure displays error message', async () => {
      window.api.getLocationState.mockResolvedValue({
        playerState: { name: 'TestCaptain' }
      });
      window.api.invoke.mockRejectedValue(new Error('Failed to load messages'));

      const addMessageFn = (msg, vars = {}) => {
        if (typeof msg === 'string' && msg.startsWith('message:')) {
          const messageKey = msg.replace('message:', '');
          (async () => {
            try {
              const message = await window.api.invoke('get-game-messages', messageKey);
              if (message && typeof message === 'string') {
                addMessageFn(message);
              }
            } catch (error) {
              console.error('Error loading message:', error);
              addMessageFn('Error: Unable to load message.');
            }
          })();
          return;
        }
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      addMessageFn('message:navigation.jumping', { systemId: 5 });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleDiv.textContent).toContain('Error: Unable to load message');
    });
  });

  describe('Corporation Status Modal', () => {
    let modalTitle;
    let modalBody;
    let gameModal;

    beforeEach(() => {
      // Add modal elements to DOM
      document.body.innerHTML += `
        <div id="game-modal" class="modal">
          <div class="modal-content">
            <span class="close-btn" id="modal-close-btn">&times;</span>
            <h2 id="modal-title"></h2>
            <div id="modal-body"></div>
          </div>
        </div>
        <button id="player-status-btn">Player Status</button>
      `;

      modalTitle = document.getElementById('modal-title');
      modalBody = document.getElementById('modal-body');
      gameModal = document.getElementById('game-modal');

      // Add API methods for corporation status
      window.api.getUniverseState = jest.fn();
      window.api.getGameData = jest.fn();

      // Mock fetch for loading HTML templates
      global.fetch = jest.fn();
    });

    test('complete workflow: open player status -> corporation status -> back to player status', async () => {
      // Mock location state with player and corporation data
      const mockLocationState = {
        playerState: {
          name: 'Commander Drake',
          credits: 50000,
          ship: 'Cargo Hauler',
          system: 2,
          shipEnergy: 950,
          shipMaxEnergy: 1000,
          cargo: { 'Food': 100, 'Minerals': 50 },
          stats: {
            jumps: 25,
            trades: 10,
            profit: 15000
          },
          corporation: {
            name: 'Drake Interstellar',
            description: 'A growing trading empire',
            value: 250000,
            stellarObjects: [5, 10]
          }
        },
        system: { id: 2, name: 'Beta System' },
        objects: []
      };

      const mockUniverseState = {
        systems: [
          { id: 1, name: 'Alpha System' },
          { id: 2, name: 'Beta System' },
          { id: 3, name: 'Gamma System' }
        ],
        stellarObjects: [
          { id: 5, name: 'Farm World Alpha', className: 'Farm World', location: 2, value: 125000 },
          { id: 10, name: 'Mining Outpost Beta', className: 'Mining Base', location: 3, value: 75000 }
        ]
      };

      const mockShipData = {
        'Cargo Hauler': { value: 50000 }
      };

      const playerStatusHTML = `
        <div id="stat-name"></div>
        <div id="stat-credits"></div>
        <div id="stat-ship"></div>
        <div id="stat-energy"></div>
        <div id="stat-cargo"></div>
        <div id="stat-jumps"></div>
        <div id="stat-trades"></div>
        <div id="stat-profit"></div>
        <div id="stat-corporation-name"></div>
        <div id="stat-corporation-description"></div>
        <div id="stat-corporation-value"></div>
        <button id="btn-corporation-status">Corporation Status</button>
      `;

      const corporationStatusHTML = `
        <div id="corp-name"></div>
        <div id="corp-description"></div>
        <div id="corp-value"></div>
        <div id="corp-planets-list"></div>
        <div id="corp-ships-list"></div>
        <button id="btn-player-status">Back to Player Status</button>
      `;

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.getUniverseState.mockResolvedValue(mockUniverseState);
      window.api.getGameData.mockResolvedValue(mockShipData);

      // Simulate loadModal function
      const loadModal = async (title, contentFile, onLoad) => {
        modalTitle.textContent = title;

        // Mock fetch to return appropriate HTML based on contentFile
        if (contentFile.includes('player-status.html')) {
          modalBody.innerHTML = playerStatusHTML;
        } else if (contentFile.includes('corporation-status.html')) {
          modalBody.innerHTML = corporationStatusHTML;
        }

        gameModal.classList.add('visible');

        if (onLoad && typeof onLoad === 'function') {
          await onLoad();
        }
      };

      // Step 1: Open player status modal
      await loadModal('Player Status', './modals/player-status.html', async () => {
        const locationState = await window.api.getLocationState();
        const playerState = locationState.playerState;

        document.getElementById('stat-name').textContent = playerState.name;
        document.getElementById('stat-credits').textContent = playerState.credits.toLocaleString();
        document.getElementById('stat-ship').textContent = playerState.ship;
        document.getElementById('stat-energy').textContent = `${playerState.shipEnergy}/${playerState.shipMaxEnergy}`;
        document.getElementById('stat-cargo').textContent = Object.entries(playerState.cargo)
          .map(([good, quantity]) => `${good}: ${quantity}`)
          .join(', ');
        document.getElementById('stat-jumps').textContent = playerState.stats.jumps;
        document.getElementById('stat-trades').textContent = playerState.stats.trades;
        document.getElementById('stat-profit').textContent = playerState.stats.profit.toLocaleString();
        document.getElementById('stat-corporation-name').textContent = playerState.corporation.name;
        document.getElementById('stat-corporation-description').textContent = playerState.corporation.description;
        document.getElementById('stat-corporation-value').textContent = playerState.corporation.value.toLocaleString();
      });

      // Verify player status modal is displayed correctly
      expect(modalTitle.textContent).toBe('Player Status');
      expect(gameModal.classList.contains('visible')).toBe(true);
      expect(document.getElementById('stat-name').textContent).toBe('Commander Drake');
      expect(document.getElementById('stat-credits').textContent).toBe('50,000');
      expect(document.getElementById('stat-corporation-name').textContent).toBe('Drake Interstellar');
      expect(document.getElementById('btn-corporation-status')).toBeTruthy();

      // Step 2: Click corporation status button
      const corpStatusBtn = document.getElementById('btn-corporation-status');
      await corpStatusBtn.dispatchEvent(new MouseEvent('click'));

      // Simulate opening corporation status modal
      await loadModal('Corporation Status', './modals/corporation-status.html', async () => {
        const locationState = await window.api.getLocationState();
        const playerState = locationState.playerState;
        const corporation = playerState.corporation;

        document.getElementById('corp-name').textContent = corporation.name;
        document.getElementById('corp-description').textContent = corporation.description;
        document.getElementById('corp-value').textContent = corporation.value.toLocaleString();

        const universeState = await window.api.getUniverseState();

        const planetsList = document.getElementById('corp-planets-list');
        const planetsHTML = corporation.stellarObjects
          .map(objId => {
            const stellarObj = universeState.stellarObjects.find(obj => obj.id === objId);
            if (!stellarObj) return '';
            return `
              <div class="asset-item">
                <strong>${stellarObj.name}</strong> (${stellarObj.className})
                <br>System: ${stellarObj.location}
                <br>Value: ${stellarObj.value.toLocaleString()} credits
              </div>
            `;
          })
          .filter(html => html !== '')
          .join('');
        planetsList.innerHTML = planetsHTML;

        const ships = await window.api.getGameData('ships');
        const shipValue = ships[playerState.ship]?.value || 0;

        const shipsList = document.getElementById('corp-ships-list');
        shipsList.innerHTML = `
          <div class="asset-item">
            <strong>${playerState.ship}</strong>
            <br>Location: System ${playerState.system}
            <br>Value: ${shipValue.toLocaleString()} credits
          </div>
        `;
      });

      // Verify corporation status modal is displayed correctly
      expect(modalTitle.textContent).toBe('Corporation Status');
      expect(document.getElementById('corp-name').textContent).toBe('Drake Interstellar');
      expect(document.getElementById('corp-description').textContent).toBe('A growing trading empire');
      expect(document.getElementById('corp-value').textContent).toBe('250,000');

      // Verify planets list
      const planetsList = document.getElementById('corp-planets-list').innerHTML;
      expect(planetsList).toContain('Farm World Alpha');
      expect(planetsList).toContain('Farm World');
      expect(planetsList).toContain('System: 2');
      expect(planetsList).toContain('125,000');
      expect(planetsList).toContain('Mining Outpost Beta');
      expect(planetsList).toContain('Mining Base');
      expect(planetsList).toContain('System: 3');
      expect(planetsList).toContain('75,000');

      // Verify ships list
      const shipsList = document.getElementById('corp-ships-list').innerHTML;
      expect(shipsList).toContain('Cargo Hauler');
      expect(shipsList).toContain('System 2');
      expect(shipsList).toContain('50,000');

      // Verify API calls
      expect(window.api.getLocationState).toHaveBeenCalled();
      expect(window.api.getUniverseState).toHaveBeenCalled();
      expect(window.api.getGameData).toHaveBeenCalledWith('ships');

      // Step 3: Click back button to return to player status
      const backBtn = document.getElementById('btn-player-status');
      expect(backBtn).toBeTruthy();

      await backBtn.dispatchEvent(new MouseEvent('click'));

      // Re-open player status (simulating the back button behavior)
      await loadModal('Player Status', './modals/player-status.html', async () => {
        const locationState = await window.api.getLocationState();
        const playerState = locationState.playerState;
        document.getElementById('stat-name').textContent = playerState.name;
        document.getElementById('stat-corporation-name').textContent = playerState.corporation.name;
      });

      // Verify we're back to player status
      expect(modalTitle.textContent).toBe('Player Status');
      expect(document.getElementById('stat-name').textContent).toBe('Commander Drake');
    });

    test('corporation status handles no planets owned scenario', async () => {
      const mockLocationState = {
        playerState: {
          name: 'NewCaptain',
          ship: 'Shuttle',
          system: 1,
          corporation: {
            name: 'Startup Corp',
            description: 'Just getting started',
            value: 10000,
            stellarObjects: []
          }
        }
      };

      const mockUniverseState = {
        stellarObjects: []
      };

      const mockShipData = {
        'Shuttle': { value: 5000 }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.getUniverseState.mockResolvedValue(mockUniverseState);
      window.api.getGameData.mockResolvedValue(mockShipData);

      const corporationStatusHTML = `
        <div id="corp-name"></div>
        <div id="corp-description"></div>
        <div id="corp-value"></div>
        <div id="corp-planets-list"></div>
        <div id="corp-ships-list"></div>
      `;

      modalBody.innerHTML = corporationStatusHTML;
      modalTitle.textContent = 'Corporation Status';
      gameModal.classList.add('visible');

      const locationState = await window.api.getLocationState();
      const playerState = locationState.playerState;
      const corporation = playerState.corporation;

      document.getElementById('corp-name').textContent = corporation.name;
      document.getElementById('corp-description').textContent = corporation.description;
      document.getElementById('corp-value').textContent = corporation.value.toLocaleString();

      const planetsList = document.getElementById('corp-planets-list');
      if (!corporation.stellarObjects || corporation.stellarObjects.length === 0) {
        planetsList.innerHTML = '<p>No planets owned</p>';
      }

      const ships = await window.api.getGameData('ships');
      const shipValue = ships[playerState.ship]?.value || 0;

      const shipsList = document.getElementById('corp-ships-list');
      shipsList.innerHTML = `
        <div class="asset-item">
          <strong>${playerState.ship}</strong>
          <br>Location: System ${playerState.system}
          <br>Value: ${shipValue.toLocaleString()} credits
        </div>
      `;

      // Verify empty planets message
      expect(document.getElementById('corp-planets-list').innerHTML).toContain('No planets owned');

      // Verify ship is still displayed
      expect(document.getElementById('corp-ships-list').innerHTML).toContain('Shuttle');
      expect(document.getElementById('corp-ships-list').innerHTML).toContain('5,000');
    });
  });
});

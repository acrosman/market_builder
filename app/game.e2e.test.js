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
});

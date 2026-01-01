const fs = require('fs');
const path = require('path');
const { Game, Player, NPC } = require('./game');

// Helper function to create complete player data for tests
function createTestPlayerData(overrides = {}) {
  return {
    name: 'TestPlayer',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Test player description',
    corporation: {
      name: 'Test Corp',
      description: 'A test corporation'
    },
    ...overrides
  };
}

describe('Game Module', () => {
  let mockUniverse;
  let mockSettings;
  let savesDir;

  beforeEach(() => {
    // Setup mock universe
    mockUniverse = {
      systems: [
        { id: 0, name: 'Alpha' },
        { id: 1, name: 'Beta' },
        { id: 2, name: 'Gamma' }
      ],
      stellarObjects: [
        { id: 0, type: 'Planet', location: 0 },
        { id: 1, type: 'Station', location: 1 }
      ]
    };

    // Setup mock settings
    mockSettings = {
      initial_ship: 'Shuttle',
      food_per_person: 1,
      game_turn_limit: 100,
      starting_credits: 1000
    };

    // Create saves directory if it doesn't exist
    savesDir = path.join(__dirname, '../saves');
    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir);
    }
  });

  afterEach(() => {
    // Clean up test save files
    const testSavePath = path.join(savesDir, 'test-save.json');
    if (fs.existsSync(testSavePath)) {
      fs.unlinkSync(testSavePath);
    }
  });

  describe('Player Class', () => {
    test('initializes with correct default values', () => {
      const player = new Player('TestPlayer', mockSettings);

      expect(player.name).toBe('TestPlayer');
      expect(player.credits).toBe(mockSettings.starting_credits);
      expect(player.location).toBe(1);
      expect(player.ship).toBe(mockSettings.initial_ship);
      expect(player.cargo).toEqual({});
      expect(player.stats).toEqual({
        jumps: 0,
        trades: 0,
        profit: 0
      });
    });
  });

  describe('NPC Class', () => {
    test('initializes with correct values', () => {
      const npc = new NPC(1, 'trader', 2);

      expect(npc.id).toBe(1);
      expect(npc.type).toBe('trader');
      expect(npc.homeSystem).toBe(2);
      expect(npc.currentSystem).toBe(2);
      expect(npc.credits).toBe(mockSettings.starting_credits);
      expect(npc.ship).toBe('Shuttle');
      expect(npc.cargo).toEqual({});
    });
  });

  describe('Game Class', () => {
    let game;

    beforeEach(() => {
      game = new Game(mockUniverse, mockSettings);
    });

    test('initializes with correct default values', () => {
      expect(game.universe).toBe(mockUniverse);
      expect(game.settings).toBe(mockSettings);
      expect(game.player).toBeNull();
      expect(game.npcs).toEqual([]);
      expect(game.turn).toBe(0);
      expect(game.gameOver).toBe(false);
    });

    test('initializes game with player and NPCs', () => {
      const playerData = createTestPlayerData();

      game.initializeGame(playerData);

      expect(game.player).toBeTruthy();
      expect(game.player.name).toBe('TestPlayer');
      expect(game.player.pronouns).toEqual(playerData.pronouns);
      expect(game.player.description).toBe(playerData.description);
      expect(game.player.corporation).toEqual(playerData.corporation);
      expect(game.player.corporation.name).toBe('Test Corp');
      expect(game.npcs.length).toBe(2); // One for each system except starting system
    });

    test('initializes game with fallback corporation data when not provided', () => {
      const playerData = {
        name: 'TestPlayer',
        pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
        description: 'Test player description'
        // No corporation data
      };

      game.initializeGame(playerData);

      expect(game.player.corporation).toBeDefined();
      expect(game.player.corporation.name).toBe('Unknown Corp');
      expect(game.player.corporation.description).toBe('A trading company');
    });

    test('processes turn and updates game state', () => {
      game.initializeGame('TestPlayer');
      game.processTurn();

      expect(game.turn).toBe(1);
      expect(game.gameOver).toBe(false);
    });

    test('ends game when turn limit reached', () => {
      game.settings.game_turn_limit = 2;
      game.initializeGame('TestPlayer');

      game.processTurn();
      expect(game.gameOver).toBe(false);

      game.processTurn();
      expect(game.gameOver).toBe(true);
    });

    test('gets current location state', () => {
      game.initializeGame('TestPlayer');
      const state = game.getCurrentLocationState();

      expect(state.system).toBe(mockUniverse.systems[1]);
      expect(state.objects).toEqual([mockUniverse.stellarObjects[1]]);
      expect(Array.isArray(state.npcs)).toBe(true);
    });

    test('gets player state', () => {
      const playerData = createTestPlayerData();

      game.initializeGame(playerData);
      const state = game.getPlayerState();

      expect(state.name).toBe('TestPlayer');
      expect(state.credits).toBe(mockSettings.starting_credits);
      expect(state.ship).toBe(mockSettings.initial_ship);
      expect(state.cargo).toEqual({});
      expect(state.stats).toBeTruthy();
    });

    describe('Save and Load', () => {
      const testFilename = 'test-save';
      const playerData = {
        name: 'TestPlayer',
        pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
        description: 'Test player description'
      };

      beforeEach(() => {
        game.initializeGame(playerData);
      });

      test('saves game state to file and loads it back', () => {
        // Save the game
        game.saveGame(testFilename);

        // Verify file exists.
        const savePath = path.join(savesDir, `${testFilename}.json`);
        expect(fs.existsSync(savePath)).toBe(true);

        // Load the game (from filename)
        const loadedGame = Game.loadGame(testFilename);

        // Verify loaded game state matches original (compare core properties)
        expect(loadedGame).toBeInstanceOf(Game);
        expect(loadedGame.player.name).toBe(playerData.name);
        expect(loadedGame.settings).toEqual(mockSettings);
        // Compare systems and stellarObjects shapes rather than full instance equality
        const loadedSystems = loadedGame.universe.systems.map(s => ({ id: s.id, name: s.name }));
        expect(loadedSystems).toEqual(mockUniverse.systems);
        const loadedObjects = loadedGame.universe.stellarObjects.map(o => ({ id: o.id, type: o.type, location: o.location }));
        expect(loadedObjects).toEqual(mockUniverse.stellarObjects);
        expect(loadedGame.turn).toBe(game.turn);
        expect(loadedGame.npcs.length).toBe(game.npcs.length);
      });

      test('throws error when loading non-existent save file', () => {
        expect(() => {
          Game.loadGame('non-existent-save');
        }).toThrow();
      });
    });

    describe('Docking', () => {
      test('dockAtStation returns success when docking at valid station', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0; // Set player location to system 0

        // Update mock data to have a station
        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Trading Post', location: 0, className: 'Trading Post' }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(result.dockedObject.name).toBe('Trading Post');
        expect(game.player.dockedAt).toBe(100);
        expect(game.player.landedOn).toBeNull();
        expect(game.player.stats.trades).toBe(1);
      });

      test('dockAtStation returns error when station does not exist', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.universe.stellarObjects = [];

        const result = game.dockAtStation(999);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Station does not exist');
      });

      test('dockAtStation returns error when station is not in current system', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Trading Post', location: 1 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Station is not in your current system');
      });

      test('dockAtStation returns error when trying to dock at non-station', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Cannot dock at this object');
      });
    });

    describe('Landing', () => {
      test('landOnPlanet returns success when landing on valid planet', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(result.landedObject.name).toBe('Earth');
        expect(game.player.landedOn).toBe(100);
        expect(game.player.dockedAt).toBeNull();
        expect(game.player.stats.trades).toBe(1);
      });

      test('landOnPlanet returns success when landing on valid asteroid', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Asteroid', name: 'IceAsteroid', location: 0, className: 'Ice' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(result.landedObject.name).toBe('IceAsteroid');
        expect(game.player.landedOn).toBe(100);
      });

      test('landOnPlanet returns error when planet does not exist', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.universe.stellarObjects = [];

        const result = game.landOnPlanet(999);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Planet does not exist');
      });

      test('landOnPlanet returns error when planet is not in current system', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 1 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Planet is not in your current system');
      });

      test('landOnPlanet returns error when trying to land on non-planet/asteroid', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Can only land on planets or asteroids');
      });

      test('landing clears previous docked status', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.player.dockedAt = 50; // Previously docked

        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.player.landedOn).toBe(100);
        expect(game.player.dockedAt).toBeNull();
      });

      test('docking clears previous landed status', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.player.landedOn = 50; // Previously landed

        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(game.player.dockedAt).toBe(100);
        expect(game.player.landedOn).toBeNull();
      });
    });
  });
});

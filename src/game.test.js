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
        {
          id: 0,
          type: 'Planet',
          className: 'Earth-like',
          location: 0,
          value: 0,
          owner: 'Independent',
          calculateValue: function (baseValues) {
            this.value = 10000;
            return this.value;
          },
          setOwner: function (ownerName) {
            this.owner = ownerName || 'Independent';
          },
          onTick: function (data) {
            // Mock tick handler for tests
          }
        },
        {
          id: 1,
          type: 'Station',
          className: 'Trading Post',
          location: 1,
          value: 0,
          owner: 'Independent',
          calculateValue: function (baseValues) {
            this.value = 5000;
            return this.value;
          },
          setOwner: function (ownerName) {
            this.owner = ownerName || 'Independent';
          },
          onTick: function (data) {
            // Mock tick handler for tests
          }
        },
        {
          id: 2,
          type: 'Planet',
          className: 'Farm World',
          location: 2,
          value: 0,
          owner: 'Independent',
          calculateValue: function (baseValues) {
            this.value = 15000;
            return this.value;
          },
          setOwner: function (ownerName) {
            this.owner = ownerName || 'Independent';
          },
          onTick: function (data) {
            // Mock tick handler for tests
          }
        }
      ]
    };

    // Setup mock settings
    mockSettings = {
      initial_ship: 'Cargo Hauler',
      food_per_person: 1,
      starting_credits: 1000,
      data_directory: 'data/default/en-us'
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
      expect(npc.credits).toBe(1000);
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
    });

    test('initializes game with player and NPCs', () => {
      const playerData = createTestPlayerData();

      game.initializeGame(playerData);

      expect(game.player).toBeTruthy();
      expect(game.player.name).toBe('TestPlayer');
      expect(game.player.pronouns).toEqual(playerData.pronouns);
      expect(game.player.description).toBe(playerData.description);
      expect(game.player.corporation).toBeTruthy();
      expect(game.player.corporation.name).toBe('Test Corp');
      expect(game.player.corporation.description).toBe('A test corporation');
      expect(game.player.corporation.isPlayerOwned).toBe(true);
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

    test('assigns a Farm World planet to player corporation during initialization', () => {
      const playerData = createTestPlayerData();

      // Ensure we have enough objects to get a Farm World
      const testUniverse = {
        systems: [
          { id: 1, name: 'Alpha' },
          { id: 2, name: 'Beta' }
        ],
        stellarObjects: [
          {
            id: 0,
            type: 'Planet',
            className: 'Earth-like',
            location: 1,
            value: 0,
            owner: 'Independent',
            calculateValue: function (baseValues) {
              this.value = 10000;
              return this.value;
            },
            setOwner: function (ownerName) {
              this.owner = ownerName || 'Independent';
            },
            onTick: function (data) {
              // Mock tick handler for tests
            }
          },
          {
            id: 1,
            type: 'Planet',
            className: 'Farm World',
            location: 2,
            value: 0,
            owner: 'Independent',
            calculateValue: function (baseValues) {
              this.value = 15000;
              return this.value;
            },
            setOwner: function (ownerName) {
              this.owner = ownerName || 'Independent';
            },
            onTick: function (data) {
              // Mock tick handler for tests
            }
          }
        ]
      };

      const testGame = new Game(testUniverse, mockSettings);
      testGame.initializeGame(playerData);

      // Check that a Farm World planet was found and assigned
      const farmPlanet = testUniverse.stellarObjects.find(obj =>
        obj.type === 'Planet' &&
        obj.className === 'Farm World'
      );

      expect(farmPlanet).toBeDefined();
      expect(farmPlanet.owner).toBe(testGame.player.corporation.name);
      expect(testGame.player.corporation.stellarObjects).toContain(farmPlanet.id);
    });

    test('does not assign Farm World if none exists outside system 1', () => {
      // Create a universe with no Farm World outside system 1
      const limitedUniverse = {
        systems: mockUniverse.systems,
        stellarObjects: [
          {
            id: 0,
            type: 'Planet',
            className: 'Earth-like',
            location: 1,
            value: 0,
            owner: 'Independent',
            calculateValue: function (baseValues) {
              this.value = 10000;
              return this.value;
            },
            setOwner: function (ownerName) {
              this.owner = ownerName || 'Independent';
            },
            onTick: function (data) {
              // Mock tick handler for tests
            }
          }
        ]
      };

      const limitedGame = new Game(limitedUniverse, mockSettings);
      const playerData = createTestPlayerData();

      limitedGame.initializeGame(playerData);

      // Corporation should exist but have no stellar objects
      expect(limitedGame.player.corporation.stellarObjects.length).toBe(0);
    });

    test('processes turn and updates game state', () => {
      game.initializeGame(createTestPlayerData());
      game.processTurn();

      expect(game.turn).toBe(1);
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
      expect(state.corporation).toBeTruthy();
      expect(state.corporation.name).toBe('Test Corp');
      expect(state.corporation.description).toBe('A test corporation');
      expect(typeof state.corporation.value).toBe('number');
      expect(state.corporation.value).toBeGreaterThanOrEqual(0);
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
        const expectedObjects = mockUniverse.stellarObjects.map(o => ({ id: o.id, type: o.type, location: o.location }));
        expect(loadedObjects).toEqual(expectedObjects);
        expect(loadedGame.turn).toBe(game.turn);
        expect(loadedGame.npcs.length).toBe(game.npcs.length);
      });

      test('throws error when loading non-existent save file', () => {
        expect(() => {
          Game.loadGame('non-existent-save');
        }).toThrow();
      });

      test('saves and loads stellar object population data', () => {
        // Modify population of a stellar object
        const stellarObj = game.universe.stellarObjects[0];
        const originalPopulation = {
          current: 5000,
          limit: 10000,
          growthRate: 2.5
        };
        stellarObj.population = { ...originalPopulation };

        // Save the game
        game.saveGame(testFilename);

        // Load the game
        const loadedGame = Game.loadGame(testFilename);

        // Verify population was preserved
        const loadedObj = loadedGame.universe.stellarObjects[0];
        expect(loadedObj.population).toBeDefined();
        expect(loadedObj.population.current).toBe(originalPopulation.current);
        expect(loadedObj.population.limit).toBe(originalPopulation.limit);
        expect(loadedObj.population.growthRate).toBe(originalPopulation.growthRate);
      });

      test('saves and loads buildings and construction queue', () => {
        // Add some buildings and construction queue items
        const stellarObj = game.universe.stellarObjects[0];
        stellarObj.buildings = { 'Mine': { count: 2 }, 'Warehouse': { count: 1 } };
        stellarObj.buildingsUnderConstruction = [{ type: 'Mine', ticksRemaining: 5 }];
        stellarObj.fighters = 10;

        // Save the game
        game.saveGame(testFilename);

        // Load the game
        const loadedGame = Game.loadGame(testFilename);

        // Verify buildings state was preserved
        const loadedObj = loadedGame.universe.stellarObjects[0];
        expect(loadedObj.buildings).toEqual({ 'Mine': { count: 2 }, 'Warehouse': { count: 1 } });
        expect(loadedObj.buildingsUnderConstruction).toEqual([{ type: 'Mine', ticksRemaining: 5 }]);
        expect(loadedObj.fighters).toBe(10);
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

      test('docking at station fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        // Deplete ship energy to simulate having traveled
        const maxEnergy = game.player.shipMaxEnergy;
        game.player.shipEnergy = maxEnergy * 0.3; // 30% energy remaining

        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(game.player.shipEnergy).toBe(maxEnergy);
        expect(game.player.shipEnergy).toBe(game.player.shipMaxEnergy);
      });

      test('landing on planet fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        // Deplete ship energy to simulate having traveled
        const maxEnergy = game.player.shipMaxEnergy;
        game.player.shipEnergy = maxEnergy * 0.5; // 50% energy remaining

        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.player.shipEnergy).toBe(maxEnergy);
        expect(game.player.shipEnergy).toBe(game.player.shipMaxEnergy);
      });

      test('landing on asteroid fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        // Deplete ship energy significantly
        const maxEnergy = game.player.shipMaxEnergy;
        game.player.shipEnergy = 100; // Very low energy

        game.universe.stellarObjects = [
          { id: 100, type: 'Asteroid', name: 'Mining Base', location: 0, className: 'Metal' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.player.shipEnergy).toBe(maxEnergy);
        expect(game.player.shipEnergy).toBe(game.player.shipMaxEnergy);
      });
    });
  });

  describe('Time Tick System', () => {
    describe('advanceTicks', () => {
      test('should increment ticks counter', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        expect(game.ticks).toBe(0);

        game.advanceTicks(1, 'test');
        expect(game.ticks).toBe(1);

        game.advanceTicks(5, 'test');
        expect(game.ticks).toBe(6);
      });

      test('should emit tick event with correct data', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        const result = game.advanceTicks(1, 'jump');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            ticks: 1,
            action: 'jump'
          })
        );
        expect(result).toEqual({ ticks: 1, action: 'jump' });
      });

      test('should emit multiple tick events for multiple advances', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.advanceTicks(1, 'jump');
        game.advanceTicks(1, 'dock');
        game.advanceTicks(1, 'land');

        expect(listener).toHaveBeenCalledTimes(3);
        expect(game.ticks).toBe(3);
      });

      test('should emit one event per tick when advancing multiple ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.advanceTicks(5, 'test');

        // Should emit 5 separate events, one for each tick
        expect(listener).toHaveBeenCalledTimes(5);
        expect(game.ticks).toBe(5);

        // Verify each call had incrementing tick counts
        expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ ticks: 1 }));
        expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ ticks: 2 }));
        expect(listener).toHaveBeenNthCalledWith(3, expect.objectContaining({ ticks: 3 }));
        expect(listener).toHaveBeenNthCalledWith(4, expect.objectContaining({ ticks: 4 }));
        expect(listener).toHaveBeenNthCalledWith(5, expect.objectContaining({ ticks: 5 }));
      });
    });

    describe('tick events on player actions', () => {
      test('jumpToSystem should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.universe.systems = [
          { id: 0, name: 'Alpha', connections: { 1: 5 } }, // 5 tick cost to jump to system 1
          { id: 1, name: 'Beta', connections: { 0: 5 } }
        ];

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.jumpToSystem(1);

        expect(game.ticks).toBe(5); // Should advance by connection cost
        expect(listener).toHaveBeenCalledTimes(5); // Should emit 5 tick events
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'jump' })
        );
      });

      test('dockAtStation should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.universe.stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station Alpha', location: 0 }
        ];

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.dockAtStation(100);

        expect(game.ticks).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'dock' })
        );
      });

      test('landOnPlanet should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.landOnPlanet(100);

        expect(game.ticks).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'land' })
        );
      });

      test('takeOff should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.player.landedOn = 100;

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.takeOff();

        expect(game.ticks).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'takeoff' })
        );
      });

      test('multiple actions should accumulate ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.universe.systems = [
          { id: 0, name: 'Alpha', connections: { 1: 3 } }, // 3 tick cost
          { id: 1, name: 'Beta', connections: { 0: 3 } }
        ];
        game.universe.stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 1, className: 'Earth-like' }
        ];

        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        game.jumpToSystem(1);
        expect(game.ticks).toBe(3); // Jump costs 3 ticks

        game.landOnPlanet(100);
        expect(game.ticks).toBe(4); // Land costs 1 tick

        game.takeOff();
        expect(game.ticks).toBe(5); // Takeoff costs 1 tick

        expect(listener).toHaveBeenCalledTimes(5); // 3 + 1 + 1 = 5 total tick events
      });
    });

    describe('save and load with ticks', () => {
      test('should save and restore tick count', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Advance ticks
        game.advanceTicks(10, 'test');
        expect(game.ticks).toBe(10);

        // Save and load
        const saveData = game.getSaveData();
        expect(saveData.ticks).toBe(10);

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.ticks).toBe(10);
      });

      test('should initialize ticks to 0 for old saves without ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Create save data without ticks property (simulating old save)
        const saveData = game.getSaveData();
        delete saveData.ticks;

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.ticks).toBe(0);
      });

      test('should recreate EventBus on load', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Add a listener to the original game
        const listener = jest.fn();
        game.eventBus.on('tick', listener);

        // Save and load
        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);

        // Original listener should not be called (new EventBus instance)
        loadedGame.advanceTicks(1, 'test');
        expect(listener).not.toHaveBeenCalled();

        // But the new game should have a functioning EventBus
        const newListener = jest.fn();
        loadedGame.eventBus.on('tick', newListener);
        loadedGame.advanceTicks(1, 'test');
        expect(newListener).toHaveBeenCalled();
      });

      test('should save and restore player corporation with stellar objects', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Verify corporation has stellar objects before save
        expect(game.player.corporation).toBeDefined();
        expect(game.player.corporation.stellarObjects.length).toBeGreaterThan(0);
        const originalCorpName = game.player.corporation.name;
        const originalStellarObjects = [...game.player.corporation.stellarObjects];

        // Save and load
        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);

        // Verify corporation was restored
        expect(loadedGame.player.corporation).toBeDefined();
        expect(loadedGame.player.corporation.name).toBe(originalCorpName);
        expect(loadedGame.player.corporation.stellarObjects).toEqual(originalStellarObjects);

        // Verify corporation has proper class methods
        expect(typeof loadedGame.player.corporation.addStellarObject).toBe('function');
        expect(typeof loadedGame.player.corporation.calculateTotalValue).toBe('function');

        // Verify corporations array was restored
        expect(loadedGame.corporations).toBeDefined();
        expect(loadedGame.corporations.length).toBeGreaterThan(0);
        expect(loadedGame.corporations[0].name).toBe(originalCorpName);
      });
    });
  });

  describe('Trading System', () => {
    /**
     * Helper function to create test game with market-enabled stellar object
     */
    function createTestGameWithMarket() {
      const { Universe, System } = require('./universe');
      const universe = new Universe();
      const system1 = new System(1, 'Test System');
      universe.systems.push(system1);

      // Create a stellar object with market capability
      const { StellarObject } = require('./stellarObject');
      const dataDir = 'data/default/en-us';
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
      );

      const planetData = stellarObjectsData.Planet;
      const stellarObject = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        1,
        planetData,
        'Test Planet',
        dataDir
      );

      universe.stellarObjects.push(stellarObject);

      const settings = {
        starting_credits: 10000,
        initial_ship: 'Cargo Hauler',
        data_directory: dataDir
      };

      const game = new Game(universe, settings);
      const playerData = {
        name: 'Test Captain',
        corporationName: 'Test Corp'
      };
      game.initializeGame(playerData);

      // Override market inventory AFTER initializeGame (which calls initializeMarkets)
      // This allows tests to control exact inventory amounts
      stellarObject.marketState.inventory = {
        wheat: 100,
        water: 50,
        bread: 20
      };
      stellarObject.marketState.prices = {
        wheat: 10,
        water: 8,
        bread: 40
      };

      // Land on the planet to enable trading
      game.player.landedOn = 1;
      game.player.location = 1;

      return { game, stellarObject, settings };
    }

    describe('buyGood', () => {
      test('should successfully buy goods when all conditions are met', () => {
        const { game, stellarObject } = createTestGameWithMarket();
        const initialCredits = game.player.credits;
        const initialInventory = stellarObject.marketState.inventory.wheat;

        const result = game.buyGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Bought 10 units of wheat');
        expect(game.player.credits).toBe(initialCredits - 100);
        expect(game.player.cargo.wheat).toBe(10);
        expect(stellarObject.marketState.inventory.wheat).toBe(initialInventory - 10);
      });

      test('should fail when stellar object not found', () => {
        const { game } = createTestGameWithMarket();

        const result = game.buyGood(999, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Stellar object not found');
      });

      test('should fail when no market available', () => {
        const { game } = createTestGameWithMarket();

        // Create object without market
        const { StellarObject } = require('./stellarObject');
        const stellarObjectsData = JSON.parse(
          fs.readFileSync(path.join(__dirname, '..', 'data/default/en-us/stellarObjects.json'), 'utf-8')
        );
        const asteroidData = stellarObjectsData.Asteroid;
        const asteroid = new StellarObject(
          2,
          'Asteroid',
          'Ice',
          1,
          asteroidData,
          'Test Asteroid',
          'data/default/en-us'
        );
        game.universe.stellarObjects.push(asteroid);

        const result = game.buyGood(2, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toBe('No market available at this location');
      });

      test('should fail when insufficient goods available', () => {
        const { game } = createTestGameWithMarket();

        const result = game.buyGood(1, 'wheat', 200, 10);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Only');
        expect(result.message).toContain('units available');
      });

      test('should fail when insufficient credits', () => {
        const { game } = createTestGameWithMarket();
        game.player.credits = 50;

        const result = game.buyGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Insufficient credits');
      });

      test('should fail when insufficient cargo space', () => {
        const { game } = createTestGameWithMarket();

        // Fill cargo to near capacity (Cargo Hauler has 1000 ton capacity)
        game.player.cargo.wheat = 990; // wheat is 1 ton per unit

        const result = game.buyGood(1, 'wheat', 20, 10);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Insufficient cargo space');
      });

      test('should fail when good is unknown', () => {
        const { game, stellarObject } = createTestGameWithMarket();
        stellarObject.marketState.inventory.unknownGood = 100;

        const result = game.buyGood(1, 'unknownGood', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Unknown good');
      });
    });

    describe('sellGood', () => {
      test('should successfully sell goods when all conditions are met', () => {
        const { game, stellarObject } = createTestGameWithMarket();
        game.player.cargo.wheat = 20;
        const initialCredits = game.player.credits;
        const initialInventory = stellarObject.marketState.inventory.wheat;

        const result = game.sellGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Sold 10 units of wheat');
        expect(game.player.credits).toBe(initialCredits + 100);
        expect(game.player.cargo.wheat).toBe(10);
        expect(stellarObject.marketState.inventory.wheat).toBe(initialInventory + 10);
      });

      test('should remove cargo entry when selling all units', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 10;

        const result = game.sellGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(true);
        expect(game.player.cargo.wheat).toBeUndefined();
      });

      test('should fail when stellar object not found', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 10;

        const result = game.sellGood(999, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Stellar object not found');
      });

      test('should fail when no market available', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 10;

        // Create object without market
        const { StellarObject } = require('./stellarObject');
        const stellarObjectsData = JSON.parse(
          fs.readFileSync(path.join(__dirname, '..', 'data/default/en-us/stellarObjects.json'), 'utf-8')
        );
        const asteroidData = stellarObjectsData.Asteroid;
        const asteroid = new StellarObject(
          2,
          'Asteroid',
          'Ice',
          1,
          asteroidData,
          'Test Asteroid',
          'data/default/en-us'
        );
        game.universe.stellarObjects.push(asteroid);

        const result = game.sellGood(2, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toBe('No market available at this location');
      });

      test('should fail when player does not have enough goods', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 5;

        const result = game.sellGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toContain('You only have 5 units');
      });

      test('should fail when player has no goods at all', () => {
        const { game } = createTestGameWithMarket();

        const result = game.sellGood(1, 'wheat', 10, 10);

        expect(result.success).toBe(false);
        expect(result.message).toContain('You only have 0 units');
      });
    });

    describe('loadPassengers', () => {
      test('should successfully load passengers when conditions are met', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 75% of limit
        stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.75);
        const initialPopulation = stellarObject.population.current;

        const result = game.loadPassengers(1, 100);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Loaded 100 passengers');
        expect(game.player.cargo.passengers).toBe(100);
        expect(stellarObject.population.current).toBe(initialPopulation - 100);
      });

      test('should fail when stellar object not found', () => {
        const { game } = createTestGameWithMarket();

        const result = game.loadPassengers(999, 100);

        expect(result.success).toBe(false);
        expect(result.message).toBe('Stellar object not found');
      });

      test('should fail when population is below 25%', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 20% of limit
        stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.20);

        const result = game.loadPassengers(1, 100);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Population is too low');
      });

      test('should fail when requesting more passengers than available', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 50% of limit
        stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.50);

        // Calculate available passengers: at 50%, willing = ((50-25)/75)*50 = 16.67%
        const willingPercent = ((50 - 25) / 75) * 50;
        const availablePassengers = Math.floor((stellarObject.population.current * willingPercent) / 100);

        const result = game.loadPassengers(1, availablePassengers + 1000);

        expect(result.success).toBe(false);
        expect(result.message).toContain('passengers available');
      });

      test('should fail when insufficient cargo space', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 100% of limit
        stellarObject.population.current = stellarObject.population.limit;

        // Fill cargo to near capacity (Cargo Hauler has 1000 ton capacity)
        game.player.cargo.wheat = 995; // wheat is 1 ton per unit, leaves 5 tons = 50 passengers

        const result = game.loadPassengers(1, 100);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Insufficient cargo space');
      });

      test('should calculate passenger availability correctly at 100% population', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 100% of limit
        stellarObject.population.current = stellarObject.population.limit;

        // At 100%, willing = ((100-25)/75)*50 = 50%
        const expectedAvailable = Math.floor(stellarObject.population.current * 0.5);

        // Make sure we have enough cargo space (passengers need 1 ton per 10 people)
        // Limit to what cargo can hold
        const cargoSpace = 1000; // Cargo Hauler capacity
        const maxPassengersBySpace = cargoSpace * 10;
        const passengersToLoad = Math.min(expectedAvailable, maxPassengersBySpace);

        const result = game.loadPassengers(1, passengersToLoad);

        expect(result.success).toBe(true);
      });

      test('should accumulate passengers in cargo', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Set population to 100% of limit
        stellarObject.population.current = stellarObject.population.limit;

        game.player.cargo.passengers = 50;

        const result = game.loadPassengers(1, 100);

        expect(result.success).toBe(true);
        expect(game.player.cargo.passengers).toBe(150);
      });
    });

    describe('unloadPassengers', () => {
      test('should unload passengers successfully', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers first
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 500);
        expect(game.player.cargo.passengers).toBe(500);

        const initialPopulation = stellarObject.population.current;

        // Unload 200 passengers
        const result = game.unloadPassengers(1, 200);
        expect(result.success).toBe(true);
        expect(game.player.cargo.passengers).toBe(300);
        expect(stellarObject.population.current).toBe(initialPopulation + 200);
      });

      test('should remove passengers from cargo when count reaches 0', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 300);
        expect(game.player.cargo.passengers).toBe(300);

        // Unload all passengers
        const result = game.unloadPassengers(1, 300);
        expect(result.success).toBe(true);
        expect(game.player.cargo.passengers).toBeUndefined();
      });

      test('should fail when trying to unload more passengers than in cargo', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 100);
        expect(game.player.cargo.passengers).toBe(100);

        // Try to unload more than available
        const result = game.unloadPassengers(1, 200);
        expect(result.success).toBe(false);
        expect(game.player.cargo.passengers).toBe(100); // Unchanged
      });

      test('should fail when no passengers in cargo', () => {
        const { game } = createTestGameWithMarket();

        const result = game.unloadPassengers(1, 50);
        expect(result.success).toBe(false);
      });

      test('should fail when location population is at capacity', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers
        stellarObject.population.current = stellarObject.population.limit - 500;
        game.loadPassengers(1, 200);
        expect(game.player.cargo.passengers).toBe(200);

        // Fill population to limit
        stellarObject.population.current = stellarObject.population.limit;

        // Try to unload passengers (should fail - no space)
        const result = game.unloadPassengers(1, 100);
        expect(result.success).toBe(false);
        expect(game.player.cargo.passengers).toBe(200); // Unchanged
      });

      test('should fail when trying to unload more than location can accept', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers
        stellarObject.population.current = stellarObject.population.limit - 1000;
        game.loadPassengers(1, 500);

        // Set population close to limit (only 100 space available)
        stellarObject.population.current = stellarObject.population.limit - 100;

        // Try to unload 200 passengers (should fail - only 100 space)
        const result = game.unloadPassengers(1, 200);
        expect(result.success).toBe(false);
      });

      test('should fail when not docked or landed', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers while landed
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 100);

        // Take off
        game.player.landedOn = null;

        // Try to unload (should fail - not landed/docked)
        const result = game.unloadPassengers(1, 50);
        expect(result.success).toBe(false);
        expect(game.player.cargo.passengers).toBe(100); // Unchanged
      });

      test('should calculate correct cargo freed when unloading', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Load passengers
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 500);

        const cargoBefore = game.calculateCargoUsed();

        // Unload 200 passengers (should free 20 tons)
        game.unloadPassengers(1, 200);

        const cargoAfter = game.calculateCargoUsed();
        expect(cargoBefore - cargoAfter).toBe(20); // 200 passengers / 10 = 20 tons
      });

      test('should allow buying goods after unloading passengers', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Ensure market has enough wheat
        stellarObject.marketState.inventory.wheat = 2000;

        // Fill cargo with passengers
        stellarObject.population.current = stellarObject.population.limit;
        game.loadPassengers(1, 10000); // 1000 tons
        expect(game.calculateCargoUsed()).toBe(1000);

        // Can't buy goods (cargo full)
        let result = game.buyGood(1, 'wheat', 10, 10);
        expect(result.success).toBe(false);

        // Unload half the passengers (frees 500 tons)
        game.unloadPassengers(1, 5000);
        expect(game.calculateCargoUsed()).toBe(500);

        // Now can buy goods
        result = game.buyGood(1, 'wheat', 400, 10);
        expect(result.success).toBe(true);
        expect(game.player.cargo.wheat).toBe(400);
      });
    });

    describe('calculateCargoUsed', () => {
      test('should calculate cargo for goods in metric tons', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 10; // 1 ton per unit = 10 tons

        const cargoUsed = game.calculateCargoUsed();

        expect(cargoUsed).toBe(10);
      });

      test('should calculate cargo for goods in kilograms', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.bread = 10; // 500kg per unit = 5 tons total

        const cargoUsed = game.calculateCargoUsed();

        expect(cargoUsed).toBe(5);
      });

      test('should calculate cargo for passengers (10 per ton)', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.passengers = 100; // 100 people = 10 tons

        const cargoUsed = game.calculateCargoUsed();

        expect(cargoUsed).toBe(10);
      });

      test('should calculate total cargo for mixed goods and passengers', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.wheat = 10; // 10 tons
        game.player.cargo.bread = 10; // 5 tons
        game.player.cargo.passengers = 50; // 5 tons

        const cargoUsed = game.calculateCargoUsed();

        expect(cargoUsed).toBe(20);
      });

      test('should return 0 for empty cargo', () => {
        const { game } = createTestGameWithMarket();

        const cargoUsed = game.calculateCargoUsed();

        expect(cargoUsed).toBe(0);
      });

      test('should handle unknown goods gracefully', () => {
        const { game } = createTestGameWithMarket();
        game.player.cargo.unknownGood = 10;

        const cargoUsed = game.calculateCargoUsed();

        // Should not throw error, just ignore unknown good
        expect(cargoUsed).toBe(0);
      });
    });

    describe('Trading integration scenarios', () => {
      test('should maintain inventory consistency across multiple trades', () => {
        const { game, stellarObject } = createTestGameWithMarket();
        const initialWheatInventory = stellarObject.marketState.inventory.wheat;
        const initialCredits = game.player.credits;

        // Buy 10 wheat
        game.buyGood(1, 'wheat', 10, 10);
        expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 10);
        expect(game.player.cargo.wheat).toBe(10);

        // Sell 5 wheat
        game.sellGood(1, 'wheat', 5, 10);
        expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 5);
        expect(game.player.cargo.wheat).toBe(5);

        // Buy 3 more wheat
        game.buyGood(1, 'wheat', 3, 10);
        expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 8);
        expect(game.player.cargo.wheat).toBe(8);
      });

      test('should respect cargo capacity across goods and passengers', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Ensure market has enough wheat
        stellarObject.marketState.inventory.wheat = 2000;

        // Cargo Hauler has 1000 ton capacity
        // Buy 900 tons of wheat
        game.buyGood(1, 'wheat', 900, 10);
        expect(game.player.cargo.wheat).toBe(900);

        // Try to buy 200 more tons (should fail)
        const result1 = game.buyGood(1, 'wheat', 200, 10);
        expect(result1.success).toBe(false);

        // Load passengers that fit (100 tons / 10 = 1000 passengers)
        stellarObject.population.current = stellarObject.population.limit; // Ensure passengers available
        const result2 = game.loadPassengers(1, 1000);
        expect(result2.success).toBe(true);
        expect(game.player.cargo.passengers).toBe(1000);

        // Try to buy more wheat (should fail - no space)
        const result3 = game.buyGood(1, 'wheat', 10, 10);
        expect(result3.success).toBe(false);
      });

      test('should handle edge case of exactly full cargo', () => {
        const { game, stellarObject } = createTestGameWithMarket();

        // Ensure market has enough wheat
        stellarObject.marketState.inventory.wheat = 2000;

        // Buy exactly 1000 tons
        game.buyGood(1, 'wheat', 1000, 10);
        expect(game.player.cargo.wheat).toBe(1000);

        const cargoUsed = game.calculateCargoUsed();
        expect(cargoUsed).toBe(1000);

        // Try to buy 1 more unit (should fail)
        const result = game.buyGood(1, 'water', 1, 5);
        expect(result.success).toBe(false);
      });
    });
  });
});

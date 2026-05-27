const fs = require('fs');
const path = require('path');
const { Game } = require('./game');
const { Player } = require('./player');
const { NPC } = require('./npc');

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
      expect(state.corporation.cashReserves).toBe(0);
      expect(state.corporation.totalCashReserves).toBe(0);
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

    describe('Building Construction', () => {
      function createBuildableObject(overrides = {}) {
        const baseObject = {
          id: 100,
          type: 'Planet',
          className: 'Earth-like',
          name: 'Build World',
          location: 0,
          owner: 'Test Corp',
          capabilities: { buildings: true, market: true, shields: true, cannons: true },
          buildingLimit: 10,
          buildingCredits: 5000,
          marketState: { inventory: { metal: 200 } },
          buildings: {},
          buildingsUnderConstruction: [],
          addBuilding: function (buildingType, buildingsData) {
            const buildingInfo = buildingsData[buildingType];
            if (!buildingInfo || this.buildingsUnderConstruction.length >= this.buildingLimit) {
              return false;
            }
            this.buildingsUnderConstruction.push({
              type: buildingType,
              ticksRemaining: buildingInfo.buildCost.ticks
            });
            return true;
          },
          onTick: function ({ ticks }) {
            for (let i = this.buildingsUnderConstruction.length - 1; i >= 0; i--) {
              this.buildingsUnderConstruction[i].ticksRemaining -= ticks;
              if (this.buildingsUnderConstruction[i].ticksRemaining <= 0) {
                const finishedType = this.buildingsUnderConstruction[i].type;
                this.buildings[finishedType] = this.buildings[finishedType] || { count: 0 };
                this.buildings[finishedType].count += 1;
                this.buildingsUnderConstruction.splice(i, 1);
              }
            }
          }
        };
        return {
          ...baseObject,
          ...overrides,
          capabilities: { ...baseObject.capabilities, ...(overrides.capabilities || {}) }
        };
      }

      test('returns buildable buildings when docked at controlled object with resources', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        const object = createBuildableObject();
        game.universe.stellarObjects = [object];
        game.player.dockedAt = object.id;

        const options = game.getBuildableBuildingsAtCurrentLocation();

        expect(options.length).toBeGreaterThan(0);
        expect(options.some(opt => opt.type === 'Mine')).toBe(true);
      });

      test('buildBuildingAtCurrentLocation rejects when player does not control object', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        const object = createBuildableObject({ owner: 'Rival Corp' });
        game.universe.stellarObjects = [object];
        game.player.landedOn = object.id;

        const result = game.buildBuildingAtCurrentLocation('Mine');

        expect(result.success).toBe(false);
        expect(result.reason).toBe('You do not control this stellar object');
      });

      test('buildBuildingAtCurrentLocation queues construction and deducts local resources', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        const object = createBuildableObject({
          buildingCredits: 600,
          marketState: { inventory: { metal: 20 } }
        });
        game.universe.stellarObjects = [object];
        game.player.landedOn = object.id;

        const result = game.buildBuildingAtCurrentLocation('Mine');

        expect(result.success).toBe(true);
        expect(result.ticksRemaining).toBe(10);
        expect(object.buildingsUnderConstruction).toEqual([{ type: 'Mine', ticksRemaining: 10 }]);
        expect(object.buildingCredits).toBe(100);
        expect(object.marketState.inventory.metal).toBe(10);
      });

      test('building completion only happens after required tick cost has elapsed', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;

        const object = createBuildableObject({
          buildingCredits: 2000,
          marketState: { inventory: { metal: 200 } }
        });
        game.universe.stellarObjects = [object];
        game.player.landedOn = object.id;

        const result = game.buildBuildingAtCurrentLocation('Mine');
        expect(result.success).toBe(true);
        expect(object.buildingsUnderConstruction[0].ticksRemaining).toBe(10);

        object.onTick({ ticks: 9 });
        expect(object.buildings.Mine).toBeUndefined();
        expect(object.buildingsUnderConstruction).toHaveLength(1);

        object.onTick({ ticks: 1 });
        expect(object.buildings.Mine.count).toBe(1);
        expect(object.buildingsUnderConstruction).toHaveLength(0);
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
        game.player.corporation.addCashReserve(7500);

        // Verify corporation has stellar objects before save
        expect(game.player.corporation).toBeDefined();
        expect(game.player.corporation.stellarObjects.length).toBeGreaterThan(0);
        const originalCorpName = game.player.corporation.name;
        const originalStellarObjects = [...game.player.corporation.stellarObjects];
        const originalCashReserves = game.player.corporation.cashReserves;

        // Save and load
        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);

        // Verify corporation was restored
        expect(loadedGame.player.corporation).toBeDefined();
        expect(loadedGame.player.corporation.name).toBe(originalCorpName);
        expect(loadedGame.player.corporation.stellarObjects).toEqual(originalStellarObjects);
        expect(loadedGame.player.corporation.cashReserves).toEqual(originalCashReserves);

        // Verify corporation has proper class methods
        expect(typeof loadedGame.player.corporation.addStellarObject).toBe('function');
        expect(typeof loadedGame.player.corporation.calculateTotalValue).toBe('function');

        // Verify corporations array was restored
        expect(loadedGame.corporations).toBeDefined();
        expect(loadedGame.corporations.length).toBeGreaterThan(0);
        expect(loadedGame.corporations[0].name).toBe(originalCorpName);
      });

      test('should normalize legacy object-based corporation reserves on load', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const saveData = game.getSaveData();
        saveData.corporations[0].cashReserves = { trade: 300, buildings: 200 };

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.player.corporation.cashReserves).toBe(500);
      });

      test('should allow jumping after loading a saved game', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.player.location = 0;
        game.universe.systems = [
          { id: 0, name: 'Alpha', connections: { 1: 3 } },
          { id: 1, name: 'Beta', connections: { 0: 3 } }
        ];

        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);
        const result = loadedGame.jumpToSystem(1);

        expect(result.success).toBe(true);
        expect(loadedGame.player).toBeInstanceOf(Player);
        expect(loadedGame.player.location).toBe(1);
      });
    });
  });

  describe('TakeOff', () => {
    test('takeOff returns error when not docked or landed', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.dockedAt = null;
      game.player.landedOn = null;

      const result = game.takeOff();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Not docked or landed');
    });
  });

  describe('ValidateJump', () => {
    test('validateJump returns invalid when target system does not exist', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());

      const result = game.validateJump(9999);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Target system does not exist');
    });

    test('validateJump returns invalid when no connection to target', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.location = 0;
      game.universe.systems = [
        { id: 0, name: 'Alpha', connections: {} },
        { id: 1, name: 'Beta', connections: {} }
      ];

      const result = game.validateJump(1);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No direct connection to target system');
    });

    test('validateJump returns invalid when not enough energy', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.location = 0;
      game.universe.systems = [
        { id: 0, name: 'Alpha', connections: { 1: 5 } },
        { id: 1, name: 'Beta', connections: { 0: 5 } }
      ];
      game.player.shipEnergy = 0;
      game.player.energyPerJump = 10;

      const result = game.validateJump(1);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Not enough energy for jump');
    });

    test('jumpToSystem returns error when jump is invalid', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());

      const result = game.jumpToSystem(9999);

      expect(result.success).toBe(false);
    });
  });

  describe('BuyGood and SellGood', () => {
    let game;

    beforeEach(() => {
      const { Universe, System } = require('./universe');
      const { StellarObject } = require('./stellarObject');
      const { Market } = require('./market');
      const fs = require('fs');
      const path = require('path');

      const universe = new Universe();
      const system1 = new System(1, 'Test System');
      universe.systems.push(system1);

      const dataDir = 'data/default/en-us';
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
      );

      const stellarObject = new StellarObject(
        1, 'Planet', 'Earth-like', 1, stellarObjectsData.Planet, 'Test Planet', dataDir
      );
      universe.stellarObjects.push(stellarObject);

      const settings = {
        starting_credits: 10000,
        initial_ship: 'Cargo Hauler',
        data_directory: dataDir
      };

      game = new Game(universe, settings);
      game.initializeGame(createTestPlayerData());
      game.player.location = 1;
      game.player.landedOn = 1;
      game.market.initializeMarkets();

      // Set up controlled inventory
      stellarObject.marketState.inventory = { wheat: 100 };
    });

    test('buyGood delegates to market and succeeds', () => {
      const result = game.buyGood(1, 'wheat', 5);
      expect(result.success).toBe(true);
    });

    test('buyGood delegates to market and fails when not available', () => {
      const result = game.buyGood(1, 'wheat', 999);
      expect(result.success).toBe(false);
    });

    test('sellGood delegates to market and succeeds', () => {
      game.player.cargo.wheat = 10;
      const result = game.sellGood(1, 'wheat', 5);
      expect(result.success).toBe(true);
    });

    test('sellGood delegates to market and fails when no cargo', () => {
      const result = game.sellGood(1, 'wheat', 5);
      expect(result.success).toBe(false);
    });
  });

  describe('LoadPassengers and UnloadPassengers', () => {
    let game;
    let stellarObject;

    beforeEach(() => {
      const { Universe, System } = require('./universe');
      const { StellarObject } = require('./stellarObject');
      const fs = require('fs');
      const path = require('path');

      const universe = new Universe();
      const system1 = new System(1, 'Test System');
      universe.systems.push(system1);

      const dataDir = 'data/default/en-us';
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
      );

      stellarObject = new StellarObject(
        1, 'Planet', 'Earth-like', 1, stellarObjectsData.Planet, 'Test Planet', dataDir
      );
      stellarObject.population = { current: 500000, limit: 1000000, growthRate: 2 };
      universe.stellarObjects.push(stellarObject);

      const settings = {
        starting_credits: 10000,
        initial_ship: 'Cargo Hauler',
        data_directory: dataDir
      };

      game = new Game(universe, settings);
      game.initializeGame(createTestPlayerData());
      game.player.location = 1;
      game.player.landedOn = 1;
    });

    test('loadPassengers fails when stellar object not found', () => {
      const result = game.loadPassengers(999, 10);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('loadPassengers fails when population is too low', () => {
      stellarObject.population = { current: 100, limit: 1000000, growthRate: 2 };
      const result = game.loadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('too low');
    });

    test('loadPassengers fails when requesting more than available', () => {
      const result = game.loadPassengers(1, 999999);
      expect(result.success).toBe(false);
      expect(result.message).toContain('passengers available');
    });

    test('loadPassengers succeeds with valid conditions', () => {
      const result = game.loadPassengers(1, 10);
      expect(result.success).toBe(true);
      expect(game.player.cargo.passengers).toBe(10);
    });

    test('loadPassengers fails when insufficient cargo space', () => {
      game.player.cargo.wheat = 10000; // Fill cargo
      const result = game.loadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('cargo space');
    });

    test('unloadPassengers fails when not at correct location', () => {
      game.player.cargo.passengers = 10;
      game.player.dockedAt = null;
      game.player.landedOn = null;

      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('docked or landed');
    });

    test('unloadPassengers fails when stellar object not found', () => {
      game.player.cargo.passengers = 10;
      game.player.landedOn = 999; // Set player at location 999 (which doesn't exist)
      const result = game.unloadPassengers(999, 10);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('unloadPassengers fails when no passengers on board', () => {
      const result = game.unloadPassengers(1, 5);
      expect(result.success).toBe(false);
      expect(result.message).toBe('No passengers in cargo');
    });

    test('unloadPassengers fails with invalid count', () => {
      game.player.cargo.passengers = 10;
      const result = game.unloadPassengers(1, 0);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid passenger count');
    });

    test('unloadPassengers fails when trying to unload more than carrying', () => {
      game.player.cargo.passengers = 5;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('only have 5');
    });

    test('unloadPassengers fails when population limit reached', () => {
      stellarObject.population = { current: 999990, limit: 1000000, growthRate: 2 };
      game.player.cargo.passengers = 20;
      const result = game.unloadPassengers(1, 20);
      expect(result.success).toBe(false);
      expect(result.message).toContain('only accept');
    });

    test('unloadPassengers succeeds and removes passengers entry when count reaches 0', () => {
      game.player.cargo.passengers = 10;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(true);
      expect(game.player.cargo.passengers).toBeUndefined();
    });

    test('unloadPassengers succeeds partially', () => {
      game.player.cargo.passengers = 20;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(true);
      expect(game.player.cargo.passengers).toBe(10);
    });
  });

  describe('CalculateCargoUsed and RechargeShipEnergy', () => {
    test('calculateCargoUsed delegates to market', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());

      const result = game.calculateCargoUsed();
      expect(typeof result).toBe('number');
    });

    test('rechargeShipEnergy adds energy up to max', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.shipMaxEnergy = 100;
      game.player.shipEnergy = 50;
      game.player.energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.player.shipEnergy).toBe(60);
    });

    test('rechargeShipEnergy does not exceed max energy', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.shipMaxEnergy = 100;
      game.player.shipEnergy = 95;
      game.player.energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.player.shipEnergy).toBe(100);
    });

    test('rechargeShipEnergy does nothing when at max energy', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.player.shipMaxEnergy = 100;
      game.player.shipEnergy = 100;
      game.player.energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.player.shipEnergy).toBe(100);
    });
  });
});

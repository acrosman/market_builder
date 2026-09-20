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
      expect(game.getUniverse()).toBe(mockUniverse);
      expect(game.getSettings()).toBe(mockSettings);
      expect(game.getPlayer()).toBeNull();
      expect(game.getNPCs()).toEqual([]);
      expect(game.getTurn()).toBe(0);
    });

    test('initializes game with player and NPCs', () => {
      const playerData = createTestPlayerData();

      game.initializeGame(playerData);

      expect(game.getPlayer()).toBeTruthy();
      expect(game.getPlayer().name).toBe('TestPlayer');
      expect(game.getPlayer().pronouns).toEqual(playerData.pronouns);
      expect(game.getPlayer().description).toBe(playerData.description);
      expect(game.getPlayer().corporation).toBeTruthy();
      expect(game.getPlayer().corporation.name).toBe('Test Corp');
      expect(game.getPlayer().corporation.description).toBe('A test corporation');
      expect(game.getPlayer().corporation.isPlayerOwned).toBe(true);
      expect(game.getNPCs().length).toBe(2); // One for each system except starting system
    });

    test('initializes game with fallback corporation data when not provided', () => {
      const playerData = {
        name: 'TestPlayer',
        pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
        description: 'Test player description'
        // No corporation data
      };

      game.initializeGame(playerData);

      expect(game.getPlayer().corporation).toBeDefined();
      expect(game.getPlayer().corporation.name).toBe('Unknown Corp');
      expect(game.getPlayer().corporation.description).toBe('A trading company');
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
      expect(farmPlanet.owner).toBe(testGame.getPlayer().corporation.name);
      expect(testGame.getPlayer().corporation.stellarObjects).toContain(farmPlanet.id);
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
      expect(limitedGame.getPlayer().corporation.stellarObjects.length).toBe(0);
    });

    test('processes turn and updates game state', () => {
      game.initializeGame(createTestPlayerData());
      game.processTurn();

      expect(game.getTurn()).toBe(1);
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
        expect(loadedGame.getPlayer().name).toBe(playerData.name);
        expect(loadedGame.getSettings()).toEqual(mockSettings);
        // Compare systems and stellarObjects shapes rather than full instance equality
        const loadedSystems = loadedGame.getUniverse().systems.map(s => ({ id: s.id, name: s.name }));
        expect(loadedSystems).toEqual(mockUniverse.systems);
        const loadedObjects = loadedGame.getUniverse().stellarObjects.map(o => ({ id: o.id, type: o.type, location: o.location }));
        const expectedObjects = mockUniverse.stellarObjects.map(o => ({ id: o.id, type: o.type, location: o.location }));
        expect(loadedObjects).toEqual(expectedObjects);
        expect(loadedGame.getTurn()).toBe(game.getTurn());
        expect(loadedGame.getNPCs().length).toBe(game.getNPCs().length);
      });

      test('throws error when loading non-existent save file', () => {
        expect(() => {
          Game.loadGame('non-existent-save');
        }).toThrow();
      });

      test('saves and loads stellar object population data', () => {
        // Modify population of a stellar object
        const stellarObj = game.getUniverse().stellarObjects[0];
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
        const loadedObj = loadedGame.getUniverse().stellarObjects[0];
        expect(loadedObj.population).toBeDefined();
        expect(loadedObj.population.current).toBe(originalPopulation.current);
        expect(loadedObj.population.limit).toBe(originalPopulation.limit);
        expect(loadedObj.population.growthRate).toBe(originalPopulation.growthRate);
      });

      test('saves and loads buildings and construction queue', () => {
        // Add some buildings and construction queue items
        const stellarObj = game.getUniverse().stellarObjects[0];
        stellarObj.buildings = { 'Mine': { count: 2 }, 'Warehouse': { count: 1 } };
        stellarObj.buildingsUnderConstruction = [{ type: 'Mine', ticksRemaining: 5 }];
        stellarObj.fighters = 10;

        // Save the game
        game.saveGame(testFilename);

        // Load the game
        const loadedGame = Game.loadGame(testFilename);

        // Verify buildings state was preserved
        const loadedObj = loadedGame.getUniverse().stellarObjects[0];
        expect(loadedObj.buildings).toEqual({ 'Mine': { count: 2 }, 'Warehouse': { count: 1 } });
        expect(loadedObj.buildingsUnderConstruction).toEqual([{ type: 'Mine', ticksRemaining: 5 }]);
        expect(loadedObj.fighters).toBe(10);
      });
    });

    describe('Docking', () => {
      test('dockAtStation returns success when docking at valid station', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0; // Set player location to system 0

        // Update mock data to have a station
        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Trading Post', location: 0, className: 'Trading Post' }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(result.dockedObject.name).toBe('Trading Post');
        expect(game.getPlayer().dockedAt).toBe(100);
        expect(game.getPlayer().landedOn).toBeNull();
        expect(game.getPlayer().stats.trades).toBe(1);
      });

      test('dockAtStation returns error when station does not exist', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getUniverse().stellarObjects = [];

        const result = game.dockAtStation(999);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Station does not exist');
      });

      test('dockAtStation returns error when station is not in current system', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Trading Post', location: 1 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Station is not in your current system');
      });

      test('dockAtStation returns error when trying to dock at non-station', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
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
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(result.landedObject.name).toBe('Earth');
        expect(game.getPlayer().landedOn).toBe(100);
        expect(game.getPlayer().dockedAt).toBeNull();
        expect(game.getPlayer().stats.trades).toBe(1);
      });

      test('landOnPlanet returns success when landing on valid asteroid', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Asteroid', name: 'IceAsteroid', location: 0, className: 'Ice' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(result.landedObject.name).toBe('IceAsteroid');
        expect(game.getPlayer().landedOn).toBe(100);
      });

      test('landOnPlanet returns error when planet does not exist', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getUniverse().stellarObjects = [];

        const result = game.landOnPlanet(999);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Planet does not exist');
      });

      test('landOnPlanet returns error when planet is not in current system', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 1 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Planet is not in your current system');
      });

      test('landOnPlanet returns error when trying to land on non-planet/asteroid', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(false);
        expect(result.reason).toBe('Can only land on planets or asteroids');
      });

      test('landing clears previous docked status', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getPlayer().dockedAt = 50; // Previously docked

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0 }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.getPlayer().landedOn).toBe(100);
        expect(game.getPlayer().dockedAt).toBeNull();
      });

      test('docking clears previous landed status', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getPlayer().landedOn = 50; // Previously landed

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(game.getPlayer().dockedAt).toBe(100);
        expect(game.getPlayer().landedOn).toBeNull();
      });

      test('docking at station fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        // Deplete ship energy to simulate having traveled
        const maxEnergy = game.getPlayer().shipMaxEnergy;
        game.getPlayer().shipEnergy = maxEnergy * 0.3; // 30% energy remaining

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station', location: 0 }
        ];

        const result = game.dockAtStation(100);

        expect(result.success).toBe(true);
        expect(game.getPlayer().shipEnergy).toBe(maxEnergy);
        expect(game.getPlayer().shipEnergy).toBe(game.getPlayer().shipMaxEnergy);
      });

      test('landing on planet fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        // Deplete ship energy to simulate having traveled
        const maxEnergy = game.getPlayer().shipMaxEnergy;
        game.getPlayer().shipEnergy = maxEnergy * 0.5; // 50% energy remaining

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.getPlayer().shipEnergy).toBe(maxEnergy);
        expect(game.getPlayer().shipEnergy).toBe(game.getPlayer().shipMaxEnergy);
      });

      test('landing on asteroid fully recharges ship energy', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        // Deplete ship energy significantly
        const maxEnergy = game.getPlayer().shipMaxEnergy;
        game.getPlayer().shipEnergy = 100; // Very low energy

        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Asteroid', name: 'Mining Base', location: 0, className: 'Metal' }
        ];

        const result = game.landOnPlanet(100);

        expect(result.success).toBe(true);
        expect(game.getPlayer().shipEnergy).toBe(maxEnergy);
        expect(game.getPlayer().shipEnergy).toBe(game.getPlayer().shipMaxEnergy);
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
          findControllingCorporation(player, corporations) {
            const ownedCorporations = player?.getOwnedCorporations(corporations) || [];

            return ownedCorporations.find((corporation) =>
              corporation?.name && corporation.name === this.owner
            ) ||
            ownedCorporations.find((corporation) =>
              Array.isArray(corporation?.stellarObjects) &&
              corporation.stellarObjects.some(
                (assetId) => Number(assetId) === Number(this.id)
              )
            ) ||
            null;
          },
          getBuildableBuildingOptions: jest.fn((buildingsData) => {
            if (!buildingsData || !buildingsData.Mine) {
              return [];
            }

            return [{ type: 'Mine', buildCost: buildingsData.Mine.buildCost }];
          }),
          constructBuilding: jest.fn((buildingType) => {
            if (buildingType !== 'Mine') {
              return { success: false, reason: 'Unknown building type' };
            }

            return { success: true, buildingType: 'Mine', ticksRemaining: 10 };
          })
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
        game.getPlayer().location = 0;

        const object = createBuildableObject();
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().dockedAt = object.id;

        const options = game.getBuildableBuildingsForCurrentObject();

        expect(options.length).toBeGreaterThan(0);
        expect(options.some(opt => opt.type === 'Mine')).toBe(true);
      });

      test('returns no build options when building data cannot be loaded', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject();
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().dockedAt = object.id;
        jest.spyOn(game, 'getBuildingsData').mockReturnValue(null);

        const options = game.getBuildableBuildingsForCurrentObject();

        expect(options).toEqual([]);
        expect(object.getBuildableBuildingOptions).toHaveBeenCalledWith(null);
      });

      test('lists build options even when local credits are insufficient', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject({ buildingCredits: 0 });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        const options = game.getBuildableBuildingsForCurrentObject();

        expect(options.length).toBeGreaterThan(0);
        expect(options.some(opt => opt.type === 'Mine')).toBe(true);
        expect(object.getBuildableBuildingOptions).toHaveBeenCalledWith(expect.any(Object));
      });

      test('returns buildable buildings when landed at corporation asset even if owner label is stale', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject({ owner: 'Independent' });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().corporation.stellarObjects = [object.id];
        game.getPlayer().landedOn = object.id;

        const options = game.getBuildableBuildingsForCurrentObject();

        expect(options.length).toBeGreaterThan(0);
        expect(options.some(opt => opt.type === 'Mine')).toBe(true);
      });

      test('returns buildable buildings when player corporation reference is missing but corp is marked player-owned', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject({ owner: 'Test Corp' });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().corporation = null;
        game.setCorporations([{
          name: 'Test Corp',
          isPlayerOwned: true,
          stellarObjects: [object.id]
        }]);
        game.getPlayer().landedOn = object.id;

        const options = game.getBuildableBuildingsForCurrentObject();

        expect(options.length).toBeGreaterThan(0);
        expect(options.some(opt => opt.type === 'Mine')).toBe(true);
      });

      test('buildBuildingAtCurrentObject rejects when player does not control object', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject({ owner: 'Rival Corp' });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        const result = game.buildBuildingAtCurrentObject('Mine');

        expect(result.success).toBe(false);
        expect(result.reason).toBe('You do not control this stellar object');
      });

      test('buildBuildingAtCurrentObject queues construction on the current object', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;

        const object = createBuildableObject();
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        const result = game.buildBuildingAtCurrentObject('Mine');

        expect(result.success).toBe(true);
        expect(result.ticksRemaining).toBe(10);
        expect(result.objectId).toBe(object.id);
        expect(object.constructBuilding).toHaveBeenCalledWith(
          'Mine',
          expect.any(Object),
          expect.objectContaining({
            availableCredits: expect.any(Number),
            spendCredits: expect.any(Function)
          })
        );
        expect(object.constructBuilding.mock.calls[0][1]).toEqual(expect.objectContaining({ Mine: expect.any(Object) }));
      });

      test('buildBuildingAtCurrentObject exposes corporation reserves for controlled assets', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData({
          corporation: {
            name: 'Test Corp',
            description: 'A test corporation',
            cashReserves: 700
          }
        }));
        game.getPlayer().location = 0;
        game.getPlayer().credits = 0;

        const object = createBuildableObject({ buildingCredits: 0 });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        game.buildBuildingAtCurrentObject('Mine');

        const creditSupport = object.constructBuilding.mock.calls[0][2];
        expect(creditSupport.availableCredits).toBe(700);
        expect(creditSupport.spendCredits(500)).toBe(true);
        expect(game.getPlayer().corporation.cashReserves).toBe(200);
      });

      test('buildBuildingAtCurrentObject falls back to player credits for controlled assets', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getPlayer().corporation.cashReserves = 0;

        const object = createBuildableObject({ buildingCredits: 0 });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        game.buildBuildingAtCurrentObject('Mine');

        const creditSupport = object.constructBuilding.mock.calls[0][2];
        expect(creditSupport.availableCredits).toBe(mockSettings.starting_credits);
        expect(creditSupport.spendCredits(500)).toBe(true);
        expect(game.getPlayer().credits).toBe(mockSettings.starting_credits - 500);
      });

      test('buildBuildingAtCurrentObject combines corporation and player funding when needed', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData({
          corporation: {
            name: 'Test Corp',
            description: 'A test corporation',
            cashReserves: 200
          }
        }));
        game.getPlayer().location = 0;
        game.getPlayer().credits = 400;

        const object = createBuildableObject({ buildingCredits: 0 });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        game.buildBuildingAtCurrentObject('Mine');

        const creditSupport = object.constructBuilding.mock.calls[0][2];
        expect(creditSupport.availableCredits).toBe(600);
        expect(creditSupport.spendCredits(500)).toBe(true);
        expect(game.getPlayer().corporation.cashReserves).toBe(0);
        expect(game.getPlayer().credits).toBe(100);
      });

      test('buildBuildingAtCurrentObject rolls back earlier deductions when a later funder fails', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData({
          corporation: {
            name: 'Test Corp',
            description: 'A test corporation',
            cashReserves: 200
          }
        }));
        game.getPlayer().location = 0;
        game.getPlayer().credits = 400;
        game.getPlayer().removeCredits = jest.fn(() => false);

        const object = createBuildableObject({ buildingCredits: 0 });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        game.buildBuildingAtCurrentObject('Mine');

        const creditSupport = object.constructBuilding.mock.calls[0][2];
        expect(creditSupport.spendCredits(500)).toBe(false);
        expect(game.getPlayer().corporation.cashReserves).toBe(200);
        expect(game.getPlayer().credits).toBe(400);
      });

      test('buildBuildingAtCurrentObject charges the exact owner-name match over an earlier corporation with a stale asset match', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData({
          corporation: {
            name: 'Stale Asset Corp',
            description: 'Owns a stale asset reference to the object',
            cashReserves: 900
          }
        }));
        game.getPlayer().location = 0;
        game.getPlayer().credits = 0;

        const object = createBuildableObject({ buildingCredits: 0, owner: 'Real Owner Corp' });
        game.getUniverse().stellarObjects = [object];
        game.getPlayer().landedOn = object.id;

        // The player's primary corporation (first in owned-corporation order) has a
        // stale asset reference to this object but is not its actual owner. A second,
        // later corporation is the object's exact owner and must be the one charged.
        game.getPlayer().corporation.stellarObjects = [object.id];
        game.setCorporations([
          game.getPlayer().corporation,
          {
            name: 'Real Owner Corp',
            isPlayerOwned: true,
            cashReserves: 300
          }
        ]);

        game.buildBuildingAtCurrentObject('Mine');

        const creditSupport = object.constructBuilding.mock.calls[0][2];
        expect(creditSupport.availableCredits).toBe(300);
        expect(creditSupport.spendCredits(200)).toBe(true);
        expect(game.getCorporations()[1].cashReserves).toBe(100);
        expect(game.getPlayer().corporation.cashReserves).toBe(900);
      });
    });
  });

  describe('Time Tick System', () => {
    describe('advanceTicks', () => {
      test('should increment ticks counter', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        expect(game.getTicks()).toBe(0);

        game.advanceTicks(1, 'test');
        expect(game.getTicks()).toBe(1);

        game.advanceTicks(5, 'test');
        expect(game.getTicks()).toBe(6);
      });

      test('should emit tick event with correct data', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

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
        game.getEventBus().on('tick', listener);

        game.advanceTicks(1, 'jump');
        game.advanceTicks(1, 'dock');
        game.advanceTicks(1, 'land');

        expect(listener).toHaveBeenCalledTimes(3);
        expect(game.getTicks()).toBe(3);
      });

      test('should emit one event per tick when advancing multiple ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.advanceTicks(5, 'test');

        // Should emit 5 separate events, one for each tick
        expect(listener).toHaveBeenCalledTimes(5);
        expect(game.getTicks()).toBe(5);

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
        game.getPlayer().location = 0;
        game.getUniverse().systems = [
          { id: 0, name: 'Alpha', connections: { 1: 5 } }, // 5 tick cost to jump to system 1
          { id: 1, name: 'Beta', connections: { 0: 5 } }
        ];

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.jumpToSystem(1);

        expect(game.getTicks()).toBe(5); // Should advance by connection cost
        expect(listener).toHaveBeenCalledTimes(5); // Should emit 5 tick events
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'jump' })
        );
      });

      test('dockAtStation should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Space Station', name: 'Station Alpha', location: 0 }
        ];

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.dockAtStation(100);

        expect(game.getTicks()).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'dock' })
        );
      });

      test('landOnPlanet should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 0, className: 'Earth-like' }
        ];

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.landOnPlanet(100);

        expect(game.getTicks()).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'land' })
        );
      });

      test('takeOff should advance ticks by 1', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getPlayer().landedOn = 100;

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.takeOff();

        expect(game.getTicks()).toBe(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'takeoff' })
        );
      });

      test('multiple actions should accumulate ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getUniverse().systems = [
          { id: 0, name: 'Alpha', connections: { 1: 3 } }, // 3 tick cost
          { id: 1, name: 'Beta', connections: { 0: 3 } }
        ];
        game.getUniverse().stellarObjects = [
          { id: 100, type: 'Planet', name: 'Earth', location: 1, className: 'Earth-like' }
        ];

        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        game.jumpToSystem(1);
        expect(game.getTicks()).toBe(3); // Jump costs 3 ticks

        game.landOnPlanet(100);
        expect(game.getTicks()).toBe(4); // Land costs 1 tick

        game.takeOff();
        expect(game.getTicks()).toBe(5); // Takeoff costs 1 tick

        expect(listener).toHaveBeenCalledTimes(5); // 3 + 1 + 1 = 5 total tick events
      });
    });

    describe('save and load with ticks', () => {
      test('should save and restore tick count', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Advance ticks
        game.advanceTicks(10, 'test');
        expect(game.getTicks()).toBe(10);

        // Save and load
        const saveData = game.getSaveData();
        expect(saveData.ticks).toBe(10);

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.getTicks()).toBe(10);
      });

      test('should initialize ticks to 0 for old saves without ticks', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Create save data without ticks property (simulating old save)
        const saveData = game.getSaveData();
        delete saveData.ticks;

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.getTicks()).toBe(0);
      });

      test('should recreate EventBus on load', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        // Add a listener to the original game
        const listener = jest.fn();
        game.getEventBus().on('tick', listener);

        // Save and load
        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);

        // Original listener should not be called (new EventBus instance)
        loadedGame.advanceTicks(1, 'test');
        expect(listener).not.toHaveBeenCalled();

        // But the new game should have a functioning EventBus
        const newListener = jest.fn();
        loadedGame.getEventBus().on('tick', newListener);
        loadedGame.advanceTicks(1, 'test');
        expect(newListener).toHaveBeenCalled();
      });

      test('should save and restore player corporation with stellar objects', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().corporation.addCashReserve(7500);

        // Verify corporation has stellar objects before save
        expect(game.getPlayer().corporation).toBeDefined();
        expect(game.getPlayer().corporation.stellarObjects.length).toBeGreaterThan(0);
        const originalCorpName = game.getPlayer().corporation.name;
        const originalStellarObjects = [...game.getPlayer().corporation.stellarObjects];
        const originalCashReserves = game.getPlayer().corporation.cashReserves;

        // Save and load
        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);

        // Verify corporation was restored
        expect(loadedGame.getPlayer().corporation).toBeDefined();
        expect(loadedGame.getPlayer().corporation.name).toBe(originalCorpName);
        expect(loadedGame.getPlayer().corporation.stellarObjects).toEqual(originalStellarObjects);
        expect(loadedGame.getPlayer().corporation.cashReserves).toEqual(originalCashReserves);

        // Verify corporation has proper class methods
        expect(typeof loadedGame.getPlayer().corporation.addStellarObject).toBe('function');
        expect(typeof loadedGame.getPlayer().corporation.calculateTotalValue).toBe('function');

        // Verify corporations array was restored
        expect(loadedGame.getCorporations()).toBeDefined();
        expect(loadedGame.getCorporations().length).toBeGreaterThan(0);
        expect(loadedGame.getCorporations()[0].name).toBe(originalCorpName);
      });

      test('should normalize legacy object-based corporation reserves on load', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());

        const saveData = game.getSaveData();
        saveData.corporations[0].cashReserves = { trade: 300, buildings: 200 };

        const loadedGame = Game.loadGame(saveData);
        expect(loadedGame.getPlayer().corporation.cashReserves).toBe(500);
      });

      test('should allow jumping after loading a saved game', () => {
        const game = new Game(mockUniverse, mockSettings);
        game.initializeGame(createTestPlayerData());
        game.getPlayer().location = 0;
        game.getUniverse().systems = [
          { id: 0, name: 'Alpha', connections: { 1: 3 } },
          { id: 1, name: 'Beta', connections: { 0: 3 } }
        ];

        const saveData = game.getSaveData();
        const loadedGame = Game.loadGame(saveData);
        const result = loadedGame.jumpToSystem(1);

        expect(result.success).toBe(true);
        expect(loadedGame.getPlayer()).toBeInstanceOf(Player);
        expect(loadedGame.getPlayer().location).toBe(1);
      });
    });
  });

  describe('TakeOff', () => {
    test('takeOff returns error when not docked or landed', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.getPlayer().dockedAt = null;
      game.getPlayer().landedOn = null;

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
      game.getPlayer().location = 0;
      game.getUniverse().systems = [
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
      game.getPlayer().location = 0;
      game.getUniverse().systems = [
        { id: 0, name: 'Alpha', connections: { 1: 5 } },
        { id: 1, name: 'Beta', connections: { 0: 5 } }
      ];
      game.getPlayer().shipEnergy = 0;
      game.getPlayer().energyPerJump = 10;

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
      game.getPlayer().location = 1;
      game.getPlayer().landedOn = 1;
      game.getMarket().initializeMarkets();

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
      game.getPlayer().cargo.wheat = 10;
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
      game.getPlayer().location = 1;
      game.getPlayer().landedOn = 1;
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
      expect(game.getPlayer().cargo.passengers).toBe(10);
    });

    test('loadPassengers fails when insufficient cargo space', () => {
      game.getPlayer().cargo.wheat = 10000; // Fill cargo
      const result = game.loadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('cargo space');
    });

    test('unloadPassengers fails when not at correct location', () => {
      game.getPlayer().cargo.passengers = 10;
      game.getPlayer().dockedAt = null;
      game.getPlayer().landedOn = null;

      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('docked or landed');
    });

    test('unloadPassengers fails when stellar object not found', () => {
      game.getPlayer().cargo.passengers = 10;
      game.getPlayer().landedOn = 999; // Set player at location 999 (which doesn't exist)
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
      game.getPlayer().cargo.passengers = 10;
      const result = game.unloadPassengers(1, 0);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid passenger count');
    });

    test('unloadPassengers fails when trying to unload more than carrying', () => {
      game.getPlayer().cargo.passengers = 5;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(false);
      expect(result.message).toContain('only have 5');
    });

    test('unloadPassengers fails when population limit reached', () => {
      stellarObject.population = { current: 999990, limit: 1000000, growthRate: 2 };
      game.getPlayer().cargo.passengers = 20;
      const result = game.unloadPassengers(1, 20);
      expect(result.success).toBe(false);
      expect(result.message).toContain('only accept');
    });

    test('unloadPassengers succeeds and removes passengers entry when count reaches 0', () => {
      game.getPlayer().cargo.passengers = 10;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(true);
      expect(game.getPlayer().cargo.passengers).toBeUndefined();
    });

    test('unloadPassengers succeeds partially', () => {
      game.getPlayer().cargo.passengers = 20;
      const result = game.unloadPassengers(1, 10);
      expect(result.success).toBe(true);
      expect(game.getPlayer().cargo.passengers).toBe(10);
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
      game.getPlayer().shipMaxEnergy = 100;
      game.getPlayer().shipEnergy = 50;
      game.getPlayer().energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.getPlayer().shipEnergy).toBe(60);
    });

    test('rechargeShipEnergy does not exceed max energy', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.getPlayer().shipMaxEnergy = 100;
      game.getPlayer().shipEnergy = 95;
      game.getPlayer().energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.getPlayer().shipEnergy).toBe(100);
    });

    test('rechargeShipEnergy does nothing when at max energy', () => {
      const game = new Game(mockUniverse, mockSettings);
      game.initializeGame(createTestPlayerData());
      game.getPlayer().shipMaxEnergy = 100;
      game.getPlayer().shipEnergy = 100;
      game.getPlayer().energyRecharge = 10;

      game.rechargeShipEnergy();

      expect(game.getPlayer().shipEnergy).toBe(100);
    });
  });

  describe('Accessors', () => {
    let game;

    beforeEach(() => {
      game = new Game(mockUniverse, mockSettings);
    });

    describe('constructor validation', () => {
      test('rejects a missing or non-object universe', () => {
        expect(() => new Game(null, mockSettings)).toThrow(TypeError);
        expect(() => new Game([], mockSettings)).toThrow(TypeError);
      });

      test('rejects a missing or non-object settings value', () => {
        expect(() => new Game(mockUniverse, null)).toThrow(TypeError);
        expect(() => new Game(mockUniverse, 'settings')).toThrow(TypeError);
      });
    });

    describe('universe and settings', () => {
      test('getUniverse returns the configured universe', () => {
        expect(game.getUniverse()).toBe(mockUniverse);
      });

      test('setUniverse replaces the universe', () => {
        const replacement = { systems: [], stellarObjects: [] };
        game.setUniverse(replacement);
        expect(game.getUniverse()).toBe(replacement);
      });

      test('setUniverse rejects non-object values', () => {
        expect(() => game.setUniverse(null)).toThrow(TypeError);
        expect(() => game.setUniverse('universe')).toThrow(TypeError);
        expect(game.getUniverse()).toBe(mockUniverse);
      });

      test('getSettings returns the configured settings', () => {
        expect(game.getSettings()).toBe(mockSettings);
      });

      test('getDataDirectory returns the configured directory', () => {
        expect(game.getDataDirectory()).toBe('data/default/en-us');
      });

      test('getDataDirectory falls back to the default directory', () => {
        const gameWithoutDataDir = new Game(mockUniverse, { initial_ship: 'Cargo Hauler' });
        expect(gameWithoutDataDir.getDataDirectory()).toBe('data/default/en-us');
      });

      test('getEventBus and getMarket return the session collaborators', () => {
        expect(typeof game.getEventBus().emit).toBe('function');
        expect(typeof game.getMarket().initializeMarkets).toBe('function');
      });
    });

    describe('player', () => {
      test('getPlayer returns null before initialization', () => {
        expect(game.getPlayer()).toBeNull();
      });

      test('setPlayer accepts a Player instance', () => {
        const player = new Player('Accessor Captain', mockSettings);
        game.setPlayer(player);
        expect(game.getPlayer()).toBe(player);
      });

      test('setPlayer rejects values that are not Player instances', () => {
        expect(() => game.setPlayer({ name: 'Not a player' })).toThrow(TypeError);
        expect(() => game.setPlayer(null)).toThrow(TypeError);
        expect(game.getPlayer()).toBeNull();
      });
    });

    describe('npcs', () => {
      test('addNPC appends to the NPC list', () => {
        const npc = new NPC(5, 'trader', 5);
        game.addNPC(npc);
        expect(game.getNPCs()).toEqual([npc]);
      });

      test('addNPC rejects non-object values', () => {
        expect(() => game.addNPC('npc')).toThrow(TypeError);
        expect(game.getNPCs()).toEqual([]);
      });

      test('getNPCs returns a copy that cannot mutate game state', () => {
        game.addNPC(new NPC(5, 'trader', 5));
        const npcs = game.getNPCs();
        npcs.push(new NPC(6, 'trader', 6));
        expect(game.getNPCs().length).toBe(1);
      });

      test('setNPCs accepts serialized NPC data', () => {
        game.setNPCs([{ id: 1, type: 'trader' }]);
        expect(game.getNPCs()).toEqual([{ id: 1, type: 'trader' }]);
      });

      test('setNPCs rejects non-arrays and arrays holding non-objects', () => {
        expect(() => game.setNPCs('npcs')).toThrow(TypeError);
        expect(() => game.setNPCs([null])).toThrow(TypeError);
        expect(game.getNPCs()).toEqual([]);
      });
    });

    describe('corporations', () => {
      test('addCorporation appends to the corporation list', () => {
        const corporation = { name: 'Accessor Corp' };
        game.addCorporation(corporation);
        expect(game.getCorporations()).toEqual([corporation]);
      });

      test('addCorporation rejects non-object values', () => {
        expect(() => game.addCorporation('Accessor Corp')).toThrow(TypeError);
        expect(game.getCorporations()).toEqual([]);
      });

      test('getCorporations returns a copy that cannot mutate game state', () => {
        game.addCorporation({ name: 'Accessor Corp' });
        game.getCorporations().push({ name: 'Sneaky Corp' });
        expect(game.getCorporations().length).toBe(1);
      });

      test('setCorporations rejects non-arrays and arrays holding non-objects', () => {
        expect(() => game.setCorporations({})).toThrow(TypeError);
        expect(() => game.setCorporations([undefined])).toThrow(TypeError);
        expect(game.getCorporations()).toEqual([]);
      });

      test('findCorporation matches by name', () => {
        const corporation = { name: 'Accessor Corp' };
        game.addCorporation(corporation);
        expect(game.findCorporation('Accessor Corp')).toBe(corporation);
      });

      test('findCorporation returns null for unknown or invalid names', () => {
        expect(game.findCorporation('Missing Corp')).toBeNull();
        expect(game.findCorporation('')).toBeNull();
        expect(game.findCorporation(null)).toBeNull();
      });
    });

    describe('turn and tick counters', () => {
      test('setTurn and setTicks store non-negative integers', () => {
        game.setTurn(4);
        game.setTicks(12);
        expect(game.getTurn()).toBe(4);
        expect(game.getTicks()).toBe(12);
      });

      test('setTurn rejects negative, fractional, and non-numeric values', () => {
        expect(() => game.setTurn(-1)).toThrow(TypeError);
        expect(() => game.setTurn(1.5)).toThrow(TypeError);
        expect(() => game.setTurn('3')).toThrow(TypeError);
        expect(game.getTurn()).toBe(0);
      });

      test('setTicks rejects negative, fractional, and non-numeric values', () => {
        expect(() => game.setTicks(-1)).toThrow(TypeError);
        expect(() => game.setTicks(1.5)).toThrow(TypeError);
        expect(() => game.setTicks(NaN)).toThrow(TypeError);
        expect(game.getTicks()).toBe(0);
      });
    });

    describe('explored systems', () => {
      test('addExploredSystem records a new system once', () => {
        expect(game.addExploredSystem(3)).toBe(true);
        expect(game.addExploredSystem(3)).toBe(false);
        expect(game.getExploredSystems()).toEqual([3]);
      });

      test('hasExploredSystem reports visited systems', () => {
        game.addExploredSystem(3);
        expect(game.hasExploredSystem(3)).toBe(true);
        expect(game.hasExploredSystem(4)).toBe(false);
      });

      test('getExploredSystems returns a copy that cannot mutate game state', () => {
        game.addExploredSystem(3);
        game.getExploredSystems().push(99);
        expect(game.getExploredSystems()).toEqual([3]);
      });

      test('setExploredSystems replaces the list and rejects non-arrays', () => {
        game.setExploredSystems([1, 2]);
        expect(game.getExploredSystems()).toEqual([1, 2]);
        expect(() => game.setExploredSystems('1,2')).toThrow(TypeError);
        expect(game.getExploredSystems()).toEqual([1, 2]);
      });
    });

    describe('getMessage', () => {
      test('resolves a localized message from game_messages.json', () => {
        expect(game.getMessage('navigation.reasons.cannot_dock', {}, 'fallback'))
          .toBe('Cannot dock at this object');
      });

      test('replaces message tokens', () => {
        expect(game.getMessage('passengers.insufficient_available', { availablePassengers: 7 }, 'fallback'))
          .toBe('Only 7 passengers available');
      });

      test('returns the fallback when the key is missing', () => {
        expect(game.getMessage('navigation.reasons.does_not_exist', {}, 'fallback text'))
          .toBe('fallback text');
      });
    });

    describe('calculateMarketPrice', () => {
      test('delegates to the market manager', () => {
        const stellarObject = { id: 1 };
        const marketSpy = jest.spyOn(game.getMarket(), 'calculateMarketPrice').mockReturnValue(42);

        expect(game.calculateMarketPrice(stellarObject, 'wheat', 'sell')).toBe(42);
        expect(marketSpy).toHaveBeenCalledWith(stellarObject, 'wheat', 'sell');

        marketSpy.mockRestore();
      });

      test('defaults to buy pricing', () => {
        const stellarObject = { id: 1 };
        const marketSpy = jest.spyOn(game.getMarket(), 'calculateMarketPrice').mockReturnValue(7);

        expect(game.calculateMarketPrice(stellarObject, 'wheat')).toBe(7);
        expect(marketSpy).toHaveBeenCalledWith(stellarObject, 'wheat', 'buy');

        marketSpy.mockRestore();
      });
    });
  });
});

const fs = require('fs');
const path = require('path');
const { Game, Player, NPC } = require('./game');

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
      expect(player.location).toBe(0);
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
      game.initializeGame('TestPlayer');

      expect(game.player).toBeTruthy();
      expect(game.player.name).toBe('TestPlayer');
      expect(game.npcs.length).toBe(2); // One for each system except starting system
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

      expect(state.system).toBe(mockUniverse.systems[0]);
      expect(state.objects).toEqual([mockUniverse.stellarObjects[0]]);
      expect(Array.isArray(state.npcs)).toBe(true);
    });

    test('gets player state', () => {
      game.initializeGame('TestPlayer');
      const state = game.getPlayerState();

      expect(state.name).toBe('TestPlayer');
      expect(state.credits).toBe(mockSettings.starting_credits);
      expect(state.ship).toBe(mockSettings.initial_ship);
      expect(state.cargo).toEqual({});
      expect(state.stats).toBeTruthy();
    });

    describe('Save and Load', () => {
      const testFilename = 'test-save';

      beforeEach(() => {
        game.initializeGame('TestPlayer');
      });

      test('saves game state to file and loads it back', () => {
        // Save the game
        game.saveGame(testFilename);

        // Verify file exists
        const savePath = path.join(savesDir, `${testFilename}.json`);
        expect(fs.existsSync(savePath)).toBe(true);

        // Load the game
        const loadedGame = Game.loadGame(testFilename);

        // Verify loaded game state matches original
        expect(loadedGame).toBeInstanceOf(Game);
        expect(loadedGame.player.name).toBe('TestPlayer');
        expect(loadedGame.settings).toEqual(mockSettings);
        expect(loadedGame.universe).toEqual(mockUniverse);
        expect(loadedGame.turn).toBe(game.turn);
        expect(loadedGame.npcs).toEqual(game.npcs);
      });

      test('throws error when loading non-existent save file', () => {
        expect(() => {
          Game.loadGame('non-existent-save');
        }).toThrow();
      });
    });
  });
});

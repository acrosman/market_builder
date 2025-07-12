const fs = require('fs');
const path = require('path');

/**
 * Represents a player in the game
 */
class Player {
  constructor(name, settings) {
    this.name = name;
    this.credits = 1000; // Starting money
    this.location = 0; // Starting system ID
    this.ship = settings.initial_ship;
    this.cargo = {};
    this.stats = {
      jumps: 0,
      trades: 0,
      profit: 0,
    };
  }
}

/**
 * Represents an NPC in the game
 */
class NPC {
  constructor(id, type, homeSystem) {
    this.id = id;
    this.type = type;
    this.homeSystem = homeSystem;
    this.currentSystem = homeSystem;
    this.credits = 1000;
    this.ship = 'Shuttle';
    this.cargo = {};
  }
}

/**
 * Main game state manager
 */
class Game {
  constructor(universe, settings) {
    this.universe = universe;
    this.settings = settings;
    this.player = null;
    this.npcs = [];
    this.turn = 0;
    this.gameOver = false;
  }

  /**
   * Initialize a new game
   * @param {string} playerName - Name of the player
   */
  initializeGame(playerName) {
    // Create player
    this.player = new Player(playerName, this.settings);

    // Create NPCs (one trader per system for now)
    this.universe.systems.forEach((system, index) => {
      if (index === 0) return; // Skip starting system
      this.npcs.push(new NPC(index, 'trader', system.id));
    });

    // Initialize market prices and quantities
    this.initializeMarkets();
  }

  /**
   * Initialize market conditions across all systems
   */
  initializeMarkets() {
    // TODO: Set up initial market conditions
    // This will be implemented when we add the economic system
  }

  /**
   * Process one game turn
   */
  processTurn() {
    if (this.gameOver) return;

    this.turn++;

    // Check game-ending conditions
    if (this.settings.game_turn_limit > 0 && this.turn >= this.settings.game_turn_limit) {
      this.gameOver = true;
      return;
    }

    // Process NPC actions
    this.processNPCActions();

    // Update market conditions
    this.updateMarkets();
  }

  /**
   * Process all NPC actions for the current turn
   */
  processNPCActions() {
    this.npcs.forEach(npc => {
      // TODO: Implement NPC behavior
      // This will be expanded when we add AI behavior
    });
  }

  /**
   * Update market conditions across all systems
   */
  updateMarkets() {
    // TODO: Implement market updates
    // This will be implemented when we add the economic system
  }

  /**
   * Get the current state of the player's location
   * @returns {Object} Location state information
   */
  getCurrentLocationState() {
    const system = this.universe.systems[this.player.location];
    const objects = this.universe.stellarObjects.filter(obj => obj.location === system.id);

    return {
      system: system,
      objects: objects,
      npcs: this.npcs.filter(npc => npc.currentSystem === system.id)
    };
  }

  /**
   * Get the current state of the player
   * @returns {Object} Player state information
   */
  getPlayerState() {
    return {
      name: this.player.name,
      credits: this.player.credits,
      ship: this.player.ship,
      cargo: this.player.cargo,
      stats: this.player.stats
    };
  }

  /**
   * Save the current game state
   * @param {string} filename - Name of save file
   */
  saveGame(filename) {
    const saveData = {
      universe: this.universe,
      player: this.player,
      npcs: this.npcs,
      turn: this.turn,
      settings: this.settings
    };

    const savePath = path.join(__dirname, '../saves', `${filename}.json`);
    fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2));
  }

  /**
   * Load a saved game state
   * @param {string} filename - Name of save file
   */
  static loadGame(filename) {
    const savePath = path.join(__dirname, '../saves', `${filename}.json`);
    const saveData = JSON.parse(fs.readFileSync(savePath, 'utf-8'));

    const game = new Game(saveData.universe, saveData.settings);
    game.player = saveData.player;
    game.npcs = saveData.npcs;
    game.turn = saveData.turn;

    return game;
  }
}

module.exports = {
  Game,
  Player,
  NPC
};

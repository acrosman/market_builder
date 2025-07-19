const fs = require('fs');
const path = require('path');

/**
 * Represents a player in the game
 */
class Player {
  constructor(name, settings) {
    this.name = name;
    this.credits = settings.starting_credits;
    this.location = 1;  // Start in System 1
    this.ship = settings.initial_ship;

    // Load ship data to initialize ship-specific properties
    const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ships.json'), 'utf-8'));
    const shipData = shipsData[settings.initial_ship];

    // Track ship's current energy level
    this.shipEnergy = shipData.energy;
    this.shipMaxEnergy = shipData.energy;
    this.energyPerJump = shipData.energyPerJump;
    this.energyRecharge = shipData.energyRecharge;

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
   * @param {Object} playerData - Player information
   */
  initializeGame(playerData) {
    // Create player with proper starting location
    this.player = new Player(playerData.name, this.settings);
    this.player.location = 1;  // System 1 is home
    this.player.pronouns = playerData.pronouns;
    this.player.description = playerData.description;

    // Create NPCs (one trader per system for now)
    this.universe.systems.forEach((system) => {
      if (system.id === 1) return; // Skip player's starting system
      this.npcs.push(new NPC(system.id, 'trader', system.id));
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

    // Recharge ship energy
    this.rechargeShipEnergy();

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
    const system = this.universe.systems.find(s => s.id === this.player.location);
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
      shipEnergy: this.player.shipEnergy,
      shipMaxEnergy: this.player.shipMaxEnergy,
      cargo: this.player.cargo,
      stats: this.player.stats
    };
  }

  /**
   * Check if a jump to the target system is valid
   * @param {number} targetSystemId - ID of the system to jump to
   * @returns {Object} Result of validation {valid: boolean, reason: string}
   */
  validateJump(targetSystemId) {
    // Check if the target system exists
    const targetSystem = this.universe.systems.find(s => s.id === targetSystemId);
    if (!targetSystem) {
      return { valid: false, reason: "Target system does not exist" };
    }

    // Check if current system has a connection to the target system
    const currentSystem = this.universe.systems.find(s => s.id === this.player.location);
    if (!currentSystem.connections.includes(targetSystemId)) {
      return { valid: false, reason: "No direct connection to target system" };
    }

    // Check if ship has enough energy for the jump
    if (this.player.shipEnergy < this.player.energyPerJump) {
      return { valid: false, reason: "Not enough energy for jump" };
    }

    return { valid: true };
  }

  /**
   * Perform a jump to the target system
   * @param {number} targetSystemId - ID of the system to jump to
   * @returns {Object} Result of the jump operation
   */
  jumpToSystem(targetSystemId) {
    // Validate the jump
    const validation = this.validateJump(targetSystemId);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // Consume energy for the jump
    this.player.shipEnergy -= this.player.energyPerJump;

    // Update player location
    this.player.location = targetSystemId;

    // Update player stats
    this.player.stats.jumps += 1;

    // Return the new location state
    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      playerState: this.getPlayerState()
    };
  }

  /**
   * Recharge ship energy (called during turn processing)
   */
  rechargeShipEnergy() {
    if (this.player.shipEnergy < this.player.shipMaxEnergy) {
      this.player.shipEnergy = Math.min(
        this.player.shipMaxEnergy,
        this.player.shipEnergy + this.player.energyRecharge
      );
    }
  }

  /**
   * Get the current game state data for saving
   * @returns {Object} Save data object
   */
  getSaveData() {
    return {
      universe: this.universe,
      player: this.player,
      npcs: this.npcs,
      turn: this.turn,
      settings: this.settings
    };
  }

  /**
   * Load a saved game state
   * @param {Object} saveData - Saved game data
   * @returns {Game} Loaded game instance
   */
  static loadGame(saveData) {
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

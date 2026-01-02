const fs = require('fs');
const path = require('path');
const { Corporation } = require('./corporation');

/**
 * Represents a player in the game
 */
class Player {
  constructor(name, settings) {
    this.name = name;
    this.credits = settings.starting_credits;
    this.location = 1;  // Start in System 1
    this.ship = settings.initial_ship;
    this.dockedAt = null;  // ID of stellar object if docked
    this.landedOn = null;  // ID of stellar object if landed

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
    this.corporations = []; // List of all corporations in the game
    this.turn = 0;
    this.gameOver = false;
    this.exploredSystems = []; // List of system ids the player has explored
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

    // Create player's corporation
    const playerCorp = new Corporation(
      playerData.corporation?.name || 'Unknown Corp',
      playerData.corporation?.description || 'A trading company',
      true  // isPlayerOwned
    );
    this.corporations.push(playerCorp);
    this.player.corporation = playerCorp;

    // Initialize stellar object values and ownership
    this.initializeStellarObjects();

    // Create NPCs (one trader per system for now)
    this.universe.systems.forEach((system) => {
      if (system.id === 1) return; // Skip player's starting system
      this.npcs.push(new NPC(system.id, 'trader', system.id));
    });

    // Initialize market prices and quantities
    this.initializeMarkets();

    // Mark starting system as explored
    if (!this.exploredSystems.includes(this.player.location)) {
      this.exploredSystems.push(this.player.location);
    }
  }

  /**
   * Initialize market conditions across all systems
   */
  initializeMarkets() {
    // TODO: Set up initial market conditions
    // This will be implemented when we add the economic system
  }

  /**
   * Initialize stellar object values and ownership
   */
  initializeStellarObjects() {
    // Base values for calculating stellar object worth
    const baseValues = {
      populationValue: 100,      // Value per population unit
      marketValue: 10000,        // Base value for having a market
      shipyardValue: 15000,      // Base value for having a shipyard
      buildingValue: 5000,       // Base value for having buildings
      defenseValue: 1000,        // Value per defense unit (shields, cannons)
      buildingLimitValue: 500    // Value per building slot
    };

    // Calculate value for each stellar object
    this.universe.stellarObjects.forEach(obj => {
      // Calculate the object's value
      obj.value = obj.calculateValue(baseValues);

      // Set initial ownership - all objects start as Independent
      // Players can acquire them through gameplay
      obj.setOwner('Independent');
    });
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
      npcs: this.npcs.filter(npc => npc.currentSystem === system.id),
      playerState: this.getPlayerState()
    };
  }

  /**
   * Get the current state of the player
   * @returns {Object} Player state information
   */
  getPlayerState() {
    // Calculate corporation value if player has a corporation
    let corporationValue = 0;
    if (this.player.corporation && typeof this.player.corporation.calculateTotalValue === 'function') {
      // TODO: Add ship values and good prices when available
      corporationValue = this.player.corporation.calculateTotalValue(this.universe, {}, {});
    }

    return {
      name: this.player.name,
      credits: this.player.credits,
      ship: this.player.ship,
      shipEnergy: this.player.shipEnergy,
      shipMaxEnergy: this.player.shipMaxEnergy,
      cargo: this.player.cargo,
      stats: this.player.stats,
      dockedAt: this.player.dockedAt,
      landedOn: this.player.landedOn,
      corporation: {
        name: this.player.corporation?.name || 'None',
        description: this.player.corporation?.description || '',
        value: corporationValue
      }
    };
  }

  /**
 * Take off from a planet or station (clear docked/landed state)
 * @returns {Object} Result of the takeoff operation
 */
  takeOff() {
    if (this.player.dockedAt === null && this.player.landedOn === null) {
      return { success: false, reason: 'Not docked or landed' };
    }
    this.player.dockedAt = null;
    this.player.landedOn = null;
    return {
      success: true,
      locationState: this.getCurrentLocationState()
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

    // Mark the new system as explored
    if (!this.exploredSystems.includes(this.player.location)) {
      this.exploredSystems.push(this.player.location);
    }

    // Return the new location state
    return {
      success: true,
      locationState: this.getCurrentLocationState()
    };
  }

  /**
   * Dock at a station
   * @param {number} objectId - ID of the stellar object to dock at
   * @returns {Object} Result of the dock operation
   */
  dockAtStation(objectId) {
    // Validate the object exists and is in the current system
    const object = this.universe.stellarObjects.find(obj => obj.id === objectId);
    if (!object) {
      return { success: false, reason: "Station does not exist" };
    }

    if (object.location !== this.player.location) {
      return { success: false, reason: "Station is not in your current system" };
    }

    // Check if object is a station
    if (object.type !== 'Space Station') {
      return { success: false, reason: "Cannot dock at this object" };
    }

    // Dock at the station
    this.player.dockedAt = objectId;
    this.player.landedOn = null; // Clear landed status if previously landed
    this.player.stats.trades += 1; // Increment trades stat when docking

    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      dockedObject: object
    };
  }

  /**
   * Land on a planet
   * @param {number} objectId - ID of the stellar object to land on
   * @returns {Object} Result of the land operation
   */
  landOnPlanet(objectId) {

    // Debug: Log objectId, found object, and location types/values
    console.log('[DEBUG] landOnPlanet called with objectId:', objectId);
    const object = this.universe.stellarObjects.find(obj => obj.id === objectId);
    console.log('[DEBUG] Found object:', object);
    console.log('[DEBUG] object.location:', object && object.location, '(', object && typeof object.location, ')');
    console.log('[DEBUG] player.location:', this.player.location, '(', typeof this.player.location, ')');
    if (!object) {
      return { success: false, reason: "Planet does not exist" };
    }

    if (object.location !== this.player.location) {
      return { success: false, reason: "Planet is not in your current system" };
    }

    // Check if object is a planet or asteroid
    if (object.type !== 'Planet' && object.type !== 'Asteroid') {
      return { success: false, reason: "Can only land on planets or asteroids" };
    }

    // Land on the planet
    this.player.landedOn = objectId;
    this.player.dockedAt = null; // Clear docked status if previously docked
    this.player.stats.trades += 1; // Increment trades stat when landing
    // Debug: Confirm player state after landing
    console.log('[DEBUG] After landing, player.landedOn:', this.player.landedOn, 'player.dockedAt:', this.player.dockedAt);

    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      landedObject: object
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
   * @returns {Object} Save data object with plain serializable objects
   */
  getSaveData() {
    // Convert universe to plain object to avoid circular references
    const universeData = {
      systems: this.universe.systems.map(sys => ({
        id: sys.id,
        name: sys.name,
        connections: sys.connections,
        image: sys.image
      })),
      stellarObjects: this.universe.stellarObjects.map(obj => ({
        id: obj.id,
        type: obj.type,
        className: obj.className,
        location: obj.location,
        name: obj.name,
        landedImage: obj.landedImage,
        market: obj.market,
        buildings: obj.buildings,
        shipyard: obj.shipyard,
        shields: obj.shields,
        cannons: obj.cannons,
        fighters: obj.fighters,
        resistance: obj.resistance,
        description: obj.description,
        populationLimit: obj.populationLimit,
        reproductionRate: obj.reproductionRate,
        buildingCredits: obj.buildingCredits,
        buildingLimit: obj.buildingLimit,
        goods: obj.goods
      }))
    };

    return {
      universe: universeData,
      player: this.player,
      npcs: this.npcs,
      turn: this.turn,
      settings: this.settings,
      exploredSystems: this.exploredSystems
    };
  }

  /**
   * Save the current game to a file in the repository saves/ directory.
   * @param {string} filename - Base filename (without extension)
   */
  saveGame(filename) {
    const saveDir = path.join(__dirname, '..', 'saves');
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const savePath = path.join(saveDir, `${filename}.json`);
    const data = this.getSaveData();
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf8');
    return savePath;
  }

  /**
   * Load a saved game state
   * @param {Object} saveData - Saved game data
   * @returns {Game} Loaded game instance
   */
  static loadGame(saveData) {
    // If a filename (string) is provided, read the file from repository saves/ directory
    if (typeof saveData === 'string') {
      const savePath = path.join(__dirname, '..', 'saves', `${saveData}.json`);
      if (!fs.existsSync(savePath)) {
        throw new Error(`Save file not found: ${savePath}`);
      }
      const raw = fs.readFileSync(savePath, 'utf8');
      saveData = JSON.parse(raw);
    }

    // Reconstruct Universe from plain data
    const { Universe, System, StellarObject } = require('./universe');
    const universe = new Universe();

    // Reconstruct systems
    universe.systems = (saveData.universe.systems || []).map(sysData => {
      const sys = new System(sysData.id, sysData.name);
      sys.connections = sysData.connections || [];
      sys.image = sysData.image || '';
      return sys;
    });

    // Reconstruct stellar objects
    universe.stellarObjects = (saveData.universe.stellarObjects || []).map(objData => {
      const obj = new StellarObject(
        objData.id,
        objData.type,
        objData.className,
        objData.location,
        {
          market: objData.market,
          buildings: objData.buildings,
          shipyard: objData.shipyard,
          shields: objData.shields,
          cannons: objData.cannons,
          fighters: objData.fighters,
          resistance: objData.resistance,
          classes: {
            [objData.className]: {
              description: objData.description,
              populationLimit: objData.populationLimit,
              reproductionRate: objData.reproductionRate,
              buildingCredits: objData.buildingCredits,
              buildingLimit: objData.buildingLimit,
              goods: objData.goods
            }
          }
        }
      );
      if (objData.name) obj.name = objData.name;
      return obj;
    });

    const game = new Game(universe, saveData.settings);
    game.player = saveData.player;
    game.npcs = saveData.npcs;
    game.turn = saveData.turn;
    game.exploredSystems = saveData.exploredSystems || [];

    return game;
  }
}

module.exports = {
  Game,
  Player,
  NPC
};

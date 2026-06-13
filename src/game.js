const fs = require('fs');
const path = require('path');
const { Corporation } = require('./corporation');
const { EventBus } = require('./eventBus');
const { Player } = require('./player');
const { NPC } = require('./npc');
const { Market } = require('./market');
const { createLogger } = require('./logger');

const logger = createLogger('Game');

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
    this.ticks = 0; // Track game time in ticks
    this.exploredSystems = []; // List of system ids the player has explored
    this.eventBus = new EventBus(); // Event system for tick events
    this.market = new Market(universe, settings); // Market management
  }

  /**
   * Initialize a new game
   * @param {Object} playerData - Player information
   */
  initializeGame(playerData) {
    // Create player with proper starting location
    this.player = new Player(playerData.name, this.settings);
    // Player starts at location 1 (set in constructor), no need to reassign
    this.player.pronouns = playerData.pronouns;
    this.player.description = playerData.description;

    // Create player's corporation
    const playerCorp = new Corporation(
      playerData.corporation?.name || 'Unknown Corp',
      playerData.corporation?.description || 'A trading company',
      true,  // isPlayerOwned
      playerData.corporation?.cashReserves || 0
    );
    this.corporations.push(playerCorp);
    this.player.corporation = playerCorp;

    // Initialize stellar object values and ownership
    this.initializeStellarObjects();

    // Find a Farm World planet (not in system 1) and assign it to the player's corporation
    logger.debug('[DEBUG initializeGame] Looking for Farm World...');
    logger.debug('[DEBUG initializeGame] Total stellar objects:', this.universe.stellarObjects.length);
    const planets = this.universe.stellarObjects.filter(obj => obj.type === 'Planet');
    logger.debug('[DEBUG initializeGame] Planets:', planets.map(p => ({ id: p.id, className: p.className, location: p.location })));

    const farmPlanet = this.universe.stellarObjects.find(obj =>
      obj.type === 'Planet' &&
      obj.className === 'Farm World' &&
      obj.location !== 1
    );
    logger.debug('[DEBUG initializeGame] Farm World found:', farmPlanet ? { id: farmPlanet.id, location: farmPlanet.location } : 'NONE');

    if (farmPlanet) {
      farmPlanet.setOwner(playerCorp.name);
      playerCorp.addStellarObject(farmPlanet.id);
      logger.debug('[DEBUG initializeGame] Assigned Farm World to corporation');
      logger.debug('[DEBUG initializeGame] Corporation stellar objects:', playerCorp.stellarObjects);
    } else {
      logger.warn('[WARN initializeGame] No Farm World found outside system 1!');
    }

    // Create NPCs (one trader per system for now)
    this.universe.systems.forEach((system) => {
      if (system.id === 1) return; // Skip player's starting system
      this.npcs.push(new NPC(system.id, 'trader', system.id));
    });

    // Initialize market prices and quantities
    this.market.initializeMarkets();

    // Mark starting system as explored
    if (!this.exploredSystems.includes(this.player.location)) {
      this.exploredSystems.push(this.player.location);
    }

    // Subscribe all stellar objects to tick events for automatic updates
    this.universe.stellarObjects.forEach(obj => {
      this.eventBus.subscribe('tick', obj);
    });
  }

  /**
   * Initialize stellar object values and ownership
   */
  initializeStellarObjects() {
    // Base values for calculating stellar object worth
    // Note: Population is NOT included in value calculation
    const baseValues = {
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
    this.turn++;

    // Recharge ship energy
    this.rechargeShipEnergy();

    // Process NPC actions
    this.processNPCActions();

    // Update market conditions
    this.updateMarkets();
  }

  /**
   * Advance game time by the specified number of ticks
   * Events are emitted one at a time to allow subscribers to react to each tick
   * @param {number} numTicks - Number of ticks to advance (default: 1)
   * @param {string} action - The action that triggered this tick
   * @returns {Object} Final tick event data
   */
  advanceTicks(numTicks = 1, action = 'unknown') {
    let lastTickData;

    // Emit events one at a time so subscribers can count/react to each tick
    for (let i = 0; i < numTicks; i++) {
      this.ticks += 1;

      lastTickData = {
        ticks: this.ticks,
        action
      };

      // Emit tick event so other systems can react
      this.eventBus.emit('tick', lastTickData);
    }

    return lastTickData;
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
   * Get the stellar object where the player is currently docked/landed.
   * @returns {Object|null} Current local stellar object, or null in space
   */
  getCurrentLocalObject() {
    const objectId = this.player.dockedAt ?? this.player.landedOn;
    if (objectId === null || objectId === undefined) {
      return null;
    }
    return this.universe.stellarObjects.find(obj => obj.id === objectId) || null;
  }

  /**
   * Load building definitions from configured data directory.
   * @returns {Object} Building definitions keyed by type
   */
  getBuildingsData() {
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const buildingsPath = path.join(__dirname, '..', dataDir, 'buildings.json');
    const buildingsData = JSON.parse(fs.readFileSync(buildingsPath, 'utf-8'));
    return buildingsData;
  }

  /**
   * Get buildings that can be built at the player's current object.
   * @returns {Object[]} List of build options
   */
  getBuildableBuildingsForCurrentObject() {
    const stellarObject = this.getCurrentLocalObject();
    const isControlledByPlayer = this.player?.controlsStellarObject(stellarObject, this.corporations);
    if (!stellarObject || !isControlledByPlayer) {
      return [];
    }

    const buildingsData = this.getBuildingsData();
    return stellarObject.getBuildableBuildingOptions(buildingsData);
  }

  /**
   * Queue construction of a building at the player's current object.
   * @param {string} buildingType - Building type from buildings.json
   * @returns {Object} Build result
   */
  buildBuildingAtCurrentObject(buildingType) {
    const stellarObject = this.getCurrentLocalObject();
    if (!stellarObject) {
      return { success: false, reason: 'You must be docked or landed to build' };
    }

    const isControlledByPlayer = this.player?.controlsStellarObject(stellarObject, this.corporations);
    if (!isControlledByPlayer) {
      return { success: false, reason: 'You do not control this stellar object' };
    }

    const buildingsData = this.getBuildingsData();
    const buildResult = stellarObject.constructBuilding(buildingType, buildingsData);
    if (!buildResult.success) {
      return buildResult;
    }

    return {
      ...buildResult,
      objectId: stellarObject.id
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
      location: this.player.location,
      ship: this.player.ship,
      shipEnergy: this.player.shipEnergy,
      shipMaxEnergy: this.player.shipMaxEnergy,
      cargo: this.player.cargo,
      stats: this.player.stats,
      dockedAt: this.player.dockedAt,
      landedOn: this.player.landedOn,
      system: this.player.location,
      ticks: this.ticks,
      corporation: {
        name: this.player.corporation?.name || 'None',
        description: this.player.corporation?.description || '',
        value: corporationValue,
        stellarObjects: this.player.corporation?.stellarObjects || [],
        cashReserves: this.player.corporation?.cashReserves || 0,
        totalCashReserves: this.player.corporation?.getTotalCashReserves?.() || 0
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

    // Advance game time by 1 tick
    this.advanceTicks(1, 'takeoff');

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
    if (!currentSystem.connections[targetSystemId]) {
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

    // Get the current system to find tick cost for this jump
    const currentSystem = this.universe.systems.find(s => s.id === this.player.location);
    const tickCost = currentSystem?.connections?.[targetSystemId] || 1;

    // Update player location
    this.player.moveTo(targetSystemId);

    // Update player stats
    this.player.stats.jumps += 1;

    // Mark the new system as explored
    if (!this.exploredSystems.includes(this.player.location)) {
      this.exploredSystems.push(this.player.location);
    }

    // Advance game time by the connection's tick cost
    this.advanceTicks(tickCost, 'jump');

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

    // Fully recharge ship energy when docking
    this.player.shipEnergy = this.player.shipMaxEnergy;

    // Advance game time by 1 tick
    this.advanceTicks(1, 'dock');

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
    logger.debug('[DEBUG] landOnPlanet called with objectId:', objectId);
    const object = this.universe.stellarObjects.find(obj => obj.id === objectId);
    logger.debug('[DEBUG] Found object:', object);
    logger.debug('[DEBUG] object.location:', object && object.location, '(', object && typeof object.location, ')');
    logger.debug('[DEBUG] player.location:', this.player.location, '(', typeof this.player.location, ')');
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

    // Fully recharge ship energy when landing
    this.player.shipEnergy = this.player.shipMaxEnergy;

    // Advance game time by 1 tick
    this.advanceTicks(1, 'land');

    // Debug: Confirm player state after landing
    logger.debug('[DEBUG] After landing, player.landedOn:', this.player.landedOn, 'player.dockedAt:', this.player.dockedAt);

    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      landedObject: object
    };
  }

  /**
   * Buy goods from a stellar object
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {string} goodName - Name of the good to buy
   * @param {number} quantity - Quantity to buy
   * @param {number} price - Price per unit (optional, will be recalculated for verification)
   * @returns {Object} Result object with success status and message
   */
  buyGood(stellarObjectId, goodName, quantity, price) {
    return this.market.buyGood(this.player, stellarObjectId, goodName, quantity, price);
  }

  /**
   * Sell goods to a stellar object
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {string} goodName - Name of the good to sell
   * @param {number} quantity - Quantity to sell
   * @param {number} price - Price per unit (optional, will be recalculated for verification)
   * @returns {Object} Result object with success status and message
   */
  sellGood(stellarObjectId, goodName, quantity, price) {
    return this.market.sellGood(this.player, stellarObjectId, goodName, quantity, price);
  }

  /**
   * Load passengers from a stellar object
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {number} passengerCount - Number of passengers to load
   * @returns {Object} Result object with success status and message
   */
  loadPassengers(stellarObjectId, passengerCount) {
    const stellarObject = this.universe.stellarObjects.find(obj => obj.id === stellarObjectId);
    if (!stellarObject) {
      return { success: false, message: 'Stellar object not found' };
    }

    // Calculate available passengers
    const population = stellarObject.population;
    const populationPercent = (population.current / population.limit) * 100;
    let availablePassengers = 0;

    if (populationPercent < 25) {
      return { success: false, message: 'Population is too low. People are not willing to leave.' };
    }

    const willingPercent = ((populationPercent - 25) / 75) * 50;
    availablePassengers = Math.floor((population.current * willingPercent) / 100);

    if (passengerCount > availablePassengers) {
      return { success: false, message: `Only ${availablePassengers} passengers available` };
    }

    // Check cargo capacity (10 people per ton)
    const cargoNeeded = passengerCount / 10;
    const currentCargo = this.market.calculateCargoUsed(this.player);
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'ships.json'), 'utf-8'));
    const shipData = shipsData[this.player.ship];
    const cargoCapacity = shipData.cargoCapacity;

    if (currentCargo + cargoNeeded > cargoCapacity) {
      return { success: false, message: `Insufficient cargo space. Need ${cargoNeeded.toFixed(2)} tons, only ${(cargoCapacity - currentCargo).toFixed(2)} available` };
    }

    // Execute transaction
    stellarObject.population.current -= passengerCount;
    this.player.cargo.passengers = (this.player.cargo.passengers || 0) + passengerCount;

    return { success: true, message: `Loaded ${passengerCount} passengers (${cargoNeeded.toFixed(2)} tons)` };
  }

  /**
   * Unload passengers at a stellar object
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {number} passengerCount - Number of passengers to unload
   * @returns {Object} Result object with success status and message
   */
  unloadPassengers(stellarObjectId, passengerCount) {
    // Ensure passengerCount is a valid integer
    passengerCount = parseInt(passengerCount, 10);

    // Check if player is landed or docked at the location
    if (this.player.dockedAt !== stellarObjectId && this.player.landedOn !== stellarObjectId) {
      return { success: false, message: 'You must be docked or landed at this location' };
    }

    // Find the stellar object
    const stellarObject = this.universe.stellarObjects.find(obj => obj.id === stellarObjectId);
    if (!stellarObject) {
      return { success: false, message: 'Stellar object not found' };
    }

    // Check if player has passengers
    const currentPassengers = this.player.cargo.passengers || 0;
    if (currentPassengers === 0) {
      return { success: false, message: 'No passengers in cargo' };
    }

    if (isNaN(passengerCount) || passengerCount <= 0) {
      return { success: false, message: 'Invalid passenger count' };
    }

    if (passengerCount > currentPassengers) {
      return { success: false, message: `You only have ${currentPassengers} passengers on board` };
    }

    // Check population limit
    if (stellarObject.population.current + passengerCount > stellarObject.population.limit) {
      const availableSpace = stellarObject.population.limit - stellarObject.population.current;
      return { success: false, message: `Location can only accept ${availableSpace} more passengers` };
    }

    // Execute transaction
    stellarObject.population.current += passengerCount;
    this.player.cargo.passengers -= passengerCount;

    // Remove passengers from cargo if count reaches 0
    if (this.player.cargo.passengers === 0) {
      delete this.player.cargo.passengers;
    }

    const cargoFreed = (passengerCount / 10).toFixed(2);
    return { success: true, message: `Unloaded ${passengerCount} passengers (freed ${cargoFreed} tons)` };
  }

  /**
   * Calculate total cargo space used
   * @returns {number} Cargo space used in tons
   */
  calculateCargoUsed() {
    return this.market.calculateCargoUsed(this.player);
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
        owner: obj.owner,
        value: obj.value,
        population: obj.population,
        buildings: obj.buildings,
        buildingsUnderConstruction: obj.buildingsUnderConstruction,
        fighters: obj.fighters,
        capabilities: obj.capabilities,
        marketState: obj.marketState,
        shipyardState: obj.shipyardState,
        productivityModifiers: obj.productivityModifiers,
        description: obj.description,
        buildingCredits: obj.buildingCredits,
        buildingLimit: obj.buildingLimit
      }))
    };

    return {
      universe: universeData,
      player: this.player,
      corporations: this.corporations,
      npcs: this.npcs,
      turn: this.turn,
      ticks: this.ticks,
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
      sys.connections = sysData.connections || {};
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
          market: objData.capabilities?.market || false,
          buildings: objData.capabilities?.buildings || false,
          shipyard: objData.capabilities?.shipyard || false,
          shields: objData.capabilities?.shields || false,
          cannons: objData.capabilities?.cannons || false,
          fighters: objData.capabilities?.fighters || false,
          resistance: objData.capabilities?.resistance || false,
          classes: {
            [objData.className]: {
              description: objData.description,
              populationLimit: objData.population?.limit || 0,
              reproductionRate: objData.population?.growthRate || 0,
              buildingCredits: objData.buildingCredits,
              buildingLimit: objData.buildingLimit,
              productivityModifiers: objData.productivityModifiers || {}
            }
          }
        }
      );
      if (objData.name) obj.name = objData.name;
      if (objData.landedImage) obj.landedImage = objData.landedImage;
      if (objData.owner) obj.owner = objData.owner;
      if (objData.value !== undefined) obj.value = objData.value;

      // Restore population state
      if (objData.population) {
        obj.population = { ...objData.population };
      }

      // Restore buildings state
      if (objData.buildings) {
        obj.buildings = { ...objData.buildings };
      }
      if (objData.buildingsUnderConstruction) {
        obj.buildingsUnderConstruction = [...objData.buildingsUnderConstruction];
      }

      // Restore military assets
      if (objData.fighters !== undefined) {
        obj.fighters = objData.fighters;
      }

      // Restore market and shipyard states
      if (objData.marketState) {
        obj.marketState = JSON.parse(JSON.stringify(objData.marketState));
      }
      if (objData.shipyardState) {
        obj.shipyardState = JSON.parse(JSON.stringify(objData.shipyardState));
      }

      return obj;
    });

    const game = new Game(universe, saveData.settings);
    const savedPlayerData = saveData.player || {};
    const loadedPlayer = new Player(savedPlayerData.name || 'Player', saveData.settings);

    loadedPlayer.location = savedPlayerData.location ?? loadedPlayer.location;
    loadedPlayer.ship = savedPlayerData.ship ?? loadedPlayer.ship;
    loadedPlayer.credits = savedPlayerData.credits ?? loadedPlayer.credits;
    loadedPlayer.cargo = savedPlayerData.cargo ?? loadedPlayer.cargo;
    loadedPlayer.shipEnergy = savedPlayerData.shipEnergy ?? loadedPlayer.shipEnergy;
    loadedPlayer.shipMaxEnergy = savedPlayerData.shipMaxEnergy ?? loadedPlayer.shipMaxEnergy;
    loadedPlayer.energyPerJump = savedPlayerData.energyPerJump ?? loadedPlayer.energyPerJump;
    loadedPlayer.energyRecharge = savedPlayerData.energyRecharge ?? loadedPlayer.energyRecharge;
    loadedPlayer.dockedAt = savedPlayerData.dockedAt ?? null;
    loadedPlayer.landedOn = savedPlayerData.landedOn ?? null;
    loadedPlayer.pronouns = savedPlayerData.pronouns ?? loadedPlayer.pronouns;
    loadedPlayer.description = savedPlayerData.description ?? loadedPlayer.description;
    loadedPlayer.stats = {
      ...loadedPlayer.stats,
      ...savedPlayerData.stats
    };
    loadedPlayer.corporation = savedPlayerData.corporation;

    game.player = loadedPlayer;
    game.npcs = saveData.npcs;
    game.turn = saveData.turn;
    game.ticks = saveData.ticks || 0;
    game.exploredSystems = saveData.exploredSystems || [];

    // Reconstruct corporations with proper Corporation instances
    if (saveData.corporations && Array.isArray(saveData.corporations)) {
      game.corporations = saveData.corporations.map(corpData => {
        const corp = new Corporation(
          corpData.name,
          corpData.description,
          corpData.isPlayerOwned,
          corpData.cashReserves || 0
        );
        corp.stellarObjects = corpData.stellarObjects || [];
        corp.ships = corpData.ships || [];
        corp.goods = corpData.goods || {};
        return corp;
      });

      // Restore the player's corporation reference with the proper Corporation instance
      if (game.player.corporation) {
        const playerCorp = game.corporations.find(c => c.name === game.player.corporation.name);
        if (playerCorp) {
          game.player.corporation = playerCorp;
        }
      }
    }

    // Note: EventBus listeners are not persisted; they must be re-registered after load
    // Subscribe all stellar objects to tick events for automatic updates
    universe.stellarObjects.forEach(obj => {
      game.eventBus.subscribe('tick', obj);
    });

    return game;
  }
}

module.exports = {
  Game
};

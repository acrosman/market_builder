const fs = require('fs');
const path = require('path');

/**
 * Represents a stellar object (planet, station, asteroid) in the universe.
 * Stellar objects are the primary locations for economic activity and player interaction.
 */
class StellarObject {
  /**
   * Create a new stellar object
   * @param {number} id - Unique identifier for this stellar object
   * @param {string} type - Type of object (e.g., "Planet", "Space Station", "Asteroid")
   * @param {string} className - Class within the type (e.g., "Earth-like", "Trading Post")
   * @param {number} location - System ID where this object is located
   * @param {Object} typeDetails - Configuration data from stellarObjects.json for this type
   * @param {string} name - Display name for this object
   * @param {string} dataDir - Data directory path (defaults to data/default/en-us)
   */
  constructor(id, type, className, location, typeDetails, name, dataDir = 'data/default/en-us') {
    this.id = id;
    this.type = type;
    this.className = className;
    this.location = location;
    this.name = name;
    this.landedImage = ''; // Image shown when player is docked/landed
    this.owner = 'Independent'; // Corporation name or "Independent"
    this.value = 0; // Calculated economic value
    this.dataDir = dataDir; // Store for later use

    // Load game settings for population growth divisor
    const gameSettingsPath = path.join(__dirname, '..', dataDir, 'game_settings.json');
    const gameSettings = JSON.parse(fs.readFileSync(gameSettingsPath, 'utf-8'));
    this.populationGrowthDivisor = gameSettings.population_growth_divisor || 1000000;

    // Get class-specific configuration
    const classDetails = typeDetails.classes[className];
    if (!classDetails) {
      throw new Error(`Unknown class "${className}" for type "${type}"`);
    }

    // Static configuration (capabilities and limits from stellarObjects.json)
    this.description = classDetails.description || '';
    this.buildingCredits = classDetails.buildingCredits || 0;
    this.buildingLimit = classDetails.buildingLimit || 0;

    // Capabilities (booleans indicating what this object CAN do/have)
    this.capabilities = {
      market: typeDetails.market || false,
      buildings: typeDetails.buildings || false,
      shipyard: typeDetails.shipyard || false,
      shields: typeDetails.shields || false,
      cannons: typeDetails.cannons || false,
      fighters: typeDetails.fighters || false,
      // Resistance is a capability flag. Actual resistance value would be calculated
      // based on population size when needed (future implementation).
      resistance: typeDetails.resistance || false
    };

    // Population tracking
    const populationLimit = classDetails.populationLimit || 0;
    const initialPopulationPercent = classDetails.initialPopulationPercent || [0, 0];
    const percentMin = initialPopulationPercent[0];
    const percentMax = initialPopulationPercent[1];
    const randomPercent = percentMin + Math.random() * (percentMax - percentMin);
    const initialPopulation = Math.floor(populationLimit * randomPercent / 100);

    this.population = {
      current: initialPopulation,
      limit: populationLimit,
      growthRate: classDetails.reproductionRate || 0
    };

    // Buildings: Object tracking built buildings by type
    // Format: { "Warehouse": { count: 2 }, "Mine": { count: 1 }, ... }
    this.buildings = {};

    // Construction queue: Buildings being constructed
    // Format: [{ type: "Mine", ticksRemaining: 5 }, ...]
    this.buildingsUnderConstruction = [];

    // Combat/Defense: Counts of military assets (start at 0)
    this.fighters = 0;

    // Market state (if capability enabled)
    // This will track inventory, prices, trade routes, etc.
    this.marketState = this.capabilities.market ? {
      inventory: {}, // { goodName: quantity }
      prices: {}, // { goodName: price }
      tradeRoutes: [] // Array of trade route configurations
    } : null;

    // Shipyard state (if capability enabled)
    // This will track ships being built, upgrade capabilities, etc.
    this.shipyardState = this.capabilities.shipyard ? {
      shipsUnderConstruction: [], // Array of ships being built
      availableShipTypes: [], // Ship types this shipyard can build
      constructionQueue: [] // Queue of ships to build
    } : null;

    // Productivity modifiers (0-10 rating) affect production building effectiveness
    // These modify how well production buildings (mines, farms, factories) work on this object
    // Example: A Mine on Metal World (metal: 10) produces more than on Farm World (metal: 3)
    this.productivityModifiers = { ...classDetails.productivityModifiers };
  }

  /**
   * Calculate the total shield strength from all Shield Generator buildings
   * @param {Object} buildingsData - Building definitions from buildings.json
   * @returns {number} Total maximum shield charge capacity
   */
  getShieldStrength(buildingsData) {
    if (!this.capabilities.shields || !this.buildings['Shield Generator']) {
      return 0;
    }

    const shieldGeneratorCount = this.buildings['Shield Generator'].count || 0;
    const shieldGeneratorStats = buildingsData['Shield Generator'];
    if (!shieldGeneratorStats) {
      return 0;
    }

    return shieldGeneratorCount * (shieldGeneratorStats.shieldsMaxCharge || 0);
  }

  /**
   * Calculate the total cannon strength from all Cannon buildings
   * @param {Object} buildingsData - Building definitions from buildings.json
   * @returns {number} Total cannon burst output
   */
  getCannonStrength(buildingsData) {
    if (!this.capabilities.cannons || !this.buildings['Cannon']) {
      return 0;
    }

    const cannonCount = this.buildings['Cannon'].count || 0;
    const cannonStats = buildingsData['Cannon'];
    if (!cannonStats || !cannonStats.cannonBurstOutput) {
      return 0;
    }

    // Assuming cannonBurstOutput is [min, max] and we want total max output
    const maxOutput = cannonStats.cannonBurstOutput[1] || 0;
    return cannonCount * maxOutput;
  }

  /**
   * Add a building to this stellar object (queues construction)
   * @param {string} buildingType - Type of building from buildings.json
   * @param {Object} buildingsData - Building definitions from buildings.json
   * @returns {boolean} True if building was queued, false if at limit
   */
  addBuilding(buildingType, buildingsData) {
    if (!this.capabilities.buildings) {
      return false;
    }

    // Count total buildings (built + under construction)
    const builtCount = Object.values(this.buildings).reduce(
      (sum, building) => sum + (building.count || 0),
      0
    );
    const queuedCount = this.buildingsUnderConstruction.length;
    const totalBuildings = builtCount + queuedCount;

    if (totalBuildings >= this.buildingLimit) {
      return false;
    }

    // Get build time from buildings data
    const buildingInfo = buildingsData[buildingType];
    if (!buildingInfo || !buildingInfo.buildCost || !buildingInfo.buildCost.ticks) {
      return false; // Invalid building type
    }

    // Queue the building for construction
    this.buildingsUnderConstruction.push({
      type: buildingType,
      ticksRemaining: buildingInfo.buildCost.ticks
    });

    return true;
  }

  /**
   * Check whether this object can support a building type.
   * @param {Object} buildingData - Building definition from buildings.json
   * @returns {boolean} True when this object supports the building
   * Uses explicit type flags (`isShieldGenerator`, `isCannon`) in building data.
   * @example
   * const canBuild = obj.supportsBuilding(buildingsData['Mine']);
   */
  supportsBuilding(buildingData) {
    if (!this.capabilities?.buildings || !buildingData) {
      return false;
    }

    if (buildingData.isShieldGenerator && !this.capabilities.shields) {
      return false;
    }

    if (buildingData.isCannon && !this.capabilities.cannons) {
      return false;
    }

    return true;
  }

  /**
   * Get building options this object supports.
   * @param {Object} buildingsData - Building definitions from buildings.json
   * @returns {Object[]} List of supported build options
   * @example
   * const options = obj.getBuildableBuildingOptions(buildingsData);
   */
  getBuildableBuildingOptions(buildingsData) {
    if (!buildingsData || !this.capabilities?.buildings) {
      return [];
    }

    return Object.entries(buildingsData)
      .filter(([, buildingData]) => this.supportsBuilding(buildingData))
      .map(([buildingType, buildingData]) => ({
        type: buildingType,
        buildCost: buildingData.buildCost
      }));
  }

  /**
   * Queue construction and deduct local object resources.
   * @param {string} buildingType - Type of building to construct
   * @param {Object} buildingsData - Building definitions from buildings.json
   * @returns {Object} Construction result
   * @example
   * const result = obj.constructBuilding('Mine', buildingsData);
   */
  constructBuilding(buildingType, buildingsData) {
    const buildingData = buildingsData?.[buildingType];
    if (!buildingData) {
      return { success: false, reason: 'Unknown building type' };
    }

    if (!this.supportsBuilding(buildingData)) {
      return { success: false, reason: `${buildingType} is not supported here` };
    }

    const buildCost = buildingData.buildCost || {};
    const requiredCredits = Number(buildCost.credits || 0);
    const requiredGoods = buildCost.goods || {};
    const availableCredits = Number(this.buildingCredits || 0);
    const availableGoods = this.marketState?.inventory || {};

    if (availableCredits < requiredCredits) {
      return { success: false, reason: 'Insufficient building credits at this location' };
    }

    for (const [goodName, quantity] of Object.entries(requiredGoods)) {
      if ((availableGoods[goodName] || 0) < quantity) {
        return { success: false, reason: `Insufficient ${goodName} at this location` };
      }
    }

    const queued = this.addBuilding(buildingType, buildingsData);
    if (!queued) {
      return { success: false, reason: 'Building limit reached or cannot construct building' };
    }

    this.buildingCredits = availableCredits - requiredCredits;
    Object.entries(requiredGoods).forEach(([goodName, quantity]) => {
      availableGoods[goodName] -= quantity;
      if (availableGoods[goodName] <= 0) {
        delete availableGoods[goodName];
      }
    });

    return {
      success: true,
      buildingType,
      ticksRemaining: buildingData.buildCost?.ticks || 0
    };
  }

  /**
   * Remove a building from this stellar object
   * @param {string} buildingType - Type of building to remove
   * @returns {boolean} True if building was removed, false if none exist
   */
  removeBuilding(buildingType) {
    if (!this.buildings[buildingType] || this.buildings[buildingType].count === 0) {
      return false;
    }

    this.buildings[buildingType].count--;
    if (this.buildings[buildingType].count === 0) {
      delete this.buildings[buildingType];
    }

    return true;
  }

  /**
   * Get the total number of buildings on this object
   * @returns {number} Total building count
   */
  getBuildingCount() {
    return Object.values(this.buildings).reduce(
      (sum, building) => sum + (building.count || 0),
      0
    );
  }

  /**
   * Add fighters to this stellar object
   * @param {number} count - Number of fighters to add
   */
  addFighters(count) {
    if (!this.capabilities.fighters) {
      return;
    }
    this.fighters += count;
  }

  /**
   * Remove fighters from this stellar object
   * @param {number} count - Number of fighters to remove
   * @returns {number} Actual number of fighters removed
   */
  removeFighters(count) {
    if (!this.capabilities.fighters) {
      return 0;
    }

    const removed = Math.min(count, this.fighters);
    this.fighters -= removed;
    return removed;
  }

  /**
   * Update population based on growth rate
   * @param {number} ticks - Number of ticks that have passed
   */
  updatePopulation(ticks = 1) {
    // Growth rate divisor is configured in game_settings.json
    // Default divisor of 1000000 means a setting of 2 = 0.0002% growth per tick
    const growthFactor = 1 + (this.population.growthRate / this.populationGrowthDivisor);
    const newPopulation = Math.floor(this.population.current * Math.pow(growthFactor, ticks));

    // Cap at population limit
    this.population.current = Math.min(newPopulation, this.population.limit);

    // Handle negative growth (population can't go below 0)
    this.population.current = Math.max(0, this.population.current);
  }

  /**
   * Calculate the economic value of this stellar object
   * Does not include population - value is based on capabilities and infrastructure only
   * @param {Object} baseValues - Base values for different property types
   * @returns {number} The calculated value
   */
  calculateValue(baseValues = {}) {
    let value = 0;

    // Base value from building credits
    value += this.buildingCredits || 0;

    // Add value from market capability
    if (this.capabilities.market) {
      value += baseValues.marketValue || 10000;
    }

    // Add value from shipyard capability
    if (this.capabilities.shipyard) {
      value += baseValues.shipyardValue || 15000;
    }

    // Add value from buildings capability
    if (this.capabilities.buildings) {
      value += baseValues.buildingValue || 5000;
    }

    // Add value from building limit
    const buildingLimitValue = baseValues.buildingLimitValue || 500;
    value += (this.buildingLimit || 0) * buildingLimitValue;

    this.value = Math.round(value);
    return this.value;
  }

  /**
   * Set the owner of this stellar object
   * @param {string} ownerName - Name of the owning corporation or "Independent"
   */
  setOwner(ownerName) {
    this.owner = ownerName || 'Independent';
  }

  /**
   * Handle tick event for time-based updates
   * This is called automatically each tick by the EventBus subscriber system
   * @param {Object} data - Event data containing ticks and action
   */
  onTick(data) {
    const { ticks } = data;

    // Update population based on growth rate
    if (this.population.growthRate !== 0) {
      this.updatePopulation(ticks);
    }

    // Process construction queue
    for (let i = this.buildingsUnderConstruction.length - 1; i >= 0; i--) {
      const construction = this.buildingsUnderConstruction[i];
      construction.ticksRemaining -= ticks;

      // If construction is complete, add building to inventory
      if (construction.ticksRemaining <= 0) {
        // Complete the building
        if (!this.buildings[construction.type]) {
          this.buildings[construction.type] = { count: 0 };
        }
        this.buildings[construction.type].count++;

        // Remove from construction queue
        this.buildingsUnderConstruction.splice(i, 1);
      }
    }

    // TODO: Simple goods production
    // This is a placeholder for future implementation
    // Will check resources and produce goods based on:
    // - Buildings present (mines, farms, factories)
    // - Productivity modifiers for this location
    // - Resource availability (check before production)
  }

  /**
   * Get a serializable representation of this object for saving
   * @returns {Object} Serializable object
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      className: this.className,
      location: this.location,
      name: this.name,
      landedImage: this.landedImage,
      owner: this.owner,
      value: this.value,
      description: this.description,
      buildingCredits: this.buildingCredits,
      buildingLimit: this.buildingLimit,
      capabilities: this.capabilities,
      population: this.population,
      buildings: this.buildings,
      buildingsUnderConstruction: this.buildingsUnderConstruction,
      fighters: this.fighters,
      marketState: this.marketState,
      shipyardState: this.shipyardState,
      productivityModifiers: this.productivityModifiers,
      dataDir: this.dataDir
    };
  }

  /**
   * Create a StellarObject from a saved JSON representation
   * @param {Object} data - Serialized stellar object data
   * @param {Object} typeDetails - Configuration data from stellarObjects.json
   * @param {string} dataDir - Data directory path
   * @returns {StellarObject} Restored stellar object
   */
  static fromJSON(data, typeDetails, dataDir = 'data/default/en-us') {
    const obj = new StellarObject(
      data.id,
      data.type,
      data.className,
      data.location,
      typeDetails,
      data.name,
      dataDir
    );

    // Restore saved state
    obj.landedImage = data.landedImage || '';
    obj.owner = data.owner || 'Independent';
    obj.value = data.value || 0;
    obj.population = data.population || obj.population;
    obj.buildings = data.buildings || {};
    obj.buildingsUnderConstruction = data.buildingsUnderConstruction || [];
    obj.fighters = data.fighters || 0;
    obj.marketState = data.marketState || obj.marketState;
    obj.shipyardState = data.shipyardState || obj.shipyardState;
    obj.dataDir = data.dataDir || dataDir;

    return obj;
  }
}

module.exports = { StellarObject };

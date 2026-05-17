/**
 * Represents a Corporation in Universe Market Builder.
 * Corporations own assets (stellar objects, ships, goods) and track their total value.
 */
class Corporation {
  /**
   * Creates a new Corporation
   * @param {string} name - The name of the corporation
   * @param {string} description - Description of the corporation
   * @param {boolean} isPlayerOwned - Whether this corporation is owned by the player
   * @param {Object} cashReserves - Initial cash reserves by category
   */
  constructor(name, description, isPlayerOwned = false, cashReserves = {}) {
    this.name = name;
    this.description = description;
    this.isPlayerOwned = isPlayerOwned;
    this.stellarObjects = []; // Array of stellar object IDs owned by this corporation
    this.ships = []; // Array of ship IDs owned by this corporation
    this.goods = {}; // Object mapping good names to quantities
    this.cashReserves = {
      trade: 0,
      buildings: 0,
      planets: 0,
      stocks: 0,
      ships: 0,
      operations: 0,
      ...cashReserves
    };
  }

  /**
   * Check whether a reserve category is valid
   * @param {string} category - Reserve category to validate
   * @returns {boolean} True when category is supported
   */
  isValidCashReserveCategory(category) {
    return typeof category === 'string' && Object.prototype.hasOwnProperty.call(this.cashReserves, category);
  }

  /**
   * Adds a stellar object to the corporation's assets
   * @param {number} stellarObjectId - The ID of the stellar object to add
   */
  addStellarObject(stellarObjectId) {
    if (!this.stellarObjects.includes(stellarObjectId)) {
      this.stellarObjects.push(stellarObjectId);
    }
  }

  /**
   * Removes a stellar object from the corporation's assets
   * @param {number} stellarObjectId - The ID of the stellar object to remove
   */
  removeStellarObject(stellarObjectId) {
    const index = this.stellarObjects.indexOf(stellarObjectId);
    if (index > -1) {
      this.stellarObjects.splice(index, 1);
    }
  }

  /**
   * Adds a ship to the corporation's assets
   * @param {number} shipId - The ID of the ship to add
   */
  addShip(shipId) {
    if (!this.ships.includes(shipId)) {
      this.ships.push(shipId);
    }
  }

  /**
   * Removes a ship from the corporation's assets
   * @param {number} shipId - The ID of the ship to remove
   */
  removeShip(shipId) {
    const index = this.ships.indexOf(shipId);
    if (index > -1) {
      this.ships.splice(index, 1);
    }
  }

  /**
   * Adds goods to the corporation's inventory
   * @param {string} goodName - The name of the good
   * @param {number} quantity - The quantity to add
   */
  addGoods(goodName, quantity) {
    if (!this.goods[goodName]) {
      this.goods[goodName] = 0;
    }
    this.goods[goodName] += quantity;
  }

  /**
   * Removes goods from the corporation's inventory
   * @param {string} goodName - The name of the good
   * @param {number} quantity - The quantity to remove
   * @returns {boolean} True if successful, false if insufficient quantity
   */
  removeGoods(goodName, quantity) {
    if (!this.goods[goodName] || this.goods[goodName] < quantity) {
      return false;
    }
    this.goods[goodName] -= quantity;
    if (this.goods[goodName] === 0) {
      delete this.goods[goodName];
    }
    return true;
  }

  /**
   * Adds cash to a specific reserve category
   * @param {string} category - Reserve category to credit
   * @param {number} amount - Amount to add
   * @returns {boolean} True if successful, false otherwise
   */
  addCashReserve(category, amount) {
    if (!this.isValidCashReserveCategory(category) || typeof amount !== 'number' || amount <= 0) {
      return false;
    }
    this.cashReserves[category] += amount;
    return true;
  }

  /**
   * Spends cash from a specific reserve category
   * @param {string} category - Reserve category to debit
   * @param {number} amount - Amount to spend
   * @returns {boolean} True if successful, false when insufficient funds or invalid input
   */
  spendCashReserve(category, amount) {
    if (
      !category ||
      typeof amount !== 'number' ||
      amount <= 0 ||
      !this.isValidCashReserveCategory(category) ||
      this.cashReserves[category] < amount
    ) {
      return false;
    }
    this.cashReserves[category] -= amount;
    return true;
  }

  /**
   * Gets total corporation cash reserves across all categories
   * @returns {number} Total reserve amount
   */
  getTotalCashReserves() {
    return Object.values(this.cashReserves).reduce((total, amount) => total + amount, 0);
  }

  /**
   * Calculates the total value of all corporation assets
   * @param {Universe} universe - The universe object to get stellar object values
   * @param {Object} shipValues - Object mapping ship types/IDs to values
   * @param {Object} goodPrices - Object mapping good names to current prices
   * @returns {number} Total value of all assets
   */
  calculateTotalValue(universe, shipValues = {}, goodPrices = {}) {
    let totalValue = 0;

    // Add value of stellar objects
    this.stellarObjects.forEach(objId => {
      const stellarObject = universe.stellarObjects.find(obj => obj.id === objId);
      if (stellarObject && stellarObject.value) {
        totalValue += stellarObject.value;
      }
    });

    // Add value of ships
    this.ships.forEach(shipId => {
      // Ship values can be looked up by ID or type
      const shipValue = shipValues[shipId] || 0;
      totalValue += shipValue;
    });

    // Add value of goods in inventory
    Object.entries(this.goods).forEach(([goodName, quantity]) => {
      const price = goodPrices[goodName] || 0;
      totalValue += price * quantity;
    });

    totalValue += this.getTotalCashReserves();

    return totalValue;
  }

  /**
   * Gets a summary of all corporation assets
   * @returns {Object} Summary object with asset counts and lists
   */
  getAssetSummary() {
    return {
      name: this.name,
      description: this.description,
      isPlayerOwned: this.isPlayerOwned,
      stellarObjectCount: this.stellarObjects.length,
      stellarObjects: [...this.stellarObjects],
      shipCount: this.ships.length,
      ships: [...this.ships],
      goods: { ...this.goods },
      goodTypes: Object.keys(this.goods).length,
      cashReserves: { ...this.cashReserves },
      totalCashReserves: this.getTotalCashReserves()
    };
  }
}

module.exports = {
  Corporation
};

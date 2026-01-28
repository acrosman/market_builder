/**
 * Base class for entities that can trade and move around the universe
 * Both Player and NPC extend this class
 */
class Trader {
  /**
   * Create a trader
   * @param {string|number} id - Unique identifier for the trader
   * @param {number} location - System ID where trader is located
   * @param {string} ship - Ship type/name
   * @param {number} credits - Starting credits
   */
  constructor(id, location, ship, credits = 1000) {
    this.id = id;
    this.location = location;
    this.ship = ship;
    this.credits = credits;
    this.cargo = {};
  }

  /**
   * Move to a new system
   * @param {number} systemId - ID of the system to move to
   */
  moveTo(systemId) {
    this.location = systemId;
  }

  /**
   * Check if trader can afford a purchase
   * @param {number} cost - Cost to check
   * @returns {boolean} True if trader has enough credits
   */
  canAfford(cost) {
    return this.credits >= cost;
  }

  /**
   * Add credits to the trader's account
   * @param {number} amount - Amount to add
   */
  addCredits(amount) {
    this.credits += amount;
  }

  /**
   * Remove credits from the trader's account
   * @param {number} amount - Amount to remove
   * @returns {boolean} True if successful, false if insufficient credits
   */
  removeCredits(amount) {
    if (!this.canAfford(amount)) {
      return false;
    }
    this.credits -= amount;
    return true;
  }

  /**
   * Add goods to cargo
   * @param {string} goodName - Name of the good
   * @param {number} quantity - Quantity to add
   */
  addCargo(goodName, quantity) {
    if (!this.cargo[goodName]) {
      this.cargo[goodName] = 0;
    }
    this.cargo[goodName] += quantity;
  }

  /**
   * Remove goods from cargo
   * @param {string} goodName - Name of the good
   * @param {number} quantity - Quantity to remove
   * @returns {boolean} True if successful, false if insufficient quantity
   */
  removeCargo(goodName, quantity) {
    if (!this.cargo[goodName] || this.cargo[goodName] < quantity) {
      return false;
    }
    this.cargo[goodName] -= quantity;
    if (this.cargo[goodName] === 0) {
      delete this.cargo[goodName];
    }
    return true;
  }

  /**
   * Get the quantity of a specific good in cargo
   * @param {string} goodName - Name of the good
   * @returns {number} Quantity of the good (0 if not present)
   */
  getCargoQuantity(goodName) {
    return this.cargo[goodName] || 0;
  }
}

module.exports = { Trader };

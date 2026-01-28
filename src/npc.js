const { Trader } = require('./trader');

/**
 * Represents an NPC in the game
 * Extends Trader with NPC-specific functionality
 */
class NPC extends Trader {
  constructor(id, type, homeSystem) {
    // Call parent constructor with NPC-specific values
    super(id, homeSystem, 'Shuttle', 1000);

    this.type = type;
    this.homeSystem = homeSystem;
    this.currentSystem = homeSystem; // Alias for location for backward compatibility
  }

  /**
   * Override moveTo to keep currentSystem in sync with location
   * @param {number} systemId - ID of the system to move to
   */
  moveTo(systemId) {
    super.moveTo(systemId);
    this.currentSystem = systemId;
  }
}

module.exports = { NPC };

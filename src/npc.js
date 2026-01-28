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

module.exports = { NPC };

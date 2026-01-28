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
    this.dockedAt = null;  // ID of stellar object if docked
    this.landedOn = null;  // ID of stellar object if landed

    // Load ship data to initialize ship-specific properties
    const dataDir = settings.data_directory || 'data/default/en-us';
    const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'ships.json'), 'utf-8'));
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

module.exports = { Player };

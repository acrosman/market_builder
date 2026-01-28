const fs = require('fs');
const path = require('path');
const { Trader } = require('./trader');

/**
 * Represents a player in the game
 * Extends Trader with player-specific functionality
 */
class Player extends Trader {
  constructor(name, settings) {
    // Call parent constructor with player-specific values
    super(name, 1, settings.initial_ship, settings.starting_credits);

    this.name = name;
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

    this.stats = {
      jumps: 0,
      trades: 0,
      profit: 0,
    };
  }
}

module.exports = { Player };

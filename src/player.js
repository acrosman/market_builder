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

  /**
   * Get all corporations controlled by this player.
   * Includes direct player.corporation and any additional player-owned
   * corporations tracked in the game-level corporations list.
   * @param {Object[]} corporations - All game corporations
   * @returns {Object[]} Player-owned corporations
   * @example
   * const ownedCorporations = player.getOwnedCorporations(game.corporations);
   */
  getOwnedCorporations(corporations = []) {
    const ownedCorporations = [];

    if (this.corporation) {
      ownedCorporations.push(this.corporation);
    }

    if (!Array.isArray(corporations)) {
      return ownedCorporations;
    }

    corporations.forEach((corporation) => {
      if (!corporation?.isPlayerOwned) {
        return;
      }

      const alreadyIncluded = ownedCorporations.some(existing => existing?.name === corporation.name);
      if (!alreadyIncluded) {
        ownedCorporations.push(corporation);
      }
    });

    return ownedCorporations;
  }

  /**
   * Check if this player controls a stellar object directly or through a corporation.
   * @param {Object} stellarObject - Stellar object to check
   * @param {Object[]} corporations - All game corporations
   * @returns {boolean} True if the player controls the stellar object
   * @example
   * const isControlled = player.controlsStellarObject(stellarObject, game.corporations);
   */
  controlsStellarObject(stellarObject, corporations = []) {
    if (!stellarObject) {
      return false;
    }

    if (stellarObject.owner === this.name) {
      return true;
    }

    const ownedCorporations = this.getOwnedCorporations(corporations);
    const controlledByOwnerName = ownedCorporations.some((corporation) =>
      corporation?.name && stellarObject.owner === corporation.name
    );
    if (controlledByOwnerName) {
      return true;
    }

    const stellarObjectId = Number(stellarObject.id);
    return ownedCorporations.some((corporation) =>
      Array.isArray(corporation?.stellarObjects) &&
      corporation.stellarObjects.some(assetId => Number(assetId) === stellarObjectId)
    );
  }
}

module.exports = { Player };

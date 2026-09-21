const { RandomSource } = require('./rng');
const { Ledger } = require('./ledger');
const { CostBasis } = require('./costBasis');

/**
 * Schema version for the economy save block.
 *
 * This is versioned independently of the overall save file so economy
 * subsystems can evolve without forcing a migration of universe, player, or
 * corporation data. Bump this whenever the shape of `toJSON()` output changes
 * in a way `fromJSON()` cannot infer, and handle the older shape in
 * `fromJSON()`.
 */
const ECONOMY_SCHEMA_VERSION = 1;

/**
 * Container for all economy and exchange simulation state.
 *
 * This exists to solve a specific persistence hazard. `Game.getSaveData()`
 * serializes `player` and `corporations` as live class instances, so new fields
 * are written to disk, but the deserializers copy hand-maintained field lists,
 * so those fields come back undefined. Saves look fine and loads are quietly
 * lossy. Rather than extend that pattern, everything the economy owns lives
 * under one key that serializes and restores itself, with its own version.
 *
 * Today it holds only the random source. The ledger, listings, portfolios, and
 * agent state will hang off this same object as they are built.
 */
class EconomyState {
  /**
   * Create economy state.
   * @param {Object} [options={}] - Construction options.
   * @param {number|string} [options.seed] - Master seed for deterministic replay.
   *   Generated from the current time when omitted, then persisted, so a new
   *   game varies but a loaded game replays exactly.
   * @example
   * const economy = new EconomyState({ seed: 'game-0001' });
   */
  constructor(options = {}) {
    const seed = options.seed ?? Date.now();
    this.random = new RandomSource(seed);
    this.ledger = new Ledger();
    this.costBasis = new CostBasis();
    // Last tick production was run through. Persisted so day boundaries are not
    // lost or double-counted across a save and load.
    this.lastProductionTick = Number(options.lastProductionTick) || 0;
  }

  /**
   * Get the random source owned by this economy.
   * @returns {RandomSource} The economy's random source.
   * @example
   * const noise = game.getEconomy().getRandom().stream('price-noise');
   */
  getRandom() {
    return this.random;
  }

  /**
   * Get the double-entry ledger.
   * @returns {Ledger} The economy's ledger.
   * @example
   * game.getEconomy().getLedger().balance(holder, ACCOUNTS.CASH);
   */
  getLedger() {
    return this.ledger;
  }

  /**
   * Get the inventory cost basis tracker.
   *
   * Kept in step with the ledger's INVENTORY account: every acquisition posts
   * to both, and every consumption releases the cost recorded here.
   * @returns {CostBasis} The economy's cost basis tracker.
   * @example
   * game.getEconomy().getCostBasis().averageCost(holder, 'metal');
   */
  getCostBasis() {
    return this.costBasis;
  }

  /**
   * Serialize economy state for saving.
   * @returns {Object} Plain serializable object carrying its own schema version.
   * @example
   * const block = economy.toJSON();
   */
  toJSON() {
    return {
      schemaVersion: ECONOMY_SCHEMA_VERSION,
      random: this.random.toJSON(),
      ledger: this.ledger.toJSON(),
      costBasis: this.costBasis.toJSON(),
      lastProductionTick: this.lastProductionTick
    };
  }

  /**
   * Rebuild economy state from saved data.
   *
   * Tolerant by design: a save written before the economy existed has no
   * economy block at all, and must still load into a playable game rather than
   * throwing. Missing data yields fresh state.
   * @param {Object} [data] - Serialized economy block, or undefined for old saves.
   * @returns {EconomyState} Restored economy state.
   * @example
   * const economy = EconomyState.fromJSON(saveData.economy);
   */
  static fromJSON(data) {
    const economy = new EconomyState({ seed: data?.random?.seed ?? 0 });

    if (data?.random) {
      economy.random = RandomSource.fromJSON(data.random);
    }

    economy.ledger = Ledger.fromJSON(data?.ledger);
    economy.costBasis = CostBasis.fromJSON(data?.costBasis);
    economy.lastProductionTick = Number(data?.lastProductionTick) || 0;

    return economy;
  }
}

module.exports = {
  EconomyState,
  ECONOMY_SCHEMA_VERSION
};

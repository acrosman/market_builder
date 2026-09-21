const fs = require('fs');
const path = require('path');
const { Corporation } = require('./corporation');
const { EventBus } = require('./eventBus');
const { Player } = require('./player');
const { NPC } = require('./npc');
const { Market } = require('./market');
const { getLocalizedGameMessage } = require('./gameMessages');
const { createLogger } = require('./logger');
const { createConstructionCreditSupport } = require('./stellarObject');
const { EconomyState } = require('./economy/economyState');
const { loadContent } = require('./contentCache');
const { EconomyTicker } = require('./economy/economyTicker');
const { operatorHolder } = require('./economy/production');
const { ticksPerQuarter } = require('./economy/clock');
const {
  recordOpeningBalance,
  recordOpeningStock,
  recordGoodsTrade,
  recordConstructionSpend,
  recordLoanDraw,
  recordLoanPayment
} = require('./economy/transactions');
const {
  BANK_HOLDER,
  corporationHolder,
  playerHolder,
  marketHolder
} = require('./economy/accounts');

const logger = createLogger('Game');

const DEFAULT_DATA_DIRECTORY = 'data/default/en-us';

/**
 * Schema version for the overall save file.
 *
 * Saves written before versioning existed have no `schemaVersion` field and are
 * treated as version 0. Bump this when the top-level save shape changes in a
 * way `loadGame()` cannot infer. Subsystems that own nested blocks, such as the
 * economy, carry their own independent version.
 */
const SAVE_SCHEMA_VERSION = 1;

/**
 * Opening cash endowments, in credits.
 *
 * Markets are endowed generously enough that their cash never binds in normal
 * play, preserving the long-standing behaviour that a market will absorb any
 * quantity a player wants to sell. The constraint exists in the books and can
 * be made to bite later by lowering this number, without touching the ledger.
 */
const OPENING_ENDOWMENTS = {
  bank: 100000000,
  market: 10000000
};

/**
 * Throw when a value is not a non-null object.
 * @param {*} value - Value to validate.
 * @param {string} label - Property name used in the error message.
 * @returns {void}
 * @throws {TypeError} When the value is not a non-null object.
 * @example
 * assertObject(universe, 'universe');
 */
function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-null object`);
  }
}

/**
 * Throw when a value is not an array of non-null objects.
 * @param {*} value - Value to validate.
 * @param {string} label - Property name used in the error message.
 * @returns {void}
 * @throws {TypeError} When the value is not an array of objects.
 * @example
 * assertObjectArray(npcs, 'npcs');
 */
function assertObjectArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  if (value.some(entry => entry === null || typeof entry !== 'object')) {
    throw new TypeError(`${label} must only contain non-null objects`);
  }
}

/**
 * Throw when a value is not an integer greater than or equal to zero.
 * @param {*} value - Value to validate.
 * @param {string} label - Property name used in the error message.
 * @returns {void}
 * @throws {TypeError} When the value is not a non-negative integer.
 * @example
 * assertNonNegativeInteger(ticks, 'ticks');
 */
function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

/**
 * Main game state manager.
 *
 * All mutable state is reached through the accessor methods below. Callers
 * should never read or write the backing properties directly so that type and
 * range checks stay in one place.
 */
class Game {

  /**
   * Create a game session.
   * @param {Object} universe - Universe instance holding systems and stellar objects.
   * @param {Object} settings - Resolved game settings.
   * @param {Object} [options={}] - Optional session options.
   * @param {number|string} [options.seed] - Master seed for economy determinism.
   *   Omit for a new game to get a generated seed.
   * @param {EconomyState} [options.economy] - Pre-built economy state, used by
   *   `loadGame()` to restore exact PRNG positions. Takes precedence over seed.
   * @example
   * const game = new Game(universe, gameSettings);
   */
  constructor(universe, settings, options = {}) {
    assertObject(universe, 'universe');
    assertObject(settings, 'settings');

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
    // Economy and exchange state. Session-scoped like universe/market: established
    // here and never swapped, because subsystems hold references into it.
    this.economy = options.economy instanceof EconomyState
      ? options.economy
      : new EconomyState({ seed: options.seed });
  }

  /**
   * Get the universe for this game session.
   * Read-only by design: Market caches its own universe reference and stellar
   * objects subscribe to tick events at setup, so swapping the universe on a
   * live Game would leave both out of sync. Build a new Game instead.
   * @returns {Object} Universe instance.
   * @example
   * const systems = game.getUniverse().systems;
   */
  getUniverse() {
    return this.universe;
  }

  /**
   * Get the resolved game settings.
   * @returns {Object} Game settings.
   * @example
   * const startingCredits = game.getSettings().starting_credits;
   */
  getSettings() {
    return this.settings;
  }

  /**
   * Get the configured content data directory, falling back to the default.
   * @returns {string} Relative data directory path.
   * @example
   * const dataDir = game.getDataDirectory();
   */
  getDataDirectory() {
    return this.settings.data_directory || DEFAULT_DATA_DIRECTORY;
  }

  /**
   * Get the event bus used for tick notifications.
   * @returns {Object} EventBus instance.
   * @example
   * game.getEventBus().subscribe('tick', stellarObject);
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * Get the economy and exchange state for this game session.
   * Read-only by design, matching the other session-scoped collaborators:
   * subsystems hold references into it, so swapping it on a live Game would
   * leave them out of sync. Build a new Game instead, as loadGame() does.
   * @returns {Object} EconomyState instance.
   * @example
   * const noise = game.getEconomy().getRandom().stream('price-noise');
   */
  getEconomy() {
    return this.economy;
  }

  /**
   * Get the market manager for this game session.
   * @returns {Object} Market instance.
   * @example
   * game.getMarket().initializeMarkets();
   */
  getMarket() {
    return this.market;
  }

  /**
   * Get the active player.
   * @returns {Object|null} Player instance, or null before initialization.
   * @example
   * const credits = game.getPlayer().credits;
   */
  getPlayer() {
    return this.player;
  }

  /**
   * Set the active player.
   * @param {Object} player - Player instance.
   * @returns {void}
   * @throws {TypeError} When the value is not a Player instance.
   * @example
   * game.setPlayer(new Player('Captain', settings));
   */
  setPlayer(player) {
    if (!(player instanceof Player)) {
      throw new TypeError('player must be a Player instance');
    }
    this.player = player;
  }

  /**
   * Get the NPC traders in this game session.
   * @returns {Object[]} Shallow copy of the NPC list.
   * @example
   * const localNpcs = game.getNPCs().filter(npc => npc.currentSystem === 1);
   */
  getNPCs() {
    return [...this.npcs];
  }

  /**
   * Replace the NPC trader list.
   * @param {Object[]} npcs - NPC instances or serialized NPC data.
   * @returns {void}
   * @throws {TypeError} When the value is not an array of objects.
   * @example
   * game.setNPCs(saveData.npcs);
   */
  setNPCs(npcs) {
    assertObjectArray(npcs, 'npcs');
    this.npcs = [...npcs];
  }

  /**
   * Add a single NPC trader to the game.
   * @param {Object} npc - NPC instance.
   * @returns {void}
   * @throws {TypeError} When the NPC is not an object.
   * @example
   * game.addNPC(new NPC(2, 'trader', 2));
   */
  addNPC(npc) {
    assertObject(npc, 'npc');
    this.npcs.push(npc);
  }

  /**
   * Get every corporation in this game session.
   * @returns {Object[]} Shallow copy of the corporation list.
   * @example
   * const playerCompanies = player.getOwnedCorporations(game.getCorporations());
   */
  getCorporations() {
    return [...this.corporations];
  }

  /**
   * Replace the corporation list.
   * @param {Object[]} corporations - Corporation instances.
   * @returns {void}
   * @throws {TypeError} When the value is not an array of objects.
   * @example
   * game.setCorporations(rebuiltCorporations);
   */
  setCorporations(corporations) {
    assertObjectArray(corporations, 'corporations');
    this.corporations = [...corporations];
  }

  /**
   * Add a corporation to the game.
   * @param {Object} corporation - Corporation instance.
   * @returns {void}
   * @throws {TypeError} When the corporation is not an object.
   * @example
   * game.addCorporation(new Corporation('Acme', 'A trading company', true, 0));
   */
  addCorporation(corporation) {
    assertObject(corporation, 'corporation');
    this.corporations.push(corporation);
  }

  /**
   * Find a corporation by name.
   * @param {string} name - Corporation name to match.
   * @returns {Object|null} Matching corporation, or null when not found.
   * @example
   * const corporation = game.findCorporation('Acme Corp');
   */
  findCorporation(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }
    return this.corporations.find(corporation => corporation.name === name) || null;
  }

  /**
   * Get the current turn counter.
   * @returns {number} Completed turns.
   * @example
   * const turn = game.getTurn();
   */
  getTurn() {
    return this.turn;
  }

  /**
   * Set the turn counter.
   * @param {number} turn - Non-negative turn count.
   * @returns {void}
   * @throws {TypeError} When the turn is not a non-negative integer.
   * @example
   * game.setTurn(saveData.turn);
   */
  setTurn(turn) {
    assertNonNegativeInteger(turn, 'turn');
    this.turn = turn;
  }

  /**
   * Get the elapsed game time in ticks.
   * @returns {number} Total ticks elapsed.
   * @example
   * const elapsed = game.getTicks();
   */
  getTicks() {
    return this.ticks;
  }

  /**
   * Set the elapsed game time in ticks.
   * @param {number} ticks - Non-negative tick count.
   * @returns {void}
   * @throws {TypeError} When the tick count is not a non-negative integer.
   * @example
   * game.setTicks(saveData.ticks);
   */
  setTicks(ticks) {
    assertNonNegativeInteger(ticks, 'ticks');
    this.ticks = ticks;
  }

  /**
   * Get the system ids the player has visited.
   * @returns {number[]} Shallow copy of explored system ids.
   * @example
   * const explored = game.getExploredSystems();
   */
  getExploredSystems() {
    return [...this.exploredSystems];
  }

  /**
   * Replace the explored system list.
   * @param {number[]} systemIds - System ids the player has visited.
   * @returns {void}
   * @throws {TypeError} When the value is not an array.
   * @example
   * game.setExploredSystems(saveData.exploredSystems);
   */
  setExploredSystems(systemIds) {
    if (!Array.isArray(systemIds)) {
      throw new TypeError('exploredSystems must be an array');
    }
    this.exploredSystems = [...systemIds];
  }

  /**
   * Check whether a system has already been explored.
   * @param {number} systemId - System id to check.
   * @returns {boolean} True when the system has been visited.
   * @example
   * const seen = game.hasExploredSystem(3);
   */
  hasExploredSystem(systemId) {
    return this.exploredSystems.includes(systemId);
  }

  /**
   * Record a system as explored, ignoring duplicates.
   * @param {number} systemId - System id to record.
   * @returns {boolean} True when the system was newly recorded.
   * @example
   * game.addExploredSystem(game.getPlayer().location);
   */
  addExploredSystem(systemId) {
    if (this.hasExploredSystem(systemId)) {
      return false;
    }
    this.exploredSystems.push(systemId);
    return true;
  }

  /**
   * Resolve a localized message for results returned to the renderer.
   * @param {string} messageKey - Dot-delimited key from game_messages.json.
   * @param {Object} [vars={}] - Template variables for token replacement.
   * @param {string} [fallback=''] - English fallback when the key is missing.
   * @returns {string} Localized message text.
   * @example
   * const reason = game.getMessage('navigation.reasons.cannot_dock', {}, 'Cannot dock at this object');
   */
  getMessage(messageKey, vars = {}, fallback = '') {
    return getLocalizedGameMessage(this.getDataDirectory(), messageKey, vars, fallback, { logger });
  }

  /**
   * Initialize a new game.
   * @param {Object} playerData - Player information from the creation screen.
   * @returns {void}
   * @example
   * game.initializeGame({ name: 'Captain', pronouns, description, corporation });
   */
  initializeGame(playerData) {
    // Create player with proper starting location (location 1, set in the constructor)
    const player = new Player(playerData.name, this.getSettings());
    player.pronouns = playerData.pronouns;
    player.description = playerData.description;
    this.setPlayer(player);

    // Create player's corporation
    const playerCorp = new Corporation(
      playerData.corporation?.name || 'Unknown Corp',
      playerData.corporation?.description || 'A trading company',
      true,  // isPlayerOwned
      playerData.corporation?.cashReserves || 0
    );
    this.addCorporation(playerCorp);
    player.corporation = playerCorp;

    // Initialize stellar object values and ownership
    this.initializeStellarObjects();

    // Find a Farm World planet (not in system 1) and assign it to the player's corporation
    const farmPlanet = this.getUniverse().stellarObjects.find(obj =>
      obj.type === 'Planet' &&
      obj.className === 'Farm World' &&
      obj.location !== 1
    );

    if (farmPlanet) {
      farmPlanet.setOwner(playerCorp.name);
      playerCorp.addStellarObject(farmPlanet.id);
    } else {
      logger.warn('No Farm World found outside system 1; player corporation starts without a planet');
    }

    // Create NPCs (one trader per system for now)
    this.getUniverse().systems.forEach((system) => {
      if (system.id === 1) return; // Skip player's starting system
      this.addNPC(new NPC(system.id, 'trader', system.id));
    });

    // Initialize market prices and quantities
    this.getMarket().initializeMarkets();

    // Mark starting system as explored
    this.addExploredSystem(player.location);

    // Record opening balances once markets are stocked, so their opening stock
    // gets a cost basis. Loads skip this: the journal is restored instead.
    this.recordOpeningBalances();

    // Subscribe all stellar objects to tick events for automatic updates
    this.subscribeStellarObjectsToTicks();
  }

  /**
   * Record every opening balance into the ledger.
   *
   * Starting credits, corporate reserves, bank capital, and the goods markets
   * are stocked with at world generation all arrive from outside the simulation,
   * so they are the only defined sources of value. Booking them as contributed
   * capital means every later movement is a transfer between holders, which is
   * what makes money conservation an assertable invariant rather than a hope.
   *
   * Runs once, at game start only. A loaded game already has these entries in
   * its restored journal.
   * @returns {void}
   * @example
   * game.recordOpeningBalances();
   */
  recordOpeningBalances() {
    const economy = this.getEconomy();
    const tick = this.getTicks();
    const player = this.getPlayer();

    // A holder is keyed by name, so an unnamed player or corporation cannot be
    // tracked. Warn and skip rather than throwing: bookkeeping must not be able
    // to stop a game from starting, and a silent skip would hide the bad state.
    const openingBalanceFor = (holder, amount, label) => {
      if (!holder?.id) {
        logger.warn(`Skipping opening balance for unnamed ${label}`);
        return;
      }
      recordOpeningBalance(economy, { tick, holder, amount });
    };

    if (player) {
      openingBalanceFor(playerHolder(player), player.credits, 'player');
    }

    this.getCorporations().forEach(corporation => {
      openingBalanceFor(
        corporationHolder(corporation),
        corporation.getTotalCashReserves(),
        'corporation'
      );
    });

    recordOpeningBalance(economy, {
      tick,
      holder: BANK_HOLDER,
      amount: OPENING_ENDOWMENTS.bank
    });

    this.recordOpeningMarketBalances();
  }

  /**
   * Endow each market with cash and record the cost basis of its opening stock.
   *
   * The assumed unit cost is the good's base value from goods.json. Without a
   * basis, a market's first sale would book its entire sale price as profit and
   * every market would look implausibly profitable to anyone valuing it.
   * @returns {void}
   * @example
   * game.recordOpeningMarketBalances();
   */
  recordOpeningMarketBalances() {
    const economy = this.getEconomy();
    const tick = this.getTicks();
    const goodsData = this.getGoodsData();

    this.getUniverse().stellarObjects.forEach(stellarObject => {
      const inventory = stellarObject.marketState?.inventory;
      if (!inventory) {
        return;
      }

      // Match the trading counterparty so opening stock, production, and sales
      // all land on one set of books.
      const holder = operatorHolder(stellarObject, this.getCorporations());

      // Endow independent markets deeply enough that their cash never binds,
      // preserving the behaviour that a market absorbs any quantity a player
      // sells. A corporation-owned world trades on its owner's real books and
      // gets no endowment: handing it one would show up directly as company
      // value and make every owned world look ten million credits richer than
      // it is.
      if (holder.kind === marketHolder(stellarObject).kind) {
        recordOpeningBalance(economy, {
          tick,
          holder,
          amount: OPENING_ENDOWMENTS.market
        });
      }

      Object.entries(inventory).forEach(([goodName, quantity]) => {
        const units = Math.round(Number(quantity) || 0);
        if (units <= 0) {
          return;
        }

        const unitValue = Number(goodsData[goodName]?.value) || 0;
        recordOpeningStock(economy, {
          tick,
          holder,
          goodName,
          quantity: units,
          totalCost: Math.round(unitValue * units)
        });
      });
    });
  }

  /**
   * Load the goods catalog from the configured data directory.
   * @returns {Object} Parsed goods.json contents, or an empty object on failure.
   * @example
   * const goods = game.getGoodsData();
   */
  getGoodsData() {
    return loadContent('goods', this.getDataDirectory());
  }

  /**
   * Subscribe every stellar object to tick events for automatic updates.
   * EventBus listeners are not persisted, so this runs on new games and loads.
   * @returns {void}
   * @example
   * game.subscribeStellarObjectsToTicks();
   */
  subscribeStellarObjectsToTicks() {
    const eventBus = this.getEventBus();
    this.getUniverse().stellarObjects.forEach(obj => {
      eventBus.subscribe('tick', obj);
    });

    this.subscribeEconomyToTicks();
  }

  /**
   * Subscribe the economy to tick events.
   *
   * Like the stellar object subscriptions this is behaviour rather than state,
   * so it is not persisted and must be re-registered on both new games and
   * loads. Subscribing is idempotent, but a fresh ticker is created each time
   * so it binds to the current Game.
   * @returns {void}
   * @example
   * game.subscribeEconomyToTicks();
   */
  subscribeEconomyToTicks() {
    this.economyTicker = new EconomyTicker(this);
    this.getEventBus().subscribe('tick', this.economyTicker);
  }

  /**
   * Initialize stellar object values and ownership.
   * @returns {void}
   * @example
   * game.initializeStellarObjects();
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
    this.getUniverse().stellarObjects.forEach(obj => {
      // Calculate the object's value
      obj.value = obj.calculateValue(baseValues);

      // Set initial ownership - all objects start as Independent
      // Players can acquire them through gameplay
      obj.setOwner('Independent');
    });
  }

  /**
   * Process one game turn.
   * @returns {void}
   * @example
   * game.processTurn();
   */
  processTurn() {
    this.setTurn(this.getTurn() + 1);

    // Recharge ship energy
    this.rechargeShipEnergy();

    // Process NPC actions
    this.processNPCActions();

    // Update market conditions
    this.updateMarkets();
  }

  /**
   * Advance game time by the specified number of ticks.
   * Events are emitted one at a time to allow subscribers to react to each tick.
   *
   * The payload distinguishes two different quantities, and subscribers must not
   * confuse them:
   * - `ticks` is the **cumulative** game clock after this tick (1, 2, 3, ...).
   * - `delta` is the number of ticks **elapsed in this event**, always 1 today.
   *
   * Time-based subscribers (population growth, construction, interest accrual)
   * must use `delta`. Using `ticks` as an elapsed amount compounds every update
   * by the whole age of the game.
   *
   * @param {number} [numTicks=1] - Number of ticks to advance.
   * @param {string} [action='unknown'] - The action that triggered this tick.
   * @returns {Object} Final tick event data as `{ ticks, delta, action }`.
   * @example
   * const tickData = game.advanceTicks(3, 'jump');
   * // emits three events; the last is { ticks: 3, delta: 1, action: 'jump' }
   */
  advanceTicks(numTicks = 1, action = 'unknown') {
    let lastTickData;

    // Emit events one at a time so subscribers can count/react to each tick
    for (let i = 0; i < numTicks; i++) {
      this.setTicks(this.getTicks() + 1);

      lastTickData = {
        ticks: this.getTicks(),
        delta: 1,
        action
      };

      // Emit tick event so other systems can react
      this.getEventBus().emit('tick', lastTickData);
    }

    return lastTickData;
  }

  /**
   * Process all NPC actions for the current turn.
   * @returns {void}
   * @example
   * game.processNPCActions();
   */
  processNPCActions() {
    this.getNPCs().forEach(npc => {
      // TODO: Implement NPC behavior
      // This will be expanded when we add AI behavior
    });
  }

  /**
   * Update market conditions across all systems.
   * @returns {void}
   * @example
   * game.updateMarkets();
   */
  updateMarkets() {
    // TODO: Implement market updates
    // This will be implemented when we add the economic system
  }

  /**
   * Get the current state of the player's location.
   * @returns {Object} Location state information.
   * @example
   * const { system, objects } = game.getCurrentLocationState();
   */
  getCurrentLocationState() {
    const universe = this.getUniverse();
    const system = universe.systems.find(s => s.id === this.getPlayer().location);
    const objects = universe.stellarObjects.filter(obj => obj.location === system.id);

    return {
      system: system,
      objects: objects,
      npcs: this.getNPCs().filter(npc => npc.currentSystem === system.id),
      playerState: this.getPlayerState()
    };
  }

  /**
   * Get the stellar object where the player is currently docked/landed.
   * @returns {Object|null} Current local stellar object, or null in space.
   * @example
   * const localObject = game.getCurrentLocalObject();
   */
  getCurrentLocalObject() {
    const player = this.getPlayer();
    const objectId = player.dockedAt ?? player.landedOn;
    if (objectId === null || objectId === undefined) {
      return null;
    }
    return this.findStellarObject(objectId);
  }

  /**
   * Find a stellar object by id.
   * @param {number} stellarObjectId - Stellar object id.
   * @returns {Object|null} Matching stellar object, or null when not found.
   * @example
   * const station = game.findStellarObject(12);
   */
  findStellarObject(stellarObjectId) {
    return this.getUniverse().stellarObjects.find(obj => obj.id === stellarObjectId) || null;
  }

  /**
   * Load building definitions from configured data directory.
   * @returns {Object} Building definitions keyed by type.
   * @example
   * const buildings = game.getBuildingsData();
   */
  getBuildingsData() {
    return loadContent('buildings', this.getDataDirectory());
  }

  /**
   * Get buildings that can be built at the player's current object.
   * @returns {Object[]} List of build options.
   * @example
   * const options = game.getBuildableBuildingsForCurrentObject();
   */
  getBuildableBuildingsForCurrentObject() {
    const stellarObject = this.getCurrentLocalObject();
    const isControlledByPlayer = this.getPlayer()?.controlsStellarObject(stellarObject, this.getCorporations());
    if (!stellarObject || !isControlledByPlayer) {
      return [];
    }

    return stellarObject.getBuildableBuildingOptions(this.getBuildingsData());
  }

  /**
   * Queue construction of a building at the player's current object.
   * @param {string} buildingType - Building type from buildings.json.
   * @returns {Object} Build result.
   * @example
   * const result = game.buildBuildingAtCurrentObject('Mine');
   */
  buildBuildingAtCurrentObject(buildingType) {
    const stellarObject = this.getCurrentLocalObject();
    if (!stellarObject) {
      return {
        success: false,
        reason: this.getMessage(
          'construction.reasons.not_docked_or_landed',
          {},
          'You must be docked or landed to build'
        )
      };
    }

    const isControlledByPlayer = this.getPlayer()?.controlsStellarObject(stellarObject, this.getCorporations());
    if (!isControlledByPlayer) {
      return {
        success: false,
        reason: this.getMessage(
          'construction.reasons.not_controlled',
          {},
          'You do not control this stellar object'
        )
      };
    }

    const creditSupport = createConstructionCreditSupport(
      stellarObject,
      this.getPlayer(),
      this.getCorporations(),
      (messageKey, vars = {}, fallback = '') => this.getMessage(messageKey, vars, fallback)
    );

    // Construction credit can be drawn from corporate reserves, player credits,
    // or both, and the credit support reports only success. Snapshot each source
    // so the ledger records who actually paid what.
    const controllingCorporation = stellarObject.findControllingCorporation(
      this.getPlayer(),
      this.getCorporations()
    );
    const reservesBefore = Game.corporationCash(controllingCorporation);
    const playerCreditsBefore = this.getPlayer()?.credits ?? 0;

    const buildResult = stellarObject.constructBuilding(buildingType, this.getBuildingsData(), creditSupport);
    if (!buildResult.success) {
      return buildResult;
    }

    this.recordConstructionSpends(stellarObject, buildingType, {
      corporation: controllingCorporation,
      reservesBefore,
      playerCreditsBefore
    });

    return {
      ...buildResult,
      objectId: stellarObject.id
    };
  }

  /**
   * Read a corporation's spendable cash tolerantly.
   *
   * Mirrors the accessor chain in `createConstructionCreditSupport`, which
   * accepts corporation-shaped objects that expose only a `cashReserves` field.
   * @param {Object} [corporation] - Corporation or corporation-shaped object.
   * @returns {number} Spendable cash, or 0 when unavailable.
   * @example
   * const cash = Game.corporationCash(corporation);
   */
  static corporationCash(corporation) {
    return Number(
      corporation?.getTotalCashReserves?.() ?? corporation?.cashReserves ?? 0
    ) || 0;
  }

  /**
   * Post the credits a completed construction consumed to the ledger.
   *
   * The spend is capitalized to PROPERTY rather than expensed, so building does
   * not depress income in the period, and the credits are paid to the location's
   * local economy rather than destroyed.
   * @param {Object} stellarObject - Object that was built on.
   * @param {string} buildingType - Building type constructed.
   * @param {Object} sources - Pre-construction balances.
   * @param {Object} [sources.corporation] - Controlling corporation, if any.
   * @param {number} sources.reservesBefore - Corporate reserves before the build.
   * @param {number} sources.playerCreditsBefore - Player credits before the build.
   * @returns {void}
   * @example
   * game.recordConstructionSpends(object, 'Mine', sources);
   */
  recordConstructionSpends(stellarObject, buildingType, sources) {
    const economy = this.getEconomy();
    const tick = this.getTicks();
    const refs = { stellarObjectId: stellarObject.id, buildingType };

    // The location's local economy supplies the labour and materials. This
    // holder represents the location itself, so it applies to objects without a
    // tradeable market too; otherwise construction there would destroy credits.
    const recipient = marketHolder(stellarObject);

    const { corporation, reservesBefore, playerCreditsBefore } = sources;

    const corporationSpent = corporation
      ? reservesBefore - Game.corporationCash(corporation)
      : 0;
    if (corporationSpent > 0) {
      recordConstructionSpend(economy, {
        tick,
        spender: corporationHolder(corporation),
        recipient,
        amount: corporationSpent,
        refs
      });
    }

    const playerSpent = playerCreditsBefore - (this.getPlayer()?.credits ?? 0);
    if (playerSpent > 0) {
      recordConstructionSpend(economy, {
        tick,
        spender: playerHolder(this.getPlayer()),
        recipient,
        amount: playerSpent,
        refs
      });
    }
  }

  /**
   * Get the current state of the player.
   * @returns {Object} Player state information.
   * @example
   * const playerState = game.getPlayerState();
   */
  getPlayerState() {
    const player = this.getPlayer();

    // Calculate corporation value if player has a corporation
    let corporationValue = 0;
    if (player.corporation && typeof player.corporation.calculateTotalValue === 'function') {
      // TODO: Add ship values and good prices when available
      corporationValue = player.corporation.calculateTotalValue(this.getUniverse(), {}, {});
    }

    return {
      name: player.name,
      credits: player.credits,
      location: player.location,
      ship: player.ship,
      shipEnergy: player.shipEnergy,
      shipMaxEnergy: player.shipMaxEnergy,
      cargo: player.cargo,
      stats: player.stats,
      dockedAt: player.dockedAt,
      landedOn: player.landedOn,
      system: player.location,
      ticks: this.getTicks(),
      corporation: {
        name: player.corporation?.name || 'None',
        description: player.corporation?.description || '',
        value: corporationValue,
        stellarObjects: player.corporation?.stellarObjects || [],
        cashReserves: player.corporation?.cashReserves || 0,
        totalCashReserves: player.corporation?.getTotalCashReserves?.() || 0
      }
    };
  }

  /**
  * Take off from a planet or station (clear docked/landed state).
  * @returns {Object} Result of the takeoff operation.
  * @example
  * const result = game.takeOff();
  */
  takeOff() {
    const player = this.getPlayer();
    if (player.dockedAt === null && player.landedOn === null) {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.not_docked_or_landed', {}, 'Not docked or landed')
      };
    }
    player.dockedAt = null;
    player.landedOn = null;

    // Advance game time by 1 tick
    this.advanceTicks(1, 'takeoff');

    return {
      success: true,
      locationState: this.getCurrentLocationState()
    };
  }

  /**
   * Check if a jump to the target system is valid.
   * @param {number} targetSystemId - ID of the system to jump to.
   * @returns {Object} Result of validation {valid: boolean, reason: string}.
   * @example
   * const { valid, reason } = game.validateJump(4);
   */
  validateJump(targetSystemId) {
    const universe = this.getUniverse();
    const player = this.getPlayer();

    // Check if the target system exists
    const targetSystem = universe.systems.find(s => s.id === targetSystemId);
    if (!targetSystem) {
      return {
        valid: false,
        reason: this.getMessage('navigation.reasons.target_system_missing', {}, 'Target system does not exist')
      };
    }

    // Check if current system has a connection to the target system
    const currentSystem = universe.systems.find(s => s.id === player.location);
    if (!currentSystem.connections[targetSystemId]) {
      return {
        valid: false,
        reason: this.getMessage('navigation.reasons.no_connection', {}, 'No direct connection to target system')
      };
    }

    // Check if ship has enough energy for the jump
    if (player.shipEnergy < player.energyPerJump) {
      return {
        valid: false,
        reason: this.getMessage('navigation.reasons.insufficient_energy', {}, 'Not enough energy for jump')
      };
    }

    return { valid: true };
  }

  /**
   * Perform a jump to the target system.
   * @param {number} targetSystemId - ID of the system to jump to.
   * @returns {Object} Result of the jump operation.
   * @example
   * const result = game.jumpToSystem(4);
   */
  jumpToSystem(targetSystemId) {
    // Validate the jump
    const validation = this.validateJump(targetSystemId);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const player = this.getPlayer();

    // Consume energy for the jump
    player.shipEnergy -= player.energyPerJump;

    // Get the current system to find tick cost for this jump
    const currentSystem = this.getUniverse().systems.find(s => s.id === player.location);
    const tickCost = currentSystem?.connections?.[targetSystemId] || 1;

    // Update player location
    player.moveTo(targetSystemId);

    // Update player stats
    player.stats.jumps += 1;

    // Mark the new system as explored
    this.addExploredSystem(player.location);

    // Advance game time by the connection's tick cost
    this.advanceTicks(tickCost, 'jump');

    // Return the new location state
    return {
      success: true,
      locationState: this.getCurrentLocationState()
    };
  }

  /**
   * Dock at a station.
   * @param {number} objectId - ID of the stellar object to dock at.
   * @returns {Object} Result of the dock operation.
   * @example
   * const result = game.dockAtStation(100);
   */
  dockAtStation(objectId) {
    const player = this.getPlayer();

    // Validate the object exists and is in the current system
    const object = this.findStellarObject(objectId);
    if (!object) {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.station_missing', {}, 'Station does not exist')
      };
    }

    if (object.location !== player.location) {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.station_not_in_system', {}, 'Station is not in your current system')
      };
    }

    // Check if object is a station
    if (object.type !== 'Space Station') {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.cannot_dock', {}, 'Cannot dock at this object')
      };
    }

    // Dock at the station
    player.dockedAt = objectId;
    player.landedOn = null; // Clear landed status if previously landed
    player.stats.trades += 1; // Increment trades stat when docking

    // Fully recharge ship energy when docking
    player.shipEnergy = player.shipMaxEnergy;

    // Advance game time by 1 tick
    this.advanceTicks(1, 'dock');

    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      dockedObject: object
    };
  }

  /**
   * Land on a planet or asteroid.
   * @param {number} objectId - ID of the stellar object to land on.
   * @returns {Object} Result of the land operation.
   * @example
   * const result = game.landOnPlanet(100);
   */
  landOnPlanet(objectId) {
    const player = this.getPlayer();
    const object = this.findStellarObject(objectId);
    if (!object) {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.planet_missing', {}, 'Planet does not exist')
      };
    }

    if (object.location !== player.location) {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.planet_not_in_system', {}, 'Planet is not in your current system')
      };
    }

    // Check if object is a planet or asteroid
    if (object.type !== 'Planet' && object.type !== 'Asteroid') {
      return {
        success: false,
        reason: this.getMessage('navigation.reasons.cannot_land', {}, 'Can only land on planets or asteroids')
      };
    }

    // Land on the planet
    player.landedOn = objectId;
    player.dockedAt = null; // Clear docked status if previously docked
    player.stats.trades += 1; // Increment trades stat when landing

    // Fully recharge ship energy when landing
    player.shipEnergy = player.shipMaxEnergy;

    // Advance game time by 1 tick
    this.advanceTicks(1, 'land');

    return {
      success: true,
      locationState: this.getCurrentLocationState(),
      landedObject: object
    };
  }

  /**
   * Calculate the market price of a good at a stellar object.
   * @param {Object} stellarObject - Stellar object with a market.
   * @param {string} goodName - Name of the good to price.
   * @param {string} [priceType='buy'] - Either 'buy' or 'sell'.
   * @returns {number} Price per unit.
   * @example
   * const price = game.calculateMarketPrice(stellarObject, 'wheat', 'buy');
   */
  calculateMarketPrice(stellarObject, goodName, priceType = 'buy') {
    return this.getMarket().calculateMarketPrice(stellarObject, goodName, priceType);
  }

  /**
   * Get the ledger holder that trades on a stellar object's market.
   *
   * A world owned by a corporation trades on that corporation's books, so the
   * goods it produces and the credits from selling them belong to the owner.
   * That is what makes owning and developing a world profitable, and it is what
   * gives corporations the revenue a valuation needs to read. An independent
   * world trades on its own local account.
   *
   * This must agree with the operator used by production, or goods would be
   * produced onto one set of books and sold from another: the producer's
   * inventory would grow forever while the seller booked sales with no cost.
   * @param {number} stellarObjectId - ID of the stellar object.
   * @returns {Object} Holder reference for the market's counterparty.
   * @example
   * const seller = game.marketCounterparty(3);
   */
  marketCounterparty(stellarObjectId) {
    const stellarObject = this.findStellarObject(stellarObjectId);
    if (!stellarObject) {
      return marketHolder(stellarObjectId);
    }
    return operatorHolder(stellarObject, this.getCorporations());
  }

  /**
   * Buy goods from a stellar object.
   * @param {number} stellarObjectId - ID of the stellar object.
   * @param {string} goodName - Name of the good to buy.
   * @param {number} quantity - Quantity to buy.
   * @param {number} [price] - Price per unit (recalculated for verification).
   * @returns {Object} Result object with success status and message.
   * @example
   * const result = game.buyGood(1, 'wheat', 5);
   */
  buyGood(stellarObjectId, goodName, quantity, price) {
    const result = this.getMarket().buyGood(
      this.getPlayer(), stellarObjectId, goodName, quantity, price
    );

    if (result.success) {
      recordGoodsTrade(this.getEconomy(), {
        tick: this.getTicks(),
        buyer: playerHolder(this.getPlayer()),
        seller: this.marketCounterparty(stellarObjectId),
        goodName: result.goodName,
        quantity: result.quantity,
        totalPrice: result.totalPrice,
        refs: { stellarObjectId }
      });
    }

    return result;
  }

  /**
   * Sell goods to a stellar object.
   * @param {number} stellarObjectId - ID of the stellar object.
   * @param {string} goodName - Name of the good to sell.
   * @param {number} quantity - Quantity to sell.
   * @param {number} [price] - Price per unit (recalculated for verification).
   * @returns {Object} Result object with success status and message.
   * @example
   * const result = game.sellGood(1, 'wheat', 5);
   */
  sellGood(stellarObjectId, goodName, quantity, price) {
    const result = this.getMarket().sellGood(
      this.getPlayer(), stellarObjectId, goodName, quantity, price
    );

    if (result.success) {
      recordGoodsTrade(this.getEconomy(), {
        tick: this.getTicks(),
        buyer: this.marketCounterparty(stellarObjectId),
        seller: playerHolder(this.getPlayer()),
        goodName: result.goodName,
        quantity: result.quantity,
        totalPrice: result.totalPrice,
        refs: { stellarObjectId }
      });
    }

    return result;
  }

  /**
   * Take a loan for a corporation and record it in the ledger.
   *
   * Orchestrated here rather than in `Corporation.takeLoan` so the corporation
   * stays a plain state holder with no dependency on the economy, matching how
   * goods trades work. It also closes a real hole: `takeLoan` on its own adds
   * cash reserves with no counterparty, creating credits from nothing. Posting
   * the draw against the bank makes it a transfer.
   * @param {string} corporationName - Name of the borrowing corporation.
   * @param {number} amount - Principal to borrow.
   * @returns {Object|null} The created loan, or null when the request is invalid.
   * @example
   * const loan = game.takeCorporationLoan('Acme Orbital', 50000);
   */
  takeCorporationLoan(corporationName, amount) {
    const corporation = this.findCorporation(corporationName);
    if (!corporation) {
      return null;
    }

    // Balloon structure: the whole balance falls due one year out by default.
    // A dated, public cliff is what makes the credit risk priceable.
    const termTicks = ticksPerQuarter(this.getSettings())
      * (this.getSettings().loan_term_quarters || 4);
    const loan = corporation.takeLoan(amount, {
      originTick: this.getTicks(),
      maturityTick: this.getTicks() + termTicks
    });
    if (!loan) {
      return null;
    }

    recordLoanDraw(this.getEconomy(), {
      tick: this.getTicks(),
      borrower: corporationHolder(corporation),
      amount: loan.principal,
      refs: { loanId: loan.id }
    });

    return loan;
  }

  /**
   * Make a payment against a corporation loan and record it in the ledger.
   * @param {string} corporationName - Name of the paying corporation.
   * @param {number} loanId - Loan identifier.
   * @param {number} amount - Amount to apply to the loan.
   * @returns {boolean} True when the payment succeeded.
   * @example
   * game.makeCorporationLoanPayment('Acme Orbital', 1, 5000);
   */
  makeCorporationLoanPayment(corporationName, loanId, amount) {
    const corporation = this.findCorporation(corporationName);
    if (!corporation) {
      return false;
    }

    // Capture what the payment will actually apply before it is made: an
    // overpayment is capped at the remaining balance, so posting the requested
    // amount would put the ledger out of step with the corporation's reserves.
    const applied = corporation.loanPaymentApplied(loanId, Number(amount));

    if (!corporation.makeLoanPayment(loanId, amount)) {
      return false;
    }

    recordLoanPayment(this.getEconomy(), {
      tick: this.getTicks(),
      borrower: corporationHolder(corporation),
      amount: applied,
      refs: { loanId }
    });

    return true;
  }

  /**
   * Load passengers from a stellar object.
   * @param {number} stellarObjectId - ID of the stellar object.
   * @param {number} passengerCount - Number of passengers to load.
   * @returns {Object} Result object with success status and message.
   * @example
   * const result = game.loadPassengers(1, 10);
   */
  loadPassengers(stellarObjectId, passengerCount) {
    const stellarObject = this.findStellarObject(stellarObjectId);
    if (!stellarObject) {
      return {
        success: false,
        message: this.getMessage('passengers.stellar_object_missing', {}, 'Stellar object not found')
      };
    }

    const player = this.getPlayer();

    // Check if player is docked or landed at the location
    if (player.dockedAt !== stellarObjectId && player.landedOn !== stellarObjectId) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.not_at_location',
          {},
          'You must be docked or landed at this location'
        )
      };
    }

    // Ensure passengerCount is a positive integer before any arithmetic runs
    const requestedCount = parseInt(passengerCount, 10);
    if (isNaN(requestedCount) || requestedCount <= 0) {
      return {
        success: false,
        message: this.getMessage('passengers.invalid_count', {}, 'Invalid passenger count')
      };
    }

    // Calculate available passengers. A zero or missing population limit (for
    // example an Abandoned Station) makes the percentage NaN, which would slip
    // past every comparison below and drive population negative.
    const population = stellarObject.population;
    if (!population || !(population.limit > 0)) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.population_too_low',
          {},
          'Population is too low. People are not willing to leave.'
        )
      };
    }

    const populationPercent = (population.current / population.limit) * 100;

    if (populationPercent < 25) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.population_too_low',
          {},
          'Population is too low. People are not willing to leave.'
        )
      };
    }

    const willingPercent = ((populationPercent - 25) / 75) * 50;
    const availablePassengers = Math.floor((population.current * willingPercent) / 100);

    if (requestedCount > availablePassengers) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.insufficient_available',
          { availablePassengers },
          `Only ${availablePassengers} passengers available`
        )
      };
    }

    // Check cargo capacity (10 people per ton)
    const cargoNeeded = requestedCount / 10;
    const currentCargo = this.calculateCargoUsed();
    const shipsData = loadContent('ships', this.getDataDirectory());
    const cargoCapacity = shipsData[player.ship].cargoCapacity;

    if (currentCargo + cargoNeeded > cargoCapacity) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.insufficient_cargo_space',
          {
            cargoNeeded: cargoNeeded.toFixed(2),
            availableSpace: (cargoCapacity - currentCargo).toFixed(2)
          },
          `Insufficient cargo space. Need ${cargoNeeded.toFixed(2)} tons, only ${(cargoCapacity - currentCargo).toFixed(2)} available`
        )
      };
    }

    // Execute transaction
    stellarObject.population.current -= requestedCount;
    player.cargo.passengers = (player.cargo.passengers || 0) + requestedCount;

    return {
      success: true,
      message: this.getMessage(
        'passengers.load_success',
        { passengerCount: requestedCount, cargoUsed: cargoNeeded.toFixed(2) },
        `Loaded ${requestedCount} passengers (${cargoNeeded.toFixed(2)} tons)`
      )
    };
  }

  /**
   * Unload passengers at a stellar object.
   * @param {number} stellarObjectId - ID of the stellar object.
   * @param {number} passengerCount - Number of passengers to unload.
   * @returns {Object} Result object with success status and message.
   * @example
   * const result = game.unloadPassengers(1, 10);
   */
  unloadPassengers(stellarObjectId, passengerCount) {
    // Ensure passengerCount is a valid integer
    const requestedCount = parseInt(passengerCount, 10);
    const player = this.getPlayer();

    // Check if player is landed or docked at the location
    if (player.dockedAt !== stellarObjectId && player.landedOn !== stellarObjectId) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.not_at_location',
          {},
          'You must be docked or landed at this location'
        )
      };
    }

    // Find the stellar object
    const stellarObject = this.findStellarObject(stellarObjectId);
    if (!stellarObject) {
      return {
        success: false,
        message: this.getMessage('passengers.stellar_object_missing', {}, 'Stellar object not found')
      };
    }

    // Check if player has passengers
    const currentPassengers = player.cargo.passengers || 0;
    if (currentPassengers === 0) {
      return {
        success: false,
        message: this.getMessage('passengers.none_in_cargo', {}, 'No passengers in cargo')
      };
    }

    if (isNaN(requestedCount) || requestedCount <= 0) {
      return {
        success: false,
        message: this.getMessage('passengers.invalid_count', {}, 'Invalid passenger count')
      };
    }

    if (requestedCount > currentPassengers) {
      return {
        success: false,
        message: this.getMessage(
          'passengers.insufficient_on_board',
          { currentPassengers },
          `You only have ${currentPassengers} passengers on board`
        )
      };
    }

    // Check population limit
    if (stellarObject.population.current + requestedCount > stellarObject.population.limit) {
      const availableSpace = stellarObject.population.limit - stellarObject.population.current;
      return {
        success: false,
        message: this.getMessage(
          'passengers.capacity_exceeded',
          { availableSpace },
          `Location can only accept ${availableSpace} more passengers`
        )
      };
    }

    // Execute transaction
    stellarObject.population.current += requestedCount;
    player.cargo.passengers -= requestedCount;

    // Remove passengers from cargo if count reaches 0
    if (player.cargo.passengers === 0) {
      delete player.cargo.passengers;
    }

    const cargoFreed = (requestedCount / 10).toFixed(2);
    return {
      success: true,
      message: this.getMessage(
        'passengers.unload_success',
        { passengerCount: requestedCount, cargoFreed },
        `Unloaded ${requestedCount} passengers (freed ${cargoFreed} tons)`
      )
    };
  }

  /**
   * Calculate total cargo space used.
   * @returns {number} Cargo space used in tons.
   * @example
   * const used = game.calculateCargoUsed();
   */
  calculateCargoUsed() {
    return this.getMarket().calculateCargoUsed(this.getPlayer());
  }

  /**
   * Recharge ship energy (called during turn processing).
   * @returns {void}
   * @example
   * game.rechargeShipEnergy();
   */
  rechargeShipEnergy() {
    const player = this.getPlayer();
    if (player.shipEnergy < player.shipMaxEnergy) {
      player.shipEnergy = Math.min(
        player.shipMaxEnergy,
        player.shipEnergy + player.energyRecharge
      );
    }
  }

  /**
   * Get the current game state data for saving.
   * @returns {Object} Save data object with plain serializable objects.
   * @example
   * const saveData = game.getSaveData();
   */
  getSaveData() {
    const universe = this.getUniverse();

    // Convert universe to plain object to avoid circular references
    const universeData = {
      systems: universe.systems.map(sys => ({
        id: sys.id,
        name: sys.name,
        connections: sys.connections,
        image: sys.image
      })),
      stellarObjects: universe.stellarObjects.map(obj => ({
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
      schemaVersion: SAVE_SCHEMA_VERSION,
      universe: universeData,
      player: this.getPlayer(),
      corporations: this.getCorporations(),
      npcs: this.getNPCs(),
      turn: this.getTurn(),
      ticks: this.getTicks(),
      settings: this.getSettings(),
      exploredSystems: this.getExploredSystems(),
      economy: this.getEconomy().toJSON()
    };
  }

  /**
   * Save the current game to a file in the repository saves/ directory.
   * @param {string} filename - Base filename (without extension).
   * @returns {string} Absolute path to the written save file.
   * @example
   * const savePath = game.saveGame('quicksave');
   */
  saveGame(filename) {
    const saveDir = path.join(__dirname, '..', 'saves');
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const savePath = path.join(saveDir, `${filename}.json`);
    fs.writeFileSync(savePath, JSON.stringify(this.getSaveData(), null, 2), 'utf8');
    return savePath;
  }

  /**
   * Load a saved game state.
   * @param {Object|string} saveData - Saved game data, or a save filename without extension.
   * @returns {Game} Loaded game instance.
   * @example
   * const game = Game.loadGame('quicksave');
   */
  static loadGame(saveData) {
    // If a filename (string) is provided, read the file from repository saves/ directory
    if (typeof saveData === 'string') {
      const savePath = path.join(__dirname, '..', 'saves', `${saveData}.json`);
      if (!fs.existsSync(savePath)) {
        throw new Error(`Save file not found: ${savePath}`);
      }
      saveData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    }

    const universe = Game.deserializeUniverse(saveData.universe);

    // Economy state is restored at construction, including exact mid-stream PRNG
    // positions, so a loaded session replays identically. Saves written before
    // the economy existed carry no block and get fresh state instead of throwing.
    const game = new Game(universe, saveData.settings, {
      economy: EconomyState.fromJSON(saveData.economy)
    });

    game.setPlayer(Game.deserializePlayer(saveData.player, saveData.settings));
    game.setNPCs(saveData.npcs || []);
    game.setTurn(saveData.turn || 0);
    game.setTicks(saveData.ticks || 0);
    game.setExploredSystems(saveData.exploredSystems || []);

    // Reconstruct corporations with proper Corporation instances
    if (Array.isArray(saveData.corporations)) {
      game.setCorporations(saveData.corporations.map(corpData => Game.deserializeCorporation(corpData)));

      // Restore the player's corporation reference with the proper Corporation instance
      const player = game.getPlayer();
      if (player.corporation) {
        const playerCorp = game.findCorporation(player.corporation.name);
        if (playerCorp) {
          player.corporation = playerCorp;
        }
      }
    }

    // Note: EventBus listeners are not persisted; they must be re-registered after load
    game.subscribeStellarObjectsToTicks();

    return game;
  }

  /**
   * Rebuild a Universe instance from saved plain data.
   * @param {Object} universeData - Serialized universe from a save file.
   * @returns {Object} Universe instance with systems and stellar objects.
   * @example
   * const universe = Game.deserializeUniverse(saveData.universe);
   */
  static deserializeUniverse(universeData) {
    const { Universe, System, StellarObject } = require('./universe');
    const universe = new Universe();

    universe.systems = (universeData.systems || []).map(sysData => {
      const sys = new System(sysData.id, sysData.name);
      sys.connections = sysData.connections || {};
      sys.image = sysData.image || '';
      return sys;
    });

    universe.stellarObjects = (universeData.stellarObjects || []).map(objData => {
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

      // Restore population, buildings, and military state
      if (objData.population) obj.population = { ...objData.population };
      if (objData.buildings) obj.buildings = { ...objData.buildings };
      if (objData.buildingsUnderConstruction) {
        obj.buildingsUnderConstruction = [...objData.buildingsUnderConstruction];
      }
      if (objData.fighters !== undefined) obj.fighters = objData.fighters;

      // Restore market and shipyard states
      if (objData.marketState) obj.marketState = JSON.parse(JSON.stringify(objData.marketState));
      if (objData.shipyardState) obj.shipyardState = JSON.parse(JSON.stringify(objData.shipyardState));

      return obj;
    });

    return universe;
  }

  /**
   * Rebuild a Player instance from saved plain data.
   * @param {Object} playerData - Serialized player from a save file.
   * @param {Object} settings - Game settings used to seed defaults.
   * @returns {Object} Player instance.
   * @example
   * const player = Game.deserializePlayer(saveData.player, saveData.settings);
   */
  static deserializePlayer(playerData, settings) {
    const savedPlayerData = playerData || {};
    const player = new Player(savedPlayerData.name || 'Player', settings);

    player.location = savedPlayerData.location ?? player.location;
    player.ship = savedPlayerData.ship ?? player.ship;
    player.credits = savedPlayerData.credits ?? player.credits;
    player.cargo = savedPlayerData.cargo ?? player.cargo;
    player.shipEnergy = savedPlayerData.shipEnergy ?? player.shipEnergy;
    player.shipMaxEnergy = savedPlayerData.shipMaxEnergy ?? player.shipMaxEnergy;
    player.energyPerJump = savedPlayerData.energyPerJump ?? player.energyPerJump;
    player.energyRecharge = savedPlayerData.energyRecharge ?? player.energyRecharge;
    player.dockedAt = savedPlayerData.dockedAt ?? null;
    player.landedOn = savedPlayerData.landedOn ?? null;
    player.pronouns = savedPlayerData.pronouns ?? player.pronouns;
    player.description = savedPlayerData.description ?? player.description;
    player.stats = { ...player.stats, ...savedPlayerData.stats };
    player.corporation = savedPlayerData.corporation;

    return player;
  }

  /**
   * Rebuild a Corporation instance from saved plain data.
   * @param {Object} corpData - Serialized corporation from a save file.
   * @returns {Object} Corporation instance.
   * @example
   * const corporation = Game.deserializeCorporation(saveData.corporations[0]);
   */
  static deserializeCorporation(corpData) {
    const corp = new Corporation(
      corpData.name,
      corpData.description,
      corpData.isPlayerOwned,
      0
    );

    // Set the cash position directly rather than through the constructor: an
    // overdrawn corporation has a negative balance, and normalizeCashReserves
    // floors negatives to zero, which would quietly erase the deficit on load.
    // The raw value is passed through so setCashPosition can still recognize
    // the object shape older saves use.
    corp.setCashPosition(corpData.cashReserves ?? 0);

    corp.stellarObjects = corpData.stellarObjects || [];
    corp.ships = corpData.ships || [];
    corp.goods = corpData.goods || {};
    corp.dividendRate = corpData.dividendRate || 0;
    corp.sharesIssued = corpData.sharesIssued || 0;

    // Solvency state. These must be listed here or they would be written to the
    // save and silently not restored, which is the standing hazard with this
    // hand-maintained field list: a bankrupt corporation would quietly come
    // back solvent, and a deficit clock would restart on every load.
    corp.deficitSinceTick = Number.isFinite(Number(corpData.deficitSinceTick))
      ? Number(corpData.deficitSinceTick)
      : null;
    corp.isBankrupt = Boolean(corpData.isBankrupt);
    corp.bankruptSinceTick = Number.isFinite(Number(corpData.bankruptSinceTick))
      ? Number(corpData.bankruptSinceTick)
      : null;
    corp.loans = Array.isArray(corpData.loans) ? corpData.loans.map(loan => ({ ...loan })) : [];

    const maxLoanId = corp.loans.reduce((maxId, loan) => {
      const loanId = Number(loan?.id);
      if (!Number.isFinite(loanId) || loanId < 0) {
        return maxId;
      }
      return Math.max(maxId, loanId);
    }, 0);

    const savedNextLoanId = Number(corpData.nextLoanId);
    corp.nextLoanId = Number.isFinite(savedNextLoanId) && savedNextLoanId > 0
      ? savedNextLoanId
      : Math.max(1, maxLoanId + 1);

    return corp;
  }
}

module.exports = {
  Game
};

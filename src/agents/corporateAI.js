const { loadContent } = require('../contentCache');
const { Corporation } = require('../corporation');
const { ACCOUNTS, corporationHolder, marketHolder } = require('../economy/accounts');
const { recordConstructionSpend } = require('../economy/transactions');
const { ticksPerDay } = require('../economy/clock');
/**
 * Build a construction credit source backed by one corporation's treasury.
 *
 * `createConstructionCreditSupport` resolves who is paying through the player,
 * since it exists for the player's own building. An NPC corporation has no
 * player to resolve through, so it funds construction directly rather than
 * bending a player-centric helper into a shape it was not meant for.
 * @param {Object} corporation - The paying corporation.
 * @param {Function} getMessage - Message resolver for failure reasons.
 * @returns {Object} Credit support for constructBuilding.
 * @example
 * const support = corporateCreditSupport(corporation, resolver);
 */
function corporateCreditSupport(corporation, getMessage) {
  return {
    getMessage: (messageKey, vars = {}, fallback = '') => (
      typeof getMessage === 'function' ? getMessage(messageKey, vars, fallback) : fallback
    ),
    get availableCredits() {
      return Number(corporation.getTotalCashReserves?.() ?? corporation.cashReserves ?? 0) || 0;
    },
    spendCredits: (amount) => {
      const spend = Math.round(Number(amount) || 0);
      if (spend <= 0) {
        return true;
      }
      return corporation.spendCashReserve(spend);
    }
  };
}

/** Defaults for the npc_corporations settings block. */
const DEFAULT_NPC_CORPORATIONS = {
  count: 12,
  starting_cash: 250000,
  max_objects_each: 3,
  build_cash_floor: 100000,
  build_check_days: 7
};

/**
 * Corporations the player does not control.
 *
 * The exchange needs companies whose fortunes actually differ, or every listing
 * prices the same and there is nothing to choose between. These own real worlds
 * on the real map, produce real goods, and keep real books, so their statements
 * are a summary of what happened to them rather than a stochastic process
 * dressed up as one.
 *
 * Their behaviour is deliberately simple: hold a cash buffer, and spend the
 * surplus developing the worlds they own. That is enough to make them diverge,
 * because the worlds differ in what they can produce and how many people they
 * must feed, so the same policy produces different results. A richer policy can
 * come later without changing anything around it.
 */

/**
 * Read NPC corporation configuration, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Configuration.
 * @example
 * const config = npcCorporationConfig(game.getSettings());
 */
function npcCorporationConfig(settings = {}) {
  const configured = settings.npc_corporations || {};
  const read = (key) => {
    const value = Number(configured[key]);
    return Number.isFinite(value) ? value : DEFAULT_NPC_CORPORATIONS[key];
  };
  return {
    count: read('count'),
    startingCash: read('starting_cash'),
    maxObjectsEach: read('max_objects_each'),
    buildCashFloor: read('build_cash_floor'),
    buildCheckDays: read('build_check_days')
  };
}

/**
 * Generate distinct corporation names from the content name pool.
 * @param {number} count - How many names are needed.
 * @param {Object} stream - Seeded random stream.
 * @param {string} [dataDir] - Data directory.
 * @returns {Array<string>} Distinct names.
 * @example
 * corporationNames(12, random.stream('npc-names'));
 */
function corporationNames(count, stream, dataDir = 'data/default/en-us') {
  const pool = loadContent('corporation_names', dataDir);
  const prefixes = Array.isArray(pool.prefixes) ? pool.prefixes : [];
  const suffixes = Array.isArray(pool.suffixes) ? pool.suffixes : [];

  if (prefixes.length === 0 || suffixes.length === 0) {
    return [];
  }

  const names = new Set();
  // Bounded so an exhausted pool cannot spin forever
  const attempts = count * 20;

  for (let i = 0; i < attempts && names.size < count; i += 1) {
    names.add(`${stream.pick(prefixes)} ${stream.pick(suffixes)}`);
  }

  return [...names];
}

/**
 * Create the NPC corporations and give each of them worlds to run.
 *
 * Worlds are handed out from the independent ones that can actually be built
 * on, because a corporation owning an asteroid it cannot develop would sit
 * inert and report nothing. The player's own holdings are untouched.
 * @param {Object} game - The game to populate.
 * @returns {Array<Object>} The corporations created.
 * @example
 * createNpcCorporations(game);
 */
function createNpcCorporations(game) {
  const settings = game.getSettings();
  const config = npcCorporationConfig(settings);
  const economy = game.getEconomy();
  const stream = economy.getRandom().stream('npc-corporations');

  const names = corporationNames(
    config.count, stream, settings.data_directory || 'data/default/en-us'
  );
  if (names.length === 0) {
    return [];
  }

  // Only worlds that can be developed and can hold goods are worth owning
  const available = stream.shuffle(
    game.getUniverse().stellarObjects.filter(
      object => object.owner === 'Independent'
        && object.capabilities?.buildings
        && object.marketState
    )
  );

  const created = [];
  let next = 0;

  names.forEach(name => {
    // Cash is set on the corporation only. Game.recordOpeningBalances runs after
    // this and posts every corporation's reserves to the ledger; posting here
    // as well would credit each of them twice.
    const corporation = new Corporation(
      name, 'An independent operator', false, config.startingCash
    );
    game.addCorporation(corporation);

    const wanted = stream.int(1, Math.max(1, config.maxObjectsEach));
    for (let i = 0; i < wanted && next < available.length; i += 1) {
      const object = available[next];
      next += 1;
      object.setOwner(corporation.name);
      corporation.addStellarObject(object.id);
    }

    created.push(corporation);
  });

  return created;
}

/** Building fields that make a building earn rather than merely exist. */
const PRODUCTIVE_FIELDS = ['farming', 'mining', 'recycling'];

/**
 * Score a building by how useful it is to a corporation that wants income.
 *
 * Buildings that extract goods come first, because they are the only ones that
 * generate revenue and therefore the only ones that make one company's
 * statements differ from another's. Everything else is a fallback so a world
 * with nothing productive available still develops.
 * @param {Object} buildingData - Definition from buildings.json.
 * @returns {number} Higher is more attractive.
 * @example
 * buildingScore(buildingsData.Mine);
 */
function buildingScore(buildingData) {
  return PRODUCTIVE_FIELDS.reduce(
    (score, field) => score + (Number(buildingData?.[field]) || 0),
    0
  );
}

/**
 * Choose and start one building for a corporation that can afford it.
 *
 * Candidates are tried in order rather than filtered up front. Whether a
 * building can actually be started depends on the credits and goods available
 * at that moment, which `constructBuilding` is the authority on, so the
 * reliable way to find a buildable option is to attempt them.
 * @param {Object} params - Build parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.corporation - The corporation building.
 * @param {Object} params.stellarObject - The world to build on.
 * @returns {Object|null} The build result, or null when nothing was started.
 * @example
 * buildOnWorld({ game, corporation, stellarObject });
 */
function buildOnWorld({ game, corporation, stellarObject }) {
  const buildingsData = game.getBuildingsData();
  const options = stellarObject.getBuildableBuildingOptions(buildingsData);

  if (options.length === 0) {
    return null;
  }

  // Productive first, then cheapest, then by name so the choice is stable
  const ranked = [...options].sort((a, b) => {
    const scoreDifference = buildingScore(b.data) - buildingScore(a.data);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const costA = Number(a.buildCost?.credits) || 0;
    const costB = Number(b.buildCost?.credits) || 0;
    return costA - costB || String(a.type).localeCompare(String(b.type));
  });

  for (const option of ranked) {
    const cost = Number(option.buildCost?.credits) || 0;
    if (cost > corporation.getTotalCashReserves()) {
      continue;
    }

    const creditSupport = corporateCreditSupport(
      corporation,
      (messageKey, vars = {}, fallback = '') => game.getMessage(messageKey, vars, fallback)
    );

    const before = corporation.getTotalCashReserves();
    const result = stellarObject.constructBuilding(option.type, buildingsData, creditSupport);
    if (!result.success) {
      continue;
    }

    const spent = before - corporation.getTotalCashReserves();
    if (spent > 0) {
      recordConstructionSpend(game.getEconomy(), {
        tick: game.getTicks(),
        spender: corporationHolder(corporation),
        recipient: marketHolder(stellarObject),
        amount: spent,
        refs: { stellarObjectId: stellarObject.id, buildingType: option.type }
      });
      corporation.setCashPosition(
        game.getEconomy().getLedger().balance(
          corporationHolder(corporation), ACCOUNTS.CASH
        )
      );
    }

    return { ...result, buildingType: option.type, stellarObjectId: stellarObject.id };
  }

  return null;
}

/**
 * Run one decision cycle for every NPC corporation.
 *
 * Runs on a slower cadence than production, because a corporation deciding
 * every day would build out every world it owns almost immediately and the
 * differences between them would collapse.
 * @param {Object} params - Cycle parameters.
 * @param {Object} params.game - The game.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Array<Object>} Builds started this cycle.
 * @example
 * runCorporateAI({ game, tick: 168 });
 */
function runCorporateAI({ game, tick }) {
  const settings = game.getSettings();
  const config = npcCorporationConfig(settings);
  const economy = game.getEconomy();
  const ledger = economy.getLedger();
  const started = [];

  game.getCorporations().forEach(corporation => {
    if (corporation.isPlayerOwned || corporation.isBankrupt) {
      return;
    }
    if (!Array.isArray(corporation.stellarObjects) || corporation.stellarObjects.length === 0) {
      return;
    }

    // Keep a buffer rather than spending to the last credit: a corporation with
    // no cash is one bad quarter from a forced loan and a downgrade.
    const cash = ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH);
    if (cash <= config.buildCashFloor) {
      return;
    }

    // Develop the least developed world first, so holdings grow together
    const worlds = corporation.stellarObjects
      .map(objectId => game.findStellarObject(objectId))
      .filter(Boolean)
      .sort((a, b) => {
        const builtA = Object.values(a.buildings || {})
          .reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
        const builtB = Object.values(b.buildings || {})
          .reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
        return builtA - builtB || a.id - b.id;
      });

    for (const stellarObject of worlds) {
      const result = buildOnWorld({ game, corporation, stellarObject });
      if (result) {
        started.push({ corporationName: corporation.name, ...result });
        break;
      }
    }
  });

  return started;
}

/**
 * How many ticks between corporate decision cycles.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Ticks per cycle.
 * @example
 * corporateCycleTicks(settings);
 */
function corporateCycleTicks(settings = {}) {
  return npcCorporationConfig(settings).buildCheckDays * ticksPerDay(settings);
}

module.exports = {
  DEFAULT_NPC_CORPORATIONS,
  corporateCreditSupport,
  PRODUCTIVE_FIELDS,
  buildingScore,
  npcCorporationConfig,
  corporationNames,
  createNpcCorporations,
  buildOnWorld,
  runCorporateAI,
  corporateCycleTicks
};

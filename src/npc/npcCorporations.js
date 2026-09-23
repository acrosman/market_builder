const { loadContent } = require('../contentCache');
const { Corporation } = require('../corporation');
const { ACCOUNTS, corporationHolder, marketHolder } = require('../economy/accounts');
const { appraiseCorporation } = require('../economy/appraisal');
const { recordConstructionSpend } = require('../economy/transactions');
const { ticksPerDay } = require('../economy/clock');
const { defaultProbability } = require('../economy/appraisal');
const { SIDES } = require('../exchange/auction');
const { settingsBlock, numericReader } = require('../settings');
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
  const read = numericReader(settings, 'npc_corporations');
  const configured = settingsBlock(settings, 'npc_corporations');
  return {
    count: read('count'),
    startingCash: read('starting_cash'),
    maxObjectsEach: read('max_objects_each'),
    buildCashFloor: read('build_cash_floor'),
    buildCheckDays: read('build_check_days'),
    dividendRateRange: configured.dividend_rate_range,
    acquisitionCashFloor: read('acquisition_cash_floor'),
    acquisitionDistressThreshold: read('acquisition_distress_threshold'),
    acquisitionDiscount: read('acquisition_discount'),
    agentMix: configured.agent_mix || {}
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

  const description = game.getMessage(
    'npc_corporations.default_description', {}, ''
  );

  names.forEach(name => {
    // Cash is set on the corporation only. Game.recordOpeningBalances runs after
    // this and posts every corporation's reserves to the ledger; posting here
    // as well would credit each of them twice.
    const corporation = new Corporation(
      name, description, false, config.startingCash
    );

    // Each pays out a different share of its earnings. Without a rate they
    // reinvested everything, which compounded their value implausibly fast and
    // left their shares worth holding only for what the next buyer would pay.
    const [lowRate, highRate] = config.dividendRateRange;
    corporation.setDividendRate(stream.int(lowRate, highRate));

    corporation.setAgentName(pickAgentName(config.agentMix, stream));

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

/**
 * Choose an agent for a new corporation, weighted by the configured mix.
 *
 * The mix is `{ agentName: weight }` from settings, so which strategies exist
 * in a given game is a setting rather than a code change. A weight of zero
 * keeps an agent registered but unused, which is how the military agent sits
 * dormant until invasion mechanics exist.
 * @param {Object} mix - Agent name to relative weight.
 * @param {Object} stream - A seeded random stream.
 * @returns {string} The chosen agent name.
 * @example
 * pickAgentName({ market: 3, military: 1 }, stream); // => 'market'
 */
function pickAgentName(mix, stream) {
  const { DEFAULT_AGENT_NAME, agentNames } = require('./agents');

  const weighted = agentNames()
    .map(name => ({ name, weight: Math.max(0, Number(mix?.[name]) || 0) }))
    .filter(entry => entry.weight > 0);

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return DEFAULT_AGENT_NAME;
  }

  let roll = stream.float(0, total);
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.name;
    }
  }

  return weighted[weighted.length - 1].name;
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


/**
 * Run one decision cycle for every NPC corporation.
 *
 * Each corporation is driven by its agent, so what a company does is a property
 * of the strategy it was assigned rather than a branch in here. This function
 * only decides who gets a turn, gathers the context every agent needs, and
 * labels what came back.
 * @param {Object} params - Cycle parameters.
 * @param {Object} params.game - The game.
 * @param {number} params.tick - Current absolute game tick.
 * @param {boolean} [params.buildThisCycle=false] - Whether the slower build
 *   cadence has come round this tick.
 * @returns {Array<Object>} Every action taken, each tagged with its corporation.
 * @example
 * runNpcCorporations({ game, tick: 168, buildThisCycle: true });
 */
function runNpcCorporations({ game, tick, buildThisCycle = false }) {
  const { agentFor } = require('./agents');
  const { distressedTargets } = require('./agents/marketAgent');

  // Appraising every listing once per cycle rather than once per bidder
  const targets = distressedTargets({ game, tick });
  const actions = [];

  game.getCorporations().forEach(corporation => {
    if (corporation.isPlayerOwned || corporation.isBankrupt) {
      return;
    }

    const agent = agentFor(corporation.agentName);
    const taken = agent.act({ game, corporation, tick, targets, buildThisCycle }) || [];

    taken.forEach(action => {
      actions.push({ corporationName: corporation.name, ...action });
    });
  });

  return actions;
}

module.exports = {
  npcCorporationConfig,
  corporationNames,
  createNpcCorporations,
  corporateCreditSupport,
  corporateCycleTicks,
  pickAgentName,
  runNpcCorporations
};

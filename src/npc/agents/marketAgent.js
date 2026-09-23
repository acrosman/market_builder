const { ACCOUNTS, corporationHolder, marketHolder } = require('../../economy/accounts');
const { recordConstructionSpend } = require('../../economy/transactions');
const { defaultProbability, appraiseCorporation } = require('../../economy/appraisal');
const { SIDES } = require('../../exchange/auction');
const { npcCorporationConfig, corporateCreditSupport } = require('../npcCorporations');

/**
 * The market agent: grow by building and by buying rivals on the exchange.
 *
 * This is the strategy the game shipped with and the baseline the others are
 * measured against. It does everything through the market -- it develops the
 * worlds it owns and bids for failing rivals at a discount -- and takes nothing
 * by force.
 *
 * Its policy is deliberately plain: keep a cash buffer, develop the least
 * developed world, and pursue one acquisition target at a time. The worlds
 * themselves differ enough that one policy already produces divergent
 * companies, so complexity here buys less than it costs.
 */

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
 * Pick the world this corporation should develop next.
 *
 * Least developed first, so a company's holdings grow together rather than one
 * world becoming a city while the rest stay empty.
 * @param {Object} game - The game.
 * @param {Object} corporation - The corporation.
 * @returns {Array<Object>} Owned worlds, least developed first.
 * @example
 * developmentOrder(game, corporation)[0];
 */
function developmentOrder(game, corporation) {
  const built = (world) => Object.values(world.buildings || {})
    .reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);

  return corporation.stellarObjects
    .map(objectId => game.findStellarObject(objectId))
    .filter(Boolean)
    .sort((a, b) => built(a) - built(b) || a.id - b.id);
}

/**
 * Start one building if this corporation can afford to.
 * @param {Object} params - `{ game, corporation, config }`.
 * @returns {Object|null} A build action, or null when nothing was started.
 * @example
 * considerBuilding({ game, corporation, config });
 */
function considerBuilding({ game, corporation, config }) {
  if (!Array.isArray(corporation.stellarObjects) || corporation.stellarObjects.length === 0) {
    return null;
  }

  // Keep a buffer rather than spending to the last credit: a corporation with
  // no cash is one bad quarter from a forced loan and a downgrade.
  const cash = game.getEconomy().getLedger()
    .balance(corporationHolder(corporation), ACCOUNTS.CASH);
  if (cash <= config.buildCashFloor) {
    return null;
  }

  for (const stellarObject of developmentOrder(game, corporation)) {
    const result = buildOnWorld({ game, corporation, stellarObject });
    if (result) {
      return { kind: 'build', ...result };
    }
  }

  return null;
}

/**
 * Bid for a failing rival while its price is depressed.
 *
 * Bids go on the same book as everyone else's orders, so a distressed company
 * is bought rather than seized, and a rival bidding for the same target can
 * outbid this one.
 * @param {Object} params - `{ game, corporation, targets, tick, config }`.
 * @returns {Object|null} An acquisition action, or null when no bid was placed.
 * @example
 * considerAcquisition({ game, corporation, targets, tick, config });
 */
function considerAcquisition({ game, corporation, targets, tick, config }) {
  const economy = game.getEconomy();
  const cash = economy.getLedger()
    .balance(corporationHolder(corporation), ACCOUNTS.CASH);
  if (cash <= config.acquisitionCashFloor) {
    return null;
  }

  const candidates = targets.filter(entry => entry.target.name !== corporation.name);
  if (candidates.length === 0) {
    return null;
  }

  // Stay with a target once started. Choosing afresh each cycle spread bids
  // across every struggling company and never accumulated a majority of any of
  // them, which is not how a takeover works: it is a campaign against one
  // company, not a standing interest in distress generally.
  const stream = economy.getRandom().stream('acquisitions');
  const existing = candidates.find(entry => entry.target.name === corporation.acquisitionTarget);
  const chosen = existing || candidates[stream.int(0, candidates.length - 1)];
  corporation.acquisitionTarget = chosen.target.name;

  // Below what the assets are worth, but above where the sellers are: a bid
  // that nobody can hit buys nothing, however shrewdly it is priced.
  const bestAsk = chosen.listing.depth().asks[0]?.price || 0;
  const discounted = Math.round(chosen.assetsPerShare * config.acquisitionDiscount);
  const bidPrice = Math.max(1, bestAsk > 0 ? Math.min(discounted, bestAsk * 2) : discounted);

  const spendable = Math.floor((cash - config.acquisitionCashFloor) / bidPrice);
  const quantity = Math.min(
    spendable,
    Math.max(1, Math.round(chosen.listing.sharesOutstanding * 0.1))
  );

  if (quantity <= 0) {
    return null;
  }

  const result = economy.getExchange().submitOrder({
    symbol: chosen.listing.symbol,
    holder: corporationHolder(corporation),
    side: SIDES.BUY,
    quantity,
    limitPrice: bidPrice,
    tick
  });

  if (!result.accepted) {
    return null;
  }

  return {
    kind: 'acquisition_bid',
    buyerName: corporation.name,
    targetName: chosen.target.name,
    quantity,
    limitPrice: bidPrice,
    distress: chosen.probability
  };
}

/**
 * Which listed companies are distressed enough to be worth bidding for.
 *
 * Computed once per cycle and shared by every agent that wants it, rather than
 * re-appraised per corporation.
 * @param {Object} params - `{ game, tick }`.
 * @returns {Array<Object>} `{ listing, target, probability, assetsPerShare }`.
 * @example
 * distressedTargets({ game, tick });
 */
function distressedTargets({ game, tick }) {
  const settings = game.getSettings();
  const config = npcCorporationConfig(settings);
  const economy = game.getEconomy();
  const exchange = economy.getExchange();
  const targets = [];

  [...exchange.listings.keys()].sort().forEach(symbol => {
    const listing = exchange.getListing(symbol);
    const target = game.findCorporation(listing.corporationName);
    if (!target || target.isBankrupt || listing.sharesOutstanding <= 0) {
      return;
    }

    const { probability } = defaultProbability(target, { settings, tick });
    if (probability < config.acquisitionDistressThreshold) {
      return;
    }

    const appraisal = appraiseCorporation(target, {
      universe: game.getUniverse(),
      settings,
      tick,
      costBasis: economy.getCostBasis()
    });

    // A company worth nothing is not a bargain, it is a liability
    if (appraisal.assets <= 0) {
      return;
    }

    targets.push({
      listing,
      target,
      probability,
      assetsPerShare: appraisal.assets / listing.sharesOutstanding
    });
  });

  return targets;
}

module.exports = {
  name: 'market',
  descriptionKey: 'npc_corporations.agents.market',

  /**
   * Decide what this corporation does this cycle.
   * @param {Object} context - `{ game, corporation, tick, targets, buildThisCycle }`.
   * @returns {Array<Object>} Actions taken.
   * @example
   * marketAgent.act({ game, corporation, tick, targets, buildThisCycle: true });
   */
  act({ game, corporation, tick, targets = [], buildThisCycle = false }) {
    const config = npcCorporationConfig(game.getSettings());
    const actions = [];

    const bid = considerAcquisition({ game, corporation, targets, tick, config });
    if (bid) {
      actions.push(bid);
    }

    // Building runs on a slower cadence than the rest: a corporation deciding
    // every day would build out every world it owns almost immediately and the
    // differences between companies would collapse.
    if (buildThisCycle) {
      const build = considerBuilding({ game, corporation, config });
      if (build) {
        actions.push(build);
      }
    }

    return actions;
  },

  // Exported for the coordinator and for tests
  PRODUCTIVE_FIELDS,
  buildingScore,
  buildOnWorld,
  developmentOrder,
  distressedTargets
};

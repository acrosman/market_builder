const { loadContent } = require('../contentCache');
const { recordGoodsTrade, recordOpeningStock } = require('./transactions');
const { EXTERNAL_HOLDER, marketHolder } = require('./accounts');

/**
 * Market restocking: trade between a local market and the wider galaxy.
 *
 * Markets were stocked once at world generation and never again, so the only
 * dynamics they had were the player draining them. Three things need this:
 *
 * Prices need something to revert toward. Without restocking, a market the
 * player has bought out stays empty and its price stays pinned at the supply
 * ceiling forever, so there is no mean reversion for a valuation to anchor on.
 *
 * Production needs its inputs to be obtainable. A Farm consumes chemicals, and
 * on a world that makes few of them local stock reaches zero and every farm
 * stops. Worse, Recycling consumes chemicals to make chemicals, so once the
 * stock is gone nothing can restart it. Restocking breaks that deadlock.
 *
 * And the simulated systems are not the whole galaxy. A market drifting back
 * toward its ideal stock is that world trading with everywhere this game does
 * not simulate.
 *
 * The external galaxy is a ledger holder rather than a void, so restocking is a
 * trade: goods and credits cross the boundary rather than being created at it,
 * and total cash stays conserved across all holders.
 */

/** Defaults for the restock settings block. */
const DEFAULT_RESTOCK = {
  daily_gap_fraction: 0.05,
  max_ideal_multiple: 3
};

/**
 * Read restock configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Restock configuration.
 * @example
 * const config = restockConfig(game.getSettings());
 */
function restockConfig(settings = {}) {
  const configured = settings.restock || {};
  const read = (key) => {
    const value = Number(configured[key]);
    return Number.isFinite(value) ? value : DEFAULT_RESTOCK[key];
  };
  return {
    dailyGapFraction: read('daily_gap_fraction'),
    maxIdealMultiple: read('max_ideal_multiple')
  };
}

/**
 * Compute a market's ideal stock for a good.
 *
 * Mirrors the ideal used by `Market.calculateMarketPrice`, so restocking pulls
 * toward the same level the pricing model treats as balanced. Keeping the two
 * in step is what makes price mean-revert rather than oscillate.
 * @param {Object} stellarObject - Object holding the market.
 * @param {Object} good - Good definition from goods.json.
 * @returns {number} Ideal stock level, zero when the good does not belong here.
 * @example
 * idealStockFor(object, goodsData.wheat);
 */
function idealStockFor(stellarObject, good) {
  if (!good) {
    return 0;
  }

  if (good.category === 'general' || good.category === 'military') {
    if (good.type === 'raw') {
      return 100;
    }
    return good.type === 'intermediate' ? 50 : 25;
  }

  const modifier = Number(stellarObject.productivityModifiers?.[good.category]) || 0;
  if (good.type === 'raw') {
    return modifier * 50;
  }
  return good.type === 'intermediate' ? modifier * 20 : modifier * 10;
}

/**
 * Move one market a fraction of the way toward its ideal stock.
 *
 * Shortfalls are bought from the wider galaxy and surpluses sold to it, both at
 * the market's own current price, so restocking never hands anyone a free
 * arbitrage against the prevailing price.
 * @param {Object} params - Restock parameters.
 * @param {Object} params.economy - EconomyState to record into.
 * @param {Object} params.market - Market instance, for pricing.
 * @param {Object} params.stellarObject - Object whose market to restock.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.days - Whole days elapsed.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} Summary as `{ bought, sold }` keyed by good name.
 * @example
 * restockMarket({ economy, market, stellarObject, settings, days: 1, tick: 24 });
 */
function restockMarket({ economy, market, stellarObject, settings, days, tick }) {
  const summary = { bought: {}, sold: {} };

  const inventory = stellarObject.marketState?.inventory;
  if (!inventory || days <= 0) {
    return summary;
  }

  const goodsData = loadContent('goods', settings.data_directory || 'data/default/en-us');
  const config = restockConfig(settings);
  const holder = marketHolder(stellarObject);

  // Compounding the daily fraction keeps a multi-day batch equivalent to
  // running the same number of single days, so a long jump does not restock
  // differently from the same time spent in short hops.
  const closedFraction = 1 - ((1 - config.dailyGapFraction) ** days);

  Object.keys(goodsData).forEach(goodName => {
    const good = goodsData[goodName];
    const ideal = idealStockFor(stellarObject, good);
    if (ideal <= 0) {
      return;
    }

    const current = Number(inventory[goodName]) || 0;
    const ceiling = ideal * config.maxIdealMultiple;

    if (current < ideal) {
      const units = Math.floor((ideal - current) * closedFraction);
      if (units <= 0) {
        return;
      }

      const unitPrice = market.calculateMarketPrice(stellarObject, goodName, 'buy')
        || Number(good.value) || 1;

      // The galaxy's stock is unmodelled, so give it a basis at the same price
      // before it sells. Otherwise every external sale would book as pure
      // profit and the external holder's books would be nonsense.
      recordOpeningStock(economy, {
        tick,
        holder: EXTERNAL_HOLDER,
        goodName,
        quantity: units,
        totalCost: Math.round(unitPrice * units)
      });

      inventory[goodName] = current + units;
      recordGoodsTrade(economy, {
        tick,
        buyer: holder,
        seller: EXTERNAL_HOLDER,
        goodName,
        quantity: units,
        totalPrice: Math.round(unitPrice * units),
        refs: { stellarObjectId: stellarObject.id, reason: 'restock' }
      });

      summary.bought[goodName] = units;
      return;
    }

    if (current > ceiling) {
      const units = Math.floor((current - ceiling) * closedFraction);
      if (units <= 0) {
        return;
      }

      const unitPrice = market.calculateMarketPrice(stellarObject, goodName, 'sell')
        || Number(good.value) || 1;

      inventory[goodName] = current - units;
      recordGoodsTrade(economy, {
        tick,
        buyer: EXTERNAL_HOLDER,
        seller: holder,
        goodName,
        quantity: units,
        totalPrice: Math.round(unitPrice * units),
        refs: { stellarObjectId: stellarObject.id, reason: 'destock' }
      });

      summary.sold[goodName] = units;
    }
  });

  return summary;
}

module.exports = {
  DEFAULT_RESTOCK,
  restockConfig,
  idealStockFor,
  restockMarket
};

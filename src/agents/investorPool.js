const {
  ACCOUNTS, HOLDER_KINDS, INVESTOR_POOL_HOLDER, corporationHolder
} = require('../economy/accounts');
const { ENTRY_KINDS } = require('../economy/ledger');
const { appraiseCorporation, defaultProbability } = require('../economy/appraisal');
const { SIDES } = require('../exchange/auction');

/** Defaults for the investors settings block. */
const DEFAULT_INVESTORS = {
  starting_capital: 50000000,
  savings_per_day: 20000,
  belief_dispersion: 0.15,
  participation_rate: 0.25,
  max_position_fraction: 1,
  order_size_fraction: 0.02,
  investor_count: 8,
  bid_withdrawal_probability: 0.5
};

/**
 * The investing public: the other side of every trade the player makes.
 *
 * Its capital is finite and tracked in the ledger like anyone else's. That is
 * the point. An investor population with unlimited money bids everything up
 * forever and price stops carrying information, so the pool can run out, and
 * when it does a market has no bid -- which is the condition that makes a
 * distressed company genuinely hard to sell out of.
 *
 * Inflows are defined and few: dividends received, and a savings rate standing
 * in for the wider economy earning money somewhere this game does not simulate.
 * Outflows are shares bought. Everything else is a transfer, which is what
 * keeps total credits checkable.
 *
 * The public is modelled as several distinct investors rather than one, and
 * that is not cosmetic. A single holder cannot trade with itself: a buy and a
 * sell by the same account net to nothing, so a one-holder pool can only ever
 * be on one side of the market and the book never crosses. Separate investors
 * hold separate positions, disagree about what a company is worth, and
 * therefore trade -- with each other, and with the player.
 *
 * What each believes is appraised value per share, scattered by a dispersion
 * factor. Because appraisal cannot see a share price, those beliefs are
 * anchored to what companies earn rather than to what the market last did,
 * which is what stops price feeding on itself.
 */

/**
 * Read investor configuration, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Configuration.
 * @example
 * const config = investorConfig(game.getSettings());
 */
function investorConfig(settings = {}) {
  const configured = settings.investors || {};
  const read = (key) => {
    const value = Number(configured[key]);
    return Number.isFinite(value) ? value : DEFAULT_INVESTORS[key];
  };
  return {
    startingCapital: read('starting_capital'),
    savingsPerDay: read('savings_per_day'),
    beliefDispersion: read('belief_dispersion'),
    participationRate: read('participation_rate'),
    maxPositionFraction: read('max_position_fraction'),
    orderSizeFraction: read('order_size_fraction'),
    investorCount: Math.max(1, Math.round(read('investor_count'))),
    bidWithdrawalProbability: read('bid_withdrawal_probability')
  };
}

/**
 * Build the holder reference for one investor.
 * @param {number} index - Zero-based investor index.
 * @returns {Object} Holder as `{ kind: 'investor_pool', id }`.
 * @example
 * investorHolder(0); // => { kind: 'investor_pool', id: 'investor-0' }
 */
function investorHolder(index) {
  return { kind: HOLDER_KINDS.INVESTOR_POOL, id: `investor-${index}` };
}

/**
 * Every investor in the population.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Array<Object>} Holder references.
 * @example
 * investorHolders(game.getSettings());
 */
function investorHolders(settings = {}) {
  const { investorCount } = investorConfig(settings);
  return Array.from({ length: investorCount }, (unused, index) => investorHolder(index));
}

/**
 * Endow the investing public with its opening capital.
 *
 * Split evenly across investors. Each holds its own cash, so one that spends
 * its capital stops bidding while the others carry on, which is how a market
 * thins out rather than stopping all at once.
 * @param {Object} game - The game.
 * @returns {number} Capital granted in total.
 * @example
 * seedInvestorPool(game);
 */
function seedInvestorPool(game) {
  const settings = game.getSettings();
  const config = investorConfig(settings);
  const holders = investorHolders(settings);
  const each = Math.floor(Math.max(0, config.startingCapital) / holders.length);

  if (each <= 0) {
    return 0;
  }

  const ledger = game.getEconomy().getLedger();
  holders.forEach(holder => {
    ledger.post({
      tick: game.getTicks(),
      amount: each,
      debit: { holder, account: ACCOUNTS.CASH },
      credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
      kind: ENTRY_KINDS.SHARE_ISSUE,
      refs: { reason: 'investor_pool_opening' }
    });
  });

  return each * holders.length;
}

/**
 * Distribute a flotation across the investing public.
 *
 * Shares and the cash to pay for them are split evenly, with the remainder
 * going to the first investor so the totals match the issue exactly. Spreading
 * the issue is what leaves the register with several holders who can then
 * disagree and trade.
 * @param {Object} params - Subscription parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.issuer - Holder issuing the shares.
 * @param {string} params.symbol - Listing symbol.
 * @param {number} params.shares - Shares issued.
 * @param {number} params.pricePerShare - Issue price.
 * @returns {number} Proceeds raised.
 * @example
 * subscribeToIssue({ game, issuer, symbol: 'Meridian', shares: 10000, pricePerShare: 83 });
 */
function subscribeToIssue({ game, issuer, symbol, shares, pricePerShare }) {
  const economy = game.getEconomy();
  const holders = investorHolders(game.getSettings());
  const tick = game.getTicks();

  const each = Math.floor(shares / holders.length);
  const remainder = shares - (each * holders.length);

  const entries = [];
  let raised = 0;

  holders.forEach((holder, index) => {
    const allocation = each + (index === 0 ? remainder : 0);
    if (allocation <= 0) {
      return;
    }

    const amount = Math.round(allocation * pricePerShare);
    raised += amount;

    if (amount > 0) {
      entries.push({
        tick,
        amount,
        debit: { holder: issuer, account: ACCOUNTS.CASH },
        credit: { holder: issuer, account: ACCOUNTS.SHARE_CAPITAL },
        kind: ENTRY_KINDS.SHARE_ISSUE,
        refs: { symbol, shares: allocation, pricePerShare }
      });
      entries.push({
        tick,
        amount,
        debit: { holder, account: ACCOUNTS.INVESTMENTS },
        credit: { holder, account: ACCOUNTS.CASH },
        kind: ENTRY_KINDS.SHARE_ISSUE,
        refs: { symbol, shares: allocation, pricePerShare }
      });
    }

    economy.getExchange().portfolio.adjust(holder, symbol, allocation);
  });

  if (entries.length > 0) {
    economy.getLedger().postMany(entries);
  }

  return raised;
}

/**
 * Add the day's savings to the investing public.
 *
 * The one deliberate inflow of new credits into the simulation. Everything else
 * moves between holders, so the conservation check is "total cash is constant
 * apart from this", and it is recorded with a reason that makes it findable.
 * @param {Object} params - Savings parameters.
 * @param {Object} params.economy - EconomyState holding the ledger.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.days - Whole days elapsed.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {number} Credits added in total.
 * @example
 * accrueSavings({ economy, settings, days: 1, tick: 24 });
 */
function accrueSavings({ economy, settings, days, tick }) {
  const config = investorConfig(settings);
  const holders = investorHolders(settings);
  const each = Math.round((config.savingsPerDay * Math.max(0, days)) / holders.length);

  if (each <= 0) {
    return 0;
  }

  economy.getLedger().postMany(holders.map(holder => ({
    tick,
    amount: each,
    debit: { holder, account: ACCOUNTS.CASH },
    credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
    kind: ENTRY_KINDS.SHARE_ISSUE,
    refs: { reason: 'investor_savings' }
  })));

  return each * holders.length;
}

/**
 * What the pool thinks a share is worth.
 *
 * Appraised value per share, less the corporation's own default risk, which
 * appraisal has already folded into its discount rate. A company with no shares
 * outstanding has no per-share value to speak of.
 * @param {Object} params - Belief parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.corporation - The corporation to value.
 * @param {Object} params.listing - Its listing.
 * @returns {number} Believed value per share, or 0 when unvaluable.
 * @example
 * const fair = fairValuePerShare({ game, corporation, listing });
 */
function fairValuePerShare({ game, corporation, listing }) {
  const outstanding = Number(listing?.sharesOutstanding) || 0;
  if (outstanding <= 0 || corporation?.isBankrupt) {
    return 0;
  }

  const appraisal = appraiseCorporation(corporation, {
    universe: game.getUniverse(),
    settings: game.getSettings(),
    tick: game.getTicks(),
    costBasis: game.getEconomy().getCostBasis()
  });

  return Math.max(0, appraisal.value) / outstanding;
}

/**
 * Generate one investor's orders for one listing.
 *
 * Each investor buys below what it believes and sells above it, and because
 * their beliefs differ they cross with each other. Orders are sized against
 * that investor's own cash and holdings, so nobody bids with money they do not
 * have, and nobody sells shares they do not hold.
 * @param {Object} params - Order parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.listing - The listing to trade.
 * @param {Object} params.holder - The investor.
 * @param {Object} params.stream - Seeded random stream.
 * @returns {Array<Object>} Orders to submit.
 * @example
 * ordersForListing({ game, listing, holder, stream });
 */
function ordersForListing({ game, listing, holder, stream, context = {} }) {
  const settings = game.getSettings();
  const config = investorConfig(settings);
  const economy = game.getEconomy();
  const exchange = economy.getExchange();

  const corporation = game.findCorporation(listing.corporationName);
  if (!corporation) {
    return [];
  }

  if (stream.next() > config.participationRate) {
    return [];
  }

  const appraised = fairValuePerShare({ game, corporation, listing });

  // A company whose debts have swallowed its assets appraises at nothing, but
  // that is exactly when its holders most want out. Returning no orders at all
  // would freeze the book solid and hide the collapse; instead the last traded
  // price stands in as a reference so sellers can still offer, while the bid
  // side withdraws below. Everyone wanting out and nobody buying is the shape
  // of a failing company, and it has to be visible.
  const distressed = appraised <= 0;
  const fair = distressed ? Math.max(1, Number(listing.lastPrice) || 1) : appraised;

  const cash = economy.getLedger().balance(holder, ACCOUNTS.CASH);
  const held = exchange.portfolio.sharesHeld(holder, listing.symbol);
  const outstanding = Number(listing.sharesOutstanding) || 0;

  // How likely this company is to fail before its debts come due. Appraisal
  // already discounts its cash flows for this, but a price is not the whole
  // story: past a certain point nobody wants the stock at any price they would
  // name, and that is a different thing from wanting it cheaper.
  const { probability: distress } = defaultProbability(corporation, {
    settings,
    tick: game.getTicks(),
    goodsPrices: context.goodsPrices
  });

  const believed = Math.max(
    1, Math.round(fair * (1 + stream.normal(0, config.beliefDispersion)))
  );
  const size = Math.max(
    1, Math.round(outstanding * config.orderSizeFraction * stream.float(0.5, 1.5))
  );

  const orders = [];
  const ceiling = Math.max(
    0, Math.floor(outstanding * config.maxPositionFraction) - held
  );

  // Buy below the belief and sell above it. An investor may do both: it is
  // quoting a spread around its own view rather than taking a position.
  // Withdraw from the bid as failure approaches. This is what empties the bid
  // side ahead of a maturity date: a holder who wants out then finds nobody
  // willing to take the other side, which is the moment a balloon actually
  // bites. Without it a distressed company would always be sellable at some
  // price and the cliff would be a discount rather than a trap.
  // A company appraised at nothing gets no bid at all: there is no price at
  // which its assets are worth more than its debts.
  const withdrawn = distressed
    || (distress > 0 && stream.next() < distress * config.bidWithdrawalProbability);

  const bidPrice = Math.max(1, Math.round(believed * stream.float(0.95, 1.0)));
  const bidSize = withdrawn
    ? 0
    : Math.min(size, Math.floor(cash / bidPrice), ceiling);
  if (bidSize > 0) {
    orders.push({
      symbol: listing.symbol, side: SIDES.BUY, quantity: bidSize, limitPrice: bidPrice
    });
  }

  // A holder trying to get out of a failing company does not hold out for a
  // premium; they take what the book will give them.
  const askPrice = distressed
    ? Math.max(1, Math.round(believed * stream.float(0.4, 0.9)))
    : Math.max(1, Math.round(believed * stream.float(1.0, 1.05)));
  const askSize = Math.min(size, held);
  if (askSize > 0) {
    orders.push({
      symbol: listing.symbol, side: SIDES.SELL, quantity: askSize, limitPrice: askPrice
    });
  }

  return orders;
}

/**
 * Cancel the pool's resting orders.
 *
 * Its beliefs are recomputed each cycle, so yesterday's orders reflect
 * yesterday's view. Leaving them to rest would let a stale price the pool no
 * longer believes keep trading against it.
 * @param {Object} exchange - The exchange.
 * @returns {number} Orders cancelled.
 * @example
 * clearPoolOrders(exchange);
 */
function clearPoolOrders(exchange, holders) {
  let cancelled = 0;

  holders.forEach(holder => {
    exchange.openOrdersFor(holder).forEach(order => {
      if (exchange.cancelOrder(order.symbol, order.id, holder)) {
        cancelled += 1;
      }
    });
  });

  return cancelled;
}

/**
 * Run the pool for one cycle: take savings, re-form beliefs, and post orders.
 * @param {Object} params - Cycle parameters.
 * @param {Object} params.game - The game.
 * @param {number} params.days - Whole days elapsed.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} `{ savings, cancelled, placed }`.
 * @example
 * runInvestorPool({ game, days: 1, tick: 24 });
 */
function runInvestorPool({ game, days, tick }) {
  const economy = game.getEconomy();
  const exchange = economy.getExchange();
  const stream = economy.getRandom().stream('investor-pool');
  const holders = investorHolders(game.getSettings());

  const savings = accrueSavings({
    economy, settings: game.getSettings(), days, tick
  });
  const cancelled = clearPoolOrders(exchange, holders);

  let placed = 0;

  // Sorted so capital is committed in a fixed order rather than whichever
  // listing happens to come first out of the map
  [...exchange.listings.keys()].sort().forEach(symbol => {
    const listing = exchange.getListing(symbol);

    holders.forEach(holder => {
      ordersForListing({ game, listing, holder, stream }).forEach(order => {
        const result = exchange.submitOrder({
          symbol: order.symbol,
          holder,
          side: order.side,
          quantity: order.quantity,
          limitPrice: order.limitPrice,
          tick
        });
        if (result.accepted) {
          placed += 1;
        }
      });
    });
  });

  return { savings, cancelled, placed };
}

/**
 * Total credits the pool has to invest.
 * @param {Object} economy - EconomyState holding the ledger.
 * @returns {number} Available cash.
 * @example
 * investorCapital(game.getEconomy());
 */
function investorCapital(economy, settings = {}) {
  const ledger = economy.getLedger();
  return investorHolders(settings).reduce(
    (total, holder) => total + ledger.balance(holder, ACCOUNTS.CASH),
    // The legacy single-holder account, so capital is not under-reported for a
    // game saved before the population was split
    ledger.balance(INVESTOR_POOL_HOLDER, ACCOUNTS.CASH)
  );
}

module.exports = {
  DEFAULT_INVESTORS,
  investorHolder,
  investorHolders,
  subscribeToIssue,
  investorConfig,
  seedInvestorPool,
  accrueSavings,
  fairValuePerShare,
  ordersForListing,
  clearPoolOrders,
  runInvestorPool,
  investorCapital,
  corporationHolder
};

const { Listing, ORDER_STATUS } = require('./listing');
const { Portfolio } = require('./portfolio');
const { SIDES, remainingQuantity } = require('./auction');
const { ENTRY_KINDS } = require('../economy/ledger');
const { ACCOUNTS, holderKey, corporationHolder } = require('../economy/accounts');

/** Schema version for the serialized exchange. */
const EXCHANGE_SCHEMA_VERSION = 1;

/** Reasons an order may be refused. */
const REJECTIONS = {
  UNKNOWN_LISTING: 'unknown_listing',
  INVALID_ORDER: 'invalid_order',
  INSUFFICIENT_SHARES: 'insufficient_shares',
  BANKRUPT: 'bankrupt'
};

/**
 * The share exchange: listings, orders, holdings, and settlement.
 *
 * Orders go on a book and clear on the market cycle rather than filling on
 * arrival, so a player can place one, fly somewhere and find it filled on
 * return. Fills settle both sides at once: credits move through the ledger and
 * shares move through the portfolio, from the same fill, so the two cannot
 * disagree about what happened.
 *
 * Short selling is not permitted in this version. A seller must already hold
 * the shares. Shorting needs borrow, margin and a forced-cover rule to be
 * anything other than a way to print money, and none of those exist yet.
 */
class Exchange {
  /**
   * Create an empty exchange.
   * @example
   * const exchange = new Exchange();
   */
  constructor() {
    /** @type {Map<string, Listing>} Company name to listing. */
    this.listings = new Map();
    this.portfolio = new Portfolio();
    /** Tick the last auction ran on, so cycles are not skipped or repeated. */
    this.lastClearedTick = 0;
  }

  /**
   * Get a listing by company name.
   * @param {string} corporationName - The listed company.
   * @returns {Listing|null} The listing, or null when not listed.
   * @example
   * const listing = exchange.getListing('Acme Orbital');
   */
  getListing(corporationName) {
    return this.listings.get(corporationName) || null;
  }

  /**
   * List a company, or return its existing listing.
   * @param {Object} params - Listing parameters.
   * @param {string} params.corporationName - The company to list.
   * @param {number} [params.referencePrice=0] - Opening anchor price.
   * @param {number} [params.sharesOutstanding=0] - Shares already in existence.
   * @returns {Listing} The listing.
   * @example
   * exchange.listCompany({ corporationName: 'Acme', referencePrice: 50 });
   */
  listCompany({ corporationName, referencePrice = 0, sharesOutstanding = 0 }) {
    const existing = this.getListing(corporationName);
    if (existing) {
      return existing;
    }

    const listing = new Listing({ corporationName, referencePrice, sharesOutstanding });
    this.listings.set(corporationName, listing);
    return listing;
  }

  /**
   * Submit an order to a listing.
   *
   * Validation happens here rather than at clearing time so a player learns
   * immediately that they cannot sell shares they do not hold, instead of
   * discovering it a day later when the auction silently drops their order.
   * @param {Object} params - Order parameters.
   * @param {string} params.corporationName - The listed company.
   * @param {Object} params.holder - Holder placing the order.
   * @param {string} params.side - One of SIDES.
   * @param {number} params.quantity - Positive integer shares.
   * @param {number|null} [params.limitPrice=null] - Limit, or null for a market order.
   * @param {number} [params.tick=0] - Current tick.
   * @returns {Object} `{ accepted, order, reason }`.
   * @example
   * exchange.submitOrder({ corporationName: 'Acme', holder, side: 'buy', quantity: 100 });
   */
  submitOrder({ corporationName, holder, side, quantity, limitPrice = null, tick = 0 }) {
    const listing = this.getListing(corporationName);
    if (!listing) {
      return { accepted: false, order: null, reason: REJECTIONS.UNKNOWN_LISTING };
    }

    const shares = Math.round(Number(quantity) || 0);
    if (shares <= 0 || !holder?.id || (side !== SIDES.BUY && side !== SIDES.SELL)) {
      return { accepted: false, order: null, reason: REJECTIONS.INVALID_ORDER };
    }

    if (side === SIDES.SELL) {
      // Counting shares already committed to other open sells stops a holder
      // selling the same shares twice across separate orders.
      const committed = listing.openOrders()
        .filter(order => order.side === SIDES.SELL && order.holder?.id === holder.id)
        .reduce((sum, order) => sum + remainingQuantity(order), 0);

      if (this.portfolio.sharesHeld(holder, corporationName) - committed < shares) {
        return { accepted: false, order: null, reason: REJECTIONS.INSUFFICIENT_SHARES };
      }
    }

    const order = listing.placeOrder({ holder, side, quantity: shares, limitPrice, tick });
    if (!order) {
      return { accepted: false, order: null, reason: REJECTIONS.INVALID_ORDER };
    }

    return { accepted: true, order, reason: null };
  }

  /**
   * Cancel an open order.
   * @param {string} corporationName - The listed company.
   * @param {number} orderId - Order identifier.
   * @param {Object} [holder] - When given, only that holder's order is cancelled.
   * @returns {boolean} True when an order was cancelled.
   * @example
   * exchange.cancelOrder('Acme Orbital', 4, holder);
   */
  cancelOrder(corporationName, orderId, holder = null) {
    return this.getListing(corporationName)?.cancelOrder(orderId, holder) || false;
  }

  /**
   * Get every open order belonging to a holder.
   * @param {Object} holder - Holder reference.
   * @returns {Array<Object>} Open orders with their listing name attached.
   * @example
   * exchange.openOrdersFor(playerHolder(player));
   */
  openOrdersFor(holder) {
    const key = holder?.id;
    const orders = [];

    this.listings.forEach((listing, corporationName) => {
      listing.openOrders()
        .filter(order => order.holder?.id === key)
        .forEach(order => orders.push({ ...order, corporationName }));
    });

    return orders;
  }

  /**
   * Run the auction for every listing and settle the fills.
   * @param {Object} params - Clearing parameters.
   * @param {Object} params.economy - EconomyState holding the ledger.
   * @param {number} params.tick - Current tick.
   * @returns {Array<Object>} Per-listing results that traded.
   * @example
   * exchange.clearAll({ economy, tick: 24 });
   */
  clearAll({ economy, tick }) {
    const cleared = [];

    // Sorted so a multi-listing clear settles in a fixed order regardless of
    // how the listings happened to be inserted.
    [...this.listings.keys()].sort().forEach(corporationName => {
      const listing = this.listings.get(corporationName);
      const result = listing.clear(tick);

      if (result.volume > 0) {
        this.settle({ economy, listing, result, tick });
        cleared.push({ corporationName, ...result });
      }
    });

    this.lastClearedTick = tick;
    return cleared;
  }

  /**
   * Move credits and shares for one listing's fills.
   *
   * Buyers pay and receive shares; sellers deliver and are paid. Cash moves
   * between the two directly, so an auction neither creates nor destroys
   * credits, and share movements net to zero so none are conjured either.
   * @param {Object} params - Settlement parameters.
   * @param {Object} params.economy - EconomyState holding the ledger.
   * @param {Listing} params.listing - The listing being settled.
   * @param {Object} params.result - Auction result with fills.
   * @param {number} params.tick - Current tick.
   * @returns {void}
   * @example
   * exchange.settle({ economy, listing, result, tick });
   */
  settle({ economy, listing, result, tick }) {
    const price = result.clearingPrice;
    const buys = result.fills.filter(fill => fill.side === SIDES.BUY);
    const sells = result.fills.filter(fill => fill.side === SIDES.SELL);

    // Pair buyers against sellers in a fixed order and split where the
    // quantities do not line up, so every share has a named counterparty.
    const entries = [];
    let sellIndex = 0;
    let sellRemaining = sells.length > 0 ? sells[0].quantity : 0;

    buys.forEach(buyFill => {
      let buyRemaining = buyFill.quantity;

      while (buyRemaining > 0 && sellIndex < sells.length) {
        const sellFill = sells[sellIndex];
        const matched = Math.min(buyRemaining, sellRemaining);

        if (matched > 0) {
          const amount = Math.round(matched * price);

          if (amount > 0) {
            entries.push({
              tick,
              amount,
              debit: { holder: sellFill.holder, account: ACCOUNTS.CASH },
              credit: { holder: buyFill.holder, account: ACCOUNTS.CASH },
              kind: ENTRY_KINDS.SHARE_TRADE,
              refs: { corporationName: listing.corporationName, shares: matched, price }
            });
            entries.push({
              tick,
              amount,
              debit: { holder: buyFill.holder, account: ACCOUNTS.INVESTMENTS },
              credit: { holder: sellFill.holder, account: ACCOUNTS.INVESTMENTS },
              kind: ENTRY_KINDS.SHARE_TRADE,
              refs: { corporationName: listing.corporationName, shares: matched, price }
            });
          }

          this.portfolio.adjust(buyFill.holder, listing.corporationName, matched);
          this.portfolio.adjust(sellFill.holder, listing.corporationName, -matched);

          buyRemaining -= matched;
          sellRemaining -= matched;
        }

        if (sellRemaining <= 0) {
          sellIndex += 1;
          sellRemaining = sellIndex < sells.length ? sells[sellIndex].quantity : 0;
        }
      }
    });

    if (entries.length > 0) {
      economy.getLedger().postMany(entries);
    }
  }

  /**
   * Serialize the exchange for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = exchange.toJSON();
   */
  toJSON() {
    return {
      schemaVersion: EXCHANGE_SCHEMA_VERSION,
      lastClearedTick: this.lastClearedTick,
      portfolio: this.portfolio.toJSON(),
      // Sorted so saves diff cleanly
      listings: [...this.listings.keys()].sort().map(
        corporationName => this.listings.get(corporationName).toJSON()
      )
    };
  }

  /**
   * Rebuild an exchange from saved data.
   * @param {Object} [data] - Serialized exchange.
   * @returns {Exchange} Restored exchange.
   * @example
   * const exchange = Exchange.fromJSON(saveData.economy.exchange);
   */
  static fromJSON(data) {
    const exchange = new Exchange();

    if (Array.isArray(data?.listings)) {
      data.listings.forEach(listingData => {
        const listing = Listing.fromJSON(listingData);
        if (listing.corporationName) {
          exchange.listings.set(listing.corporationName, listing);
        }
      });
    }

    exchange.portfolio = Portfolio.fromJSON(data?.portfolio);
    exchange.lastClearedTick = Number(data?.lastClearedTick) || 0;

    return exchange;
  }
}

module.exports = {
  Exchange,
  EXCHANGE_SCHEMA_VERSION,
  REJECTIONS,
  ORDER_STATUS,
  SIDES,
  holderKey,
  corporationHolder
};

const { clearAuction, remainingQuantity, SIDES } = require('./auction');

/** Schema version for a serialized listing. */
const LISTING_SCHEMA_VERSION = 1;

/** How many closing prices to retain per listing. */
const DEFAULT_HISTORY_LENGTH = 512;

/** Order lifecycle states. */
const ORDER_STATUS = {
  OPEN: 'open',
  FILLED: 'filled',
  CANCELLED: 'cancelled'
};

/**
 * One listed company: its shares, its order book, and its price history.
 *
 * A listing holds resting orders between clears rather than matching on
 * arrival. That is what lets a player place an order, fly somewhere, and come
 * back to find it filled -- and it is why the book has real depth for a large
 * order to consume.
 *
 * Price history is a fixed-length ring rather than an unbounded log. Every
 * listing closes once a day for as long as a game runs, so keeping all of it
 * would grow the save without bound for data nobody reads past the chart.
 */
class Listing {
  /**
   * Create a listing.
   * @param {Object} params - Listing parameters.
   * @param {string} params.corporationName - The listed company.
   * @param {number} [params.sharesOutstanding=0] - Total shares in existence.
   * @param {number} [params.referencePrice=0] - Opening anchor price.
   * @param {number} [params.historyLength] - Closing prices to retain.
   * @example
   * const listing = new Listing({ corporationName: 'Acme', referencePrice: 50 });
   */
  constructor({
    corporationName,
    sharesOutstanding = 0,
    referencePrice = 0,
    historyLength = DEFAULT_HISTORY_LENGTH
  } = {}) {
    this.corporationName = corporationName;
    this.sharesOutstanding = Math.max(0, Math.round(Number(sharesOutstanding) || 0));
    /** Last price anything actually traded at, or the opening anchor. */
    this.lastPrice = Math.max(0, Math.round(Number(referencePrice) || 0));
    /** @type {Array<Object>} Resting orders, open and closed. */
    this.orders = [];
    /** @type {Array<Object>} Ring of `{ tick, price, volume }`, oldest first. */
    this.history = [];
    this.historyLength = Math.max(1, Math.round(Number(historyLength) || DEFAULT_HISTORY_LENGTH));
    this.nextOrderId = 1;
  }

  /**
   * Get the orders still eligible to trade.
   * @returns {Array<Object>} Open orders with quantity remaining.
   * @example
   * listing.openOrders();
   */
  openOrders() {
    return this.orders.filter(
      order => order.status === ORDER_STATUS.OPEN && remainingQuantity(order) > 0
    );
  }

  /**
   * Place an order on the book.
   * @param {Object} params - Order parameters.
   * @param {Object} params.holder - Holder reference placing the order.
   * @param {string} params.side - One of SIDES.
   * @param {number} params.quantity - Positive integer shares.
   * @param {number|null} [params.limitPrice=null] - Limit, or null for a market order.
   * @param {number} [params.tick=0] - Tick the order was placed on.
   * @returns {Object|null} The recorded order, or null when invalid.
   * @example
   * listing.placeOrder({ holder, side: 'buy', quantity: 100, limitPrice: 52 });
   */
  placeOrder({ holder, side, quantity, limitPrice = null, tick = 0 }) {
    const shares = Math.round(Number(quantity) || 0);
    if (shares <= 0 || (side !== SIDES.BUY && side !== SIDES.SELL) || !holder?.id) {
      return null;
    }

    const limit = limitPrice === null || limitPrice === undefined
      ? null
      : Math.max(1, Math.round(Number(limitPrice) || 0));

    const order = {
      id: this.nextOrderId,
      holder,
      side,
      quantity: shares,
      filled: 0,
      limitPrice: limit,
      status: ORDER_STATUS.OPEN,
      placedTick: Math.max(0, Math.round(Number(tick) || 0))
    };

    this.nextOrderId += 1;
    this.orders.push(order);
    return order;
  }

  /**
   * Cancel an open order.
   * @param {number} orderId - Order identifier.
   * @param {Object} [holder] - When given, only that holder's order is cancelled.
   * @returns {boolean} True when an order was cancelled.
   * @example
   * listing.cancelOrder(4, holder);
   */
  cancelOrder(orderId, holder = null) {
    const order = this.orders.find(
      candidate => candidate.id === orderId && candidate.status === ORDER_STATUS.OPEN
    );
    if (!order) {
      return false;
    }
    if (holder && order.holder?.id !== holder.id) {
      return false;
    }

    order.status = ORDER_STATUS.CANCELLED;
    return true;
  }

  /**
   * Run one auction and apply the fills to the book.
   *
   * Orders that do not fill stay open for the next clear. That is deliberate:
   * a resting limit order is a standing instruction, and cancelling it
   * automatically would make limit orders useless for anyone who is not sitting
   * and watching.
   * @param {number} tick - Tick the auction ran on.
   * @returns {Object} The auction result, with fills applied.
   * @example
   * const result = listing.clear(tick);
   */
  clear(tick) {
    const result = clearAuction({
      orders: this.openOrders(),
      referencePrice: this.lastPrice
    });

    if (result.volume <= 0) {
      return result;
    }

    const byId = new Map(this.orders.map(order => [order.id, order]));
    result.fills.forEach(fill => {
      const order = byId.get(fill.orderId);
      if (!order) {
        return;
      }
      order.filled += fill.quantity;
      if (remainingQuantity(order) <= 0) {
        order.status = ORDER_STATUS.FILLED;
      }
    });

    this.lastPrice = result.clearingPrice;
    this.recordClose(tick, result.clearingPrice, result.volume);

    return result;
  }

  /**
   * Append a closing price, trimming the ring.
   * @param {number} tick - Tick of the close.
   * @param {number} price - Closing price.
   * @param {number} volume - Shares traded.
   * @returns {void}
   * @example
   * listing.recordClose(24, 52, 300);
   */
  recordClose(tick, price, volume) {
    this.history.push({
      tick: Math.max(0, Math.round(Number(tick) || 0)),
      price: Math.round(Number(price) || 0),
      volume: Math.max(0, Math.round(Number(volume) || 0))
    });

    if (this.history.length > this.historyLength) {
      this.history.splice(0, this.history.length - this.historyLength);
    }
  }

  /**
   * Remove closed orders older than a cutoff, keeping the book small.
   * @param {number} beforeTick - Orders placed before this tick may be dropped.
   * @returns {number} How many orders were removed.
   * @example
   * listing.pruneClosedOrders(2160);
   */
  pruneClosedOrders(beforeTick) {
    const before = this.orders.length;
    this.orders = this.orders.filter(
      order => order.status === ORDER_STATUS.OPEN || order.placedTick >= beforeTick
    );
    return before - this.orders.length;
  }

  /**
   * Summarize the book for display.
   * @returns {Object} `{ bids, asks }` as price levels with total quantity.
   * @example
   * const depth = listing.depth();
   */
  depth() {
    const levels = { bids: new Map(), asks: new Map() };

    this.openOrders().forEach(order => {
      const bucket = order.side === SIDES.BUY ? levels.bids : levels.asks;
      // Market orders have no level to sit at, so they are reported separately
      const key = order.limitPrice === null ? 'market' : order.limitPrice;
      bucket.set(key, (bucket.get(key) || 0) + remainingQuantity(order));
    });

    const toSorted = (bucket, descending) => [...bucket.entries()]
      .filter(([price]) => price !== 'market')
      .sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]))
      .map(([price, quantity]) => ({ price, quantity }));

    return {
      bids: toSorted(levels.bids, true),
      asks: toSorted(levels.asks, false),
      marketBids: levels.bids.get('market') || 0,
      marketAsks: levels.asks.get('market') || 0
    };
  }

  /**
   * Serialize the listing for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = listing.toJSON();
   */
  toJSON() {
    return {
      schemaVersion: LISTING_SCHEMA_VERSION,
      corporationName: this.corporationName,
      sharesOutstanding: this.sharesOutstanding,
      lastPrice: this.lastPrice,
      historyLength: this.historyLength,
      nextOrderId: this.nextOrderId,
      orders: this.orders,
      history: this.history
    };
  }

  /**
   * Rebuild a listing from saved data.
   * @param {Object} [data] - Serialized listing.
   * @returns {Listing} Restored listing.
   * @example
   * const listing = Listing.fromJSON(saved);
   */
  static fromJSON(data) {
    const listing = new Listing({
      corporationName: data?.corporationName,
      sharesOutstanding: data?.sharesOutstanding,
      referencePrice: data?.lastPrice,
      historyLength: data?.historyLength
    });

    listing.orders = Array.isArray(data?.orders) ? data.orders : [];
    listing.history = Array.isArray(data?.history) ? data.history : [];

    const savedNextId = Number(data?.nextOrderId);
    const maxId = listing.orders.reduce(
      (highest, order) => Math.max(highest, Number(order.id) || 0),
      0
    );
    listing.nextOrderId = Number.isFinite(savedNextId) && savedNextId > maxId
      ? savedNextId
      : maxId + 1;

    return listing;
  }
}

module.exports = {
  Listing,
  ORDER_STATUS,
  LISTING_SCHEMA_VERSION,
  DEFAULT_HISTORY_LENGTH
};

const { Listing, ORDER_STATUS } = require('./listing');
const { SIDES } = require('./auction');
const { playerHolder } = require('../economy/accounts');

const ALICE = playerHolder('Alice');
const BOB = playerHolder('Bob');

/**
 * Build a listing with an opening price.
 * @param {number} [referencePrice=50] - Opening anchor.
 * @returns {Listing} A listing.
 */
function makeListing(referencePrice = 50) {
  return new Listing({ corporationName: 'Meridian', sharesOutstanding: 10000, referencePrice });
}

describe('Listing', () => {
  describe('placeOrder', () => {
    test('should record an order and assign increasing ids', () => {
      const listing = makeListing();
      expect(listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 100 }).id).toBe(1);
      expect(listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 100 }).id).toBe(2);
    });

    test('should default to a market order when no limit is given', () => {
      const listing = makeListing();
      expect(listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10 }).limitPrice)
        .toBeNull();
    });

    test('should round and floor a limit at one credit', () => {
      const listing = makeListing();
      expect(listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 0
      }).limitPrice).toBe(1);
      expect(listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 52.4
      }).limitPrice).toBe(52);
    });

    test('should refuse malformed orders', () => {
      const listing = makeListing();
      expect(listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 0 })).toBeNull();
      expect(listing.placeOrder({ holder: ALICE, side: 'sideways', quantity: 10 })).toBeNull();
      expect(listing.placeOrder({ holder: null, side: SIDES.BUY, quantity: 10 })).toBeNull();
    });
  });

  describe('cancelOrder', () => {
    test('should cancel an open order', () => {
      const listing = makeListing();
      const order = listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10 });

      expect(listing.cancelOrder(order.id)).toBe(true);
      expect(order.status).toBe(ORDER_STATUS.CANCELLED);
      expect(listing.openOrders()).toEqual([]);
    });

    test('should refuse to cancel an order belonging to someone else', () => {
      const listing = makeListing();
      const order = listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10 });

      expect(listing.cancelOrder(order.id, BOB)).toBe(false);
      expect(order.status).toBe(ORDER_STATUS.OPEN);
    });

    test('should refuse to cancel twice or cancel nothing', () => {
      const listing = makeListing();
      const order = listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10 });

      listing.cancelOrder(order.id);
      expect(listing.cancelOrder(order.id)).toBe(false);
      expect(listing.cancelOrder(999)).toBe(false);
    });
  });

  describe('clear', () => {
    test('should not move the price when nothing crosses', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 45 });
      listing.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 10, limitPrice: 55 });

      const result = listing.clear(24);

      expect(result.volume).toBe(0);
      expect(listing.lastPrice).toBe(50);
      expect(listing.history).toEqual([]);
    });

    test('should fill crossing orders and move the price', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 55 });
      listing.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 10, limitPrice: 52 });

      const result = listing.clear(24);

      expect(result.volume).toBe(10);
      expect(listing.lastPrice).toBe(result.clearingPrice);
      expect(listing.history).toHaveLength(1);
      expect(listing.history[0]).toEqual({
        tick: 24, price: result.clearingPrice, volume: 10
      });
    });

    test('should close a fully filled order and keep a partial one open', () => {
      const listing = makeListing(50);
      const big = listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 100, limitPrice: 55
      });
      const small = listing.placeOrder({
        holder: BOB, side: SIDES.SELL, quantity: 30, limitPrice: 50
      });

      listing.clear(24);

      expect(small.status).toBe(ORDER_STATUS.FILLED);
      // A resting limit order is a standing instruction; it waits for the next
      // clear rather than being dropped
      expect(big.status).toBe(ORDER_STATUS.OPEN);
      expect(big.filled).toBe(30);
    });

    test('should fill a resting order at a later clear', () => {
      const listing = makeListing(50);
      const resting = listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 50, limitPrice: 55
      });

      expect(listing.clear(24).volume).toBe(0);

      listing.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 50, limitPrice: 50 });
      expect(listing.clear(48).volume).toBe(50);
      expect(resting.status).toBe(ORDER_STATUS.FILLED);
    });
  });

  describe('history', () => {
    test('should keep only the most recent closes', () => {
      const listing = new Listing({
        corporationName: 'Meridian', referencePrice: 50, historyLength: 3
      });

      for (let day = 1; day <= 6; day += 1) {
        listing.recordClose(day * 24, 50 + day, 10);
      }

      // A fixed ring rather than an unbounded log: every listing closes daily
      // for as long as the game runs
      expect(listing.history).toHaveLength(3);
      expect(listing.history.map(entry => entry.price)).toEqual([54, 55, 56]);
    });
  });

  describe('depth', () => {
    test('should aggregate open orders into price levels', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 49 });
      listing.placeOrder({ holder: BOB, side: SIDES.BUY, quantity: 15, limitPrice: 49 });
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 5, limitPrice: 48 });
      listing.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 20, limitPrice: 51 });

      const depth = listing.depth();

      // Bids descend from the best, asks ascend
      expect(depth.bids).toEqual([{ price: 49, quantity: 25 }, { price: 48, quantity: 5 }]);
      expect(depth.asks).toEqual([{ price: 51, quantity: 20 }]);
    });

    test('should report market orders separately from price levels', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10 });

      const depth = listing.depth();
      expect(depth.bids).toEqual([]);
      expect(depth.marketBids).toBe(10);
    });

    test('should exclude cancelled and filled orders', () => {
      const listing = makeListing(50);
      const order = listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 49
      });
      listing.cancelOrder(order.id);

      expect(listing.depth().bids).toEqual([]);
    });
  });

  describe('pruneClosedOrders', () => {
    test('should drop old closed orders but keep open ones', () => {
      const listing = makeListing(50);
      const old = listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 49, tick: 0
      });
      listing.cancelOrder(old.id);
      listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 49, tick: 0
      });

      expect(listing.pruneClosedOrders(100)).toBe(1);
      expect(listing.orders).toHaveLength(1);
      expect(listing.orders[0].status).toBe(ORDER_STATUS.OPEN);
    });

    test('should keep recent closed orders', () => {
      const listing = makeListing(50);
      const recent = listing.placeOrder({
        holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 49, tick: 500
      });
      listing.cancelOrder(recent.id);

      expect(listing.pruneClosedOrders(100)).toBe(0);
    });
  });

  describe('serialization', () => {
    test('should round trip the book and history', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 55 });
      listing.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 10, limitPrice: 52 });
      listing.clear(24);

      const restored = Listing.fromJSON(JSON.parse(JSON.stringify(listing.toJSON())));

      expect(restored.corporationName).toBe('Meridian');
      expect(restored.lastPrice).toBe(listing.lastPrice);
      expect(restored.sharesOutstanding).toBe(10000);
      expect(restored.history).toEqual(listing.history);
      expect(restored.orders).toHaveLength(2);
    });

    test('should keep a resting order tradeable after a load', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 50, limitPrice: 55 });

      const restored = Listing.fromJSON(JSON.parse(JSON.stringify(listing.toJSON())));
      restored.placeOrder({ holder: BOB, side: SIDES.SELL, quantity: 50, limitPrice: 50 });

      // Orders survive a save, which is the whole point of resting them
      expect(restored.clear(48).volume).toBe(50);
    });

    test('should continue assigning ids after a restore', () => {
      const listing = makeListing(50);
      listing.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 55 });

      const restored = Listing.fromJSON(listing.toJSON());
      expect(restored.placeOrder({ holder: BOB, side: SIDES.BUY, quantity: 10 }).id).toBe(2);
    });

    test('should return a usable listing from missing data', () => {
      const restored = Listing.fromJSON(undefined);
      expect(restored.orders).toEqual([]);
      expect(restored.placeOrder({ holder: ALICE, side: SIDES.BUY, quantity: 1 }).id).toBe(1);
    });
  });
});

const {
  SIDES,
  effectiveLimit,
  remainingQuantity,
  quantityAt,
  candidatePrices,
  clearAuction
} = require('./auction');

let nextId = 0;

/**
 * Build an order.
 * @param {string} side - 'buy' or 'sell'.
 * @param {number} quantity - Shares.
 * @param {number|null} limitPrice - Limit, or null for a market order.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} An order.
 */
function order(side, quantity, limitPrice, overrides = {}) {
  nextId += 1;
  return {
    id: nextId,
    holder: { kind: 'player', id: `trader-${nextId}` },
    side,
    quantity,
    filled: 0,
    limitPrice,
    ...overrides
  };
}

/** @returns {Object} A buy order. */
const buy = (quantity, limitPrice, overrides) => order(SIDES.BUY, quantity, limitPrice, overrides);
/** @returns {Object} A sell order. */
const sell = (quantity, limitPrice, overrides) => order(SIDES.SELL, quantity, limitPrice, overrides);

/**
 * Sum the fills on one side.
 * @param {Object} result - Result from clearAuction.
 * @param {string} side - Side to total.
 * @returns {number} Total filled quantity.
 */
function filledOn(result, side) {
  return result.fills
    .filter(fill => fill.side === side)
    .reduce((sum, fill) => sum + fill.quantity, 0);
}

beforeEach(() => {
  nextId = 0;
});

describe('effectiveLimit', () => {
  test('should use the stated limit', () => {
    expect(effectiveLimit(buy(10, 50))).toBe(50);
  });

  test('should treat a market buy as unbounded and a market sell as zero', () => {
    expect(effectiveLimit(buy(10, null))).toBe(Infinity);
    expect(effectiveLimit(sell(10, null))).toBe(0);
  });
});

describe('remainingQuantity', () => {
  test('should net off what is already filled', () => {
    expect(remainingQuantity({ quantity: 100, filled: 40 })).toBe(60);
  });

  test('should never go negative', () => {
    expect(remainingQuantity({ quantity: 10, filled: 99 })).toBe(0);
  });
});

describe('quantityAt', () => {
  test('should include buyers willing to pay at least the price', () => {
    const bids = [buy(10, 60), buy(10, 50), buy(10, 40)];
    expect(quantityAt(bids, 50)).toBe(20);
  });

  test('should include sellers willing to accept at most the price', () => {
    const asks = [sell(10, 40), sell(10, 50), sell(10, 60)];
    expect(quantityAt(asks, 50)).toBe(20);
  });
});

describe('candidatePrices', () => {
  test('should return distinct limits plus the reference, sorted', () => {
    const orders = [buy(10, 52), sell(10, 48), buy(10, 52)];
    expect(candidatePrices(orders, 50)).toEqual([48, 50, 52]);
  });

  test('should ignore market orders, which name no price', () => {
    expect(candidatePrices([buy(10, null), sell(10, null)], 0)).toEqual([]);
  });
});

describe('clearAuction', () => {
  describe('books that do not cross', () => {
    test('should not trade with no orders at all', () => {
      expect(clearAuction({ orders: [], referencePrice: 50 }))
        .toEqual({ clearingPrice: null, volume: 0, fills: [], imbalance: 0 });
    });

    test('should not trade with only one side', () => {
      expect(clearAuction({ orders: [buy(10, 50)], referencePrice: 50 }).volume).toBe(0);
      expect(clearAuction({ orders: [sell(10, 50)], referencePrice: 50 }).volume).toBe(0);
    });

    test('should not trade when the spread is uncrossed', () => {
      // Nobody will pay what anybody will accept
      const result = clearAuction({ orders: [buy(10, 45), sell(10, 55)], referencePrice: 50 });

      expect(result.volume).toBe(0);
      expect(result.clearingPrice).toBeNull();
      expect(result.fills).toEqual([]);
    });

    test('should leave a market with no bids unsellable', () => {
      // The condition that makes a balloon-loan cliff bite
      expect(clearAuction({ orders: [sell(1000, 1)], referencePrice: 50 }).volume).toBe(0);
    });
  });

  describe('clearing price', () => {
    test('should cross a simple overlapping book', () => {
      const result = clearAuction({ orders: [buy(10, 55), sell(10, 45)], referencePrice: 50 });

      expect(result.volume).toBe(10);
      expect(result.clearingPrice).toBeGreaterThanOrEqual(45);
      expect(result.clearingPrice).toBeLessThanOrEqual(55);
    });

    test('should pick the price that trades the most shares', () => {
      const orders = [
        buy(100, 52), buy(10, 51), buy(10, 50),
        sell(100, 50), sell(10, 51), sell(10, 52)
      ];
      const result = clearAuction({ orders, referencePrice: 51 });

      // Verify no other candidate price would have traded more
      candidatePrices(orders, 51).forEach(price => {
        const volume = Math.min(
          quantityAt(orders.filter(o => o.side === SIDES.BUY), price),
          quantityAt(orders.filter(o => o.side === SIDES.SELL), price)
        );
        expect(volume).toBeLessThanOrEqual(result.volume);
      });
    });

    test('should break a volume tie toward the smaller imbalance', () => {
      const orders = [buy(50, 52), buy(50, 48), sell(50, 48), sell(50, 52)];
      const result = clearAuction({ orders, referencePrice: 50 });

      const demand = quantityAt(orders.filter(o => o.side === SIDES.BUY), result.clearingPrice);
      const supply = quantityAt(orders.filter(o => o.side === SIDES.SELL), result.clearingPrice);
      expect(Math.abs(demand - supply)).toBe(result.imbalance);
    });

    test('should settle both sides at one price', () => {
      const result = clearAuction({
        orders: [buy(10, 60), buy(10, 55), sell(10, 40), sell(10, 45)],
        referencePrice: 50
      });

      const prices = new Set(result.fills.map(fill => fill.price));
      expect(prices.size).toBe(1);
      expect([...prices][0]).toBe(result.clearingPrice);
    });

    test('should handle market orders on both sides', () => {
      const result = clearAuction({
        orders: [buy(10, null), sell(10, null)],
        referencePrice: 50
      });

      // With no limits naming a price, the reference is where it clears
      expect(result.clearingPrice).toBe(50);
      expect(result.volume).toBe(10);
    });
  });

  describe('allocation', () => {
    test('should match filled quantity on both sides', () => {
      const result = clearAuction({
        orders: [buy(70, 55), sell(30, 45), sell(40, 46)],
        referencePrice: 50
      });

      expect(filledOn(result, SIDES.BUY)).toBe(result.volume);
      expect(filledOn(result, SIDES.SELL)).toBe(result.volume);
    });

    test('should never fill an order beyond its size', () => {
      const result = clearAuction({
        orders: [buy(10, 60), sell(1000, 40)],
        referencePrice: 50
      });

      result.fills.forEach(fill => expect(fill.quantity).toBeLessThanOrEqual(1000));
      expect(filledOn(result, SIDES.BUY)).toBe(10);
    });

    test('should fill better-priced orders before those merely at the price', () => {
      // 30 shares on offer, 40 wanted: the 60 bid should be satisfied first
      const aggressive = buy(20, 60);
      const marginal = buy(20, 50);
      const result = clearAuction({
        orders: [aggressive, marginal, sell(30, 50)],
        referencePrice: 50
      });

      const byOrder = new Map(result.fills.map(fill => [fill.orderId, fill.quantity]));
      expect(byOrder.get(aggressive.id)).toBe(20);
      expect(byOrder.get(marginal.id)).toBe(10);
    });

    test('should prorate across orders sitting at the clearing price', () => {
      const first = buy(30, 50);
      const second = buy(30, 50);
      const result = clearAuction({
        orders: [first, second, sell(30, 50)],
        referencePrice: 50
      });

      const byOrder = new Map(result.fills.map(fill => [fill.orderId, fill.quantity]));
      expect(byOrder.get(first.id) + byOrder.get(second.id)).toBe(30);
      expect(byOrder.get(first.id)).toBeGreaterThan(0);
      expect(byOrder.get(second.id)).toBeGreaterThan(0);
    });

    test('should allocate every share despite flooring', () => {
      // Three equal orders against seven shares does not divide evenly
      const result = clearAuction({
        orders: [buy(10, 50), buy(10, 50), buy(10, 50), sell(7, 50)],
        referencePrice: 50
      });

      expect(filledOn(result, SIDES.BUY)).toBe(7);
      expect(filledOn(result, SIDES.SELL)).toBe(7);
    });

    test('should respect quantity already filled', () => {
      const partly = buy(100, 55, { filled: 90 });
      const result = clearAuction({ orders: [partly, sell(50, 45)], referencePrice: 50 });

      expect(filledOn(result, SIDES.BUY)).toBe(10);
    });
  });

  describe('price impact', () => {
    test('should clear a large buy at a worse price than a small one', () => {
      const ladder = () => [sell(10, 50), sell(10, 55), sell(10, 60), sell(10, 70)];

      const small = clearAuction({ orders: [buy(10, 100), ...ladder()], referencePrice: 50 });
      const large = clearAuction({ orders: [buy(40, 100), ...ladder()], referencePrice: 50 });

      // Depth is real: taking more of the book costs more per share
      expect(large.clearingPrice).toBeGreaterThan(small.clearingPrice);
      expect(large.volume).toBeGreaterThan(small.volume);
    });

    test('should cap a buy larger than the whole book at the book size', () => {
      const result = clearAuction({
        orders: [buy(10000, null), sell(10, 50), sell(10, 60)],
        referencePrice: 50
      });

      expect(result.volume).toBe(20);
    });
  });

  describe('determinism', () => {
    test('should give the same result whatever order the book is stored in', () => {
      const orders = [buy(30, 52), buy(20, 51), sell(25, 50), sell(25, 51), buy(10, 50)];

      const forward = clearAuction({ orders, referencePrice: 51 });
      const reversed = clearAuction({ orders: [...orders].reverse(), referencePrice: 51 });

      expect(reversed.clearingPrice).toBe(forward.clearingPrice);
      expect(reversed.volume).toBe(forward.volume);

      const normalize = result => [...result.fills]
        .sort((a, b) => a.orderId - b.orderId)
        .map(fill => `${fill.orderId}:${fill.quantity}@${fill.price}`);
      expect(normalize(reversed)).toEqual(normalize(forward));
    });

    test('should repeat exactly for an identical book', () => {
      const build = () => {
        nextId = 0;
        return [buy(30, 52), buy(20, 51), sell(25, 50), sell(25, 51)];
      };

      expect(JSON.stringify(clearAuction({ orders: build(), referencePrice: 51 })))
        .toBe(JSON.stringify(clearAuction({ orders: build(), referencePrice: 51 })));
    });
  });
});

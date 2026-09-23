/**
 * Periodic call auction: one clearing price per market tick.
 *
 * Every resting order is collected and crossed at a single price, rather than
 * matched continuously as they arrive. That was chosen over a continuous order
 * book because this game's clock advances in chunks -- a jump costs one to
 * twenty ticks -- and a call market clears in chunks too. Running twenty rounds
 * of continuous matching that the player cannot watch would be fiction.
 *
 * It also gives real depth without inventing it. Price impact comes from
 * consuming actual resting orders, so cornering a thin float works because you
 * genuinely bought the offers, and a book with no bids genuinely cannot be sold
 * into. That is what makes the balloon-loan cliff bite.
 *
 * The clearing rule is the standard one: pick the price that trades the most
 * shares. Ties are broken toward the smaller imbalance, then toward the
 * reference price, then by taking the lowest candidate, so the outcome is fully
 * determined by the book and never by iteration order.
 */

/** Order sides. */
const SIDES = { BUY: 'buy', SELL: 'sell' };

/**
 * The effective limit for an order, treating a market order as unbounded.
 * @param {Object} order - Order with `side` and optional `limitPrice`.
 * @returns {number} Effective limit price.
 * @example
 * effectiveLimit({ side: 'buy', limitPrice: null }); // => Infinity
 */
function effectiveLimit(order) {
  // Check for an absent limit before coercing: Number(null) is 0, which is a
  // finite number, so a market order would otherwise read as a limit of zero --
  // an instruction to buy only if the price were free.
  if (order.limitPrice === null || order.limitPrice === undefined) {
    return order.side === SIDES.BUY ? Infinity : 0;
  }

  const limit = Number(order.limitPrice);
  if (Number.isFinite(limit)) {
    return limit;
  }

  // A market order accepts whatever the auction settles on
  return order.side === SIDES.BUY ? Infinity : 0;
}

/**
 * Quantity still outstanding on an order.
 * @param {Object} order - Order with `quantity` and optional `filled`.
 * @returns {number} Unfilled quantity, never negative.
 * @example
 * remainingQuantity({ quantity: 100, filled: 40 }); // => 60
 */
function remainingQuantity(order) {
  const quantity = Number(order.quantity) || 0;
  const filled = Number(order.filled) || 0;
  return Math.max(0, quantity - filled);
}

/**
 * Total quantity willing to trade at a candidate price.
 * @param {Array<Object>} orders - Orders on one side.
 * @param {number} price - Candidate clearing price.
 * @returns {number} Quantity that would participate.
 * @example
 * quantityAt(bids, 50);
 */
function quantityAt(orders, price) {
  return orders.reduce((total, order) => {
    const limit = effectiveLimit(order);
    // A buyer trades at or below their limit; a seller at or above theirs
    const willing = order.side === SIDES.BUY ? limit >= price : limit <= price;
    return willing ? total + remainingQuantity(order) : total;
  }, 0);
}

/**
 * Candidate clearing prices worth evaluating.
 *
 * The volume-maximizing price is always at one of the limit prices in the book,
 * so only those need testing. The reference price is included so a book with
 * only market orders still has somewhere to clear.
 * @param {Array<Object>} orders - All orders.
 * @param {number} referencePrice - Last traded or anchor price.
 * @returns {Array<number>} Sorted distinct candidate prices.
 * @example
 * candidatePrices(orders, 50); // => [48, 50, 52]
 */
function candidatePrices(orders, referencePrice) {
  const prices = new Set();

  orders.forEach(order => {
    if (order.limitPrice === null || order.limitPrice === undefined) {
      return;
    }
    const limit = Number(order.limitPrice);
    if (Number.isFinite(limit) && limit > 0) {
      prices.add(Math.round(limit));
    }
  });

  const reference = Math.round(Number(referencePrice) || 0);
  if (reference > 0) {
    prices.add(reference);
  }

  return [...prices].sort((a, b) => a - b);
}

/**
 * Allocate a clearing quantity across the orders that participate.
 *
 * Orders strictly inside the clearing price fill first and in full, because
 * they were willing to trade on worse terms than the auction delivered. What is
 * left is prorated across the orders sitting exactly at the clearing price.
 *
 * Proration floors each share and hands the remainder out by ascending order
 * id, so the split is deterministic and every share is allocated.
 * @param {Array<Object>} orders - Orders on one side.
 * @param {number} price - Clearing price.
 * @param {number} available - Quantity to allocate.
 * @returns {Array<Object>} Allocations as `{ order, quantity }`.
 * @example
 * allocate(bids, 50, 120);
 */
function allocate(orders, price, available) {
  const participating = orders.filter(order => {
    const limit = effectiveLimit(order);
    const willing = order.side === SIDES.BUY ? limit >= price : limit <= price;
    return willing && remainingQuantity(order) > 0;
  });

  const inside = [];
  const atPrice = [];
  participating.forEach(order => {
    const limit = effectiveLimit(order);
    if (limit === price) {
      atPrice.push(order);
    } else {
      inside.push(order);
    }
  });

  const allocations = [];
  let remaining = available;

  // Better-priced orders are entitled to fill before those merely at the price
  inside
    .sort((a, b) => a.id - b.id)
    .forEach(order => {
      if (remaining <= 0) {
        return;
      }
      const quantity = Math.min(remainingQuantity(order), remaining);
      if (quantity > 0) {
        allocations.push({ order, quantity });
        remaining -= quantity;
      }
    });

  if (remaining <= 0 || atPrice.length === 0) {
    return allocations;
  }

  const marginalTotal = atPrice.reduce((sum, order) => sum + remainingQuantity(order), 0);
  if (marginalTotal <= 0) {
    return allocations;
  }

  const ordered = [...atPrice].sort((a, b) => a.id - b.id);
  const prorated = ordered.map(order => {
    const share = Math.floor((remaining * remainingQuantity(order)) / marginalTotal);
    return { order, quantity: Math.min(share, remainingQuantity(order)) };
  });

  let allocated = prorated.reduce((sum, entry) => sum + entry.quantity, 0);

  // Hand out the flooring remainder in a fixed order so nothing is lost and the
  // result does not depend on how the orders happened to be stored
  for (let i = 0; i < prorated.length && allocated < remaining; i += 1) {
    const entry = prorated[i];
    if (entry.quantity < remainingQuantity(entry.order)) {
      entry.quantity += 1;
      allocated += 1;
    }
  }

  prorated.forEach(entry => {
    if (entry.quantity > 0) {
      allocations.push(entry);
    }
  });

  return allocations;
}

/**
 * Clear a book at the price that trades the most shares.
 * @param {Object} params - Auction parameters.
 * @param {Array<Object>} params.orders - Resting orders, each
 *   `{ id, holder, side, quantity, filled, limitPrice }`.
 * @param {number} [params.referencePrice=0] - Last traded or anchor price.
 * @returns {Object} `{ clearingPrice, volume, fills, imbalance }`. `fills` are
 *   `{ orderId, holder, side, quantity, price }`. A book that does not cross
 *   returns volume zero and a null clearing price.
 * @example
 * const result = clearAuction({ orders, referencePrice: 50 });
 */
function clearAuction({ orders = [], referencePrice = 0 } = {}) {
  const live = orders.filter(order => remainingQuantity(order) > 0);
  const bids = live.filter(order => order.side === SIDES.BUY);
  const asks = live.filter(order => order.side === SIDES.SELL);

  const empty = { clearingPrice: null, volume: 0, fills: [], imbalance: 0 };

  if (bids.length === 0 || asks.length === 0) {
    return empty;
  }

  let best = null;

  candidatePrices(live, referencePrice).forEach(price => {
    const demand = quantityAt(bids, price);
    const supply = quantityAt(asks, price);
    const volume = Math.min(demand, supply);

    if (volume <= 0) {
      return;
    }

    const imbalance = Math.abs(demand - supply);
    const distance = Math.abs(price - (Number(referencePrice) || price));

    if (best === null
      || volume > best.volume
      || (volume === best.volume && imbalance < best.imbalance)
      || (volume === best.volume && imbalance === best.imbalance && distance < best.distance)) {
      best = { price, volume, imbalance, distance };
    }
  });

  if (best === null) {
    return empty;
  }

  const buyFills = allocate(bids, best.price, best.volume);
  const sellFills = allocate(asks, best.price, best.volume);

  const fills = [...buyFills, ...sellFills].map(({ order, quantity }) => ({
    orderId: order.id,
    holder: order.holder,
    side: order.side,
    quantity,
    price: best.price
  }));

  return {
    clearingPrice: best.price,
    volume: best.volume,
    fills,
    imbalance: best.imbalance
  };
}

module.exports = {
  SIDES,
  effectiveLimit,
  remainingQuantity,
  quantityAt,
  candidatePrices,
  allocate,
  clearAuction
};

const { holderKey } = require('./accounts');

/**
 * Weighted-average cost basis for goods inventory, per holder per good.
 *
 * The ledger records inventory as a credits amount, but computing cost of goods
 * sold needs to know what the specific units being sold actually cost. That is
 * state which cannot be recovered cheaply by scanning the journal, so it is
 * tracked here alongside it.
 *
 * Weighted average is used rather than FIFO because it needs only two numbers
 * per (holder, good) instead of a lot list, survives serialization trivially,
 * and cannot be gamed by choosing which units to sell.
 *
 * The central invariant is that **selling out leaves no residue**: consuming
 * every unit releases exactly the recorded total cost, so the ledger's
 * INVENTORY account returns to zero rather than accumulating rounding dust.
 * Partial consumption is prorated and the remainder kept exact by subtraction,
 * never by recomputing from a rounded average.
 */
class CostBasis {
  /**
   * Create an empty cost basis tracker.
   * @example
   * const basis = new CostBasis();
   */
  constructor() {
    /** @type {Map<string, Map<string, {quantity: number, totalCost: number}>>} */
    this.positions = new Map();
  }

  /**
   * Get the mutable position record for a holder and good, creating it if absent.
   * @param {string} key - Holder key.
   * @param {string} goodName - Good name.
   * @returns {Object} Position as `{ quantity, totalCost }`.
   */
  positionFor(key, goodName) {
    if (!this.positions.has(key)) {
      this.positions.set(key, new Map());
    }
    const goods = this.positions.get(key);
    if (!goods.has(goodName)) {
      goods.set(goodName, { quantity: 0, totalCost: 0 });
    }
    return goods.get(goodName);
  }

  /**
   * Record a purchase, folding it into the weighted average.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} goodName - Good acquired.
   * @param {number} quantity - Positive integer units acquired.
   * @param {number} totalCost - Non-negative integer credits paid in total.
   * @returns {Object} The updated position as `{ quantity, totalCost }`.
   * @throws {TypeError} When quantity or totalCost are invalid.
   * @example
   * basis.acquire(corpHolder, 'metal', 100, 1200); // 100 units at 12 each
   */
  acquire(holder, goodName, quantity, totalCost) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new TypeError(`quantity must be a positive integer, received ${quantity}`);
    }
    if (!Number.isInteger(totalCost) || totalCost < 0) {
      throw new TypeError(`totalCost must be a non-negative integer, received ${totalCost}`);
    }

    const position = this.positionFor(
      typeof holder === 'string' ? holder : holderKey(holder),
      goodName
    );
    position.quantity += quantity;
    position.totalCost += totalCost;

    return { ...position };
  }

  /**
   * Consume units and release their cost.
   *
   * Consuming the whole position releases exactly the recorded total cost, so
   * no rounding residue can survive a sell-out. A partial consumption prorates
   * and keeps the remainder exact by subtraction.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} goodName - Good consumed.
   * @param {number} quantity - Units to consume; clamped to what is held.
   * @returns {Object} `{ quantity, cost }` actually consumed, both integers.
   * @example
   * const { quantity, cost } = basis.consume(corpHolder, 'metal', 30);
   * // cost is the COGS amount to post
   */
  consume(holder, goodName, quantity) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { quantity: 0, cost: 0 };
    }

    const key = typeof holder === 'string' ? holder : holderKey(holder);
    const position = this.positions.get(key)?.get(goodName);
    if (!position || position.quantity <= 0) {
      return { quantity: 0, cost: 0 };
    }

    if (quantity >= position.quantity) {
      // Full liquidation releases the exact recorded cost, leaving nothing behind
      const consumed = { quantity: position.quantity, cost: position.totalCost };
      position.quantity = 0;
      position.totalCost = 0;
      return consumed;
    }

    const cost = Math.round((position.totalCost * quantity) / position.quantity);
    position.quantity -= quantity;
    position.totalCost -= cost;

    return { quantity, cost };
  }

  /**
   * Get the units held.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} goodName - Good name.
   * @returns {number} Units held, zero when none.
   * @example
   * basis.quantity(corpHolder, 'metal'); // => 70
   */
  quantity(holder, goodName) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    return this.positions.get(key)?.get(goodName)?.quantity || 0;
  }

  /**
   * Get the total recorded cost of the units held.
   * This equals the holder's INVENTORY ledger balance when both are kept in step.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} goodName - Good name.
   * @returns {number} Total cost in credits, zero when none.
   * @example
   * basis.totalCost(corpHolder, 'metal'); // => 840
   */
  totalCost(holder, goodName) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    return this.positions.get(key)?.get(goodName)?.totalCost || 0;
  }

  /**
   * Get the weighted-average unit cost.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} goodName - Good name.
   * @returns {number} Average cost per unit, or 0 when nothing is held.
   *   Not rounded: callers that post to the ledger must round the total, not
   *   the per-unit figure, or repeated small trades drift.
   * @example
   * basis.averageCost(corpHolder, 'metal'); // => 12
   */
  averageCost(holder, goodName) {
    const held = this.quantity(holder, goodName);
    if (held <= 0) {
      return 0;
    }
    return this.totalCost(holder, goodName) / held;
  }

  /**
   * Get every good a holder has a position in.
   * @param {Object|string} holder - Holder object or key.
   * @returns {Object} Map of good name to `{ quantity, totalCost }`, excluding empties.
   * @example
   * basis.holderPositions(corpHolder); // => { metal: { quantity: 70, totalCost: 840 } }
   */
  holderPositions(holder) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    const positions = {};
    this.positions.get(key)?.forEach((position, goodName) => {
      if (position.quantity > 0) {
        positions[goodName] = { ...position };
      }
    });
    return positions;
  }

  /**
   * Total recorded inventory cost across every good a holder holds.
   * Should equal the holder's INVENTORY ledger balance.
   * @param {Object|string} holder - Holder object or key.
   * @returns {number} Total inventory cost in credits.
   * @example
   * basis.holderInventoryValue(corpHolder);
   */
  holderInventoryValue(holder) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    let total = 0;
    this.positions.get(key)?.forEach(position => {
      total += position.totalCost;
    });
    return total;
  }

  /**
   * Serialize for saving. Empty positions are dropped to keep saves small.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = basis.toJSON();
   */
  toJSON() {
    const holders = [];

    // Sorted for stable output so saves diff cleanly and byte-identical
    // comparison works as a determinism assertion.
    [...this.positions.keys()].sort().forEach(key => {
      const goods = {};
      const goodNames = [...this.positions.get(key).keys()].sort();

      goodNames.forEach(goodName => {
        const position = this.positions.get(key).get(goodName);
        if (position.quantity > 0 || position.totalCost !== 0) {
          goods[goodName] = { quantity: position.quantity, totalCost: position.totalCost };
        }
      });

      if (Object.keys(goods).length > 0) {
        holders.push({ holder: key, goods });
      }
    });

    return { holders };
  }

  /**
   * Rebuild from saved data.
   * @param {Object} [data] - Serialized cost basis, or undefined for a fresh one.
   * @returns {CostBasis} Restored tracker.
   * @example
   * const basis = CostBasis.fromJSON(saveData.economy.costBasis);
   */
  static fromJSON(data) {
    const basis = new CostBasis();

    if (Array.isArray(data?.holders)) {
      data.holders.forEach(({ holder, goods }) => {
        if (!holder || !goods) {
          return;
        }
        Object.entries(goods).forEach(([goodName, position]) => {
          const restored = basis.positionFor(holder, goodName);
          restored.quantity = Number(position?.quantity) || 0;
          restored.totalCost = Number(position?.totalCost) || 0;
        });
      });
    }

    return basis;
  }
}

module.exports = {
  CostBasis
};

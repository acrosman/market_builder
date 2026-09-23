const { holderKey, parseHolderKey } = require('../economy/accounts');

/**
 * Who owns which shares.
 *
 * One store covers every holder kind. The player holds shares personally with
 * their own credits, and corporations hold shares of each other out of their
 * treasuries, but both are just holders here. Keeping them in one structure is
 * what makes a cap table a simple query rather than a join across two systems,
 * and it is what will let a corporation be taken over by whoever accumulates
 * enough of it, regardless of who they are.
 *
 * Holdings are tracked alongside the ledger rather than inside it. The ledger
 * records the credits that moved; this records the shares. Both are posted from
 * the same fill so they cannot disagree.
 */
class Portfolio {
  /**
   * Create an empty holdings store.
   * @example
   * const portfolio = new Portfolio();
   */
  constructor() {
    /** @type {Map<string, Map<string, number>>} holder key -> listing -> shares. */
    this.holdings = new Map();
  }

  /**
   * Get a holder's position in one listing.
   * @param {Object|string} holder - Holder reference or key.
   * @param {string} corporationName - The listed company.
   * @returns {number} Shares held, which may be negative when short.
   * @example
   * portfolio.sharesHeld(holder, 'Acme Orbital');
   */
  sharesHeld(holder, corporationName) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    return this.holdings.get(key)?.get(corporationName) || 0;
  }

  /**
   * Adjust a holder's position by a signed amount.
   * @param {Object|string} holder - Holder reference or key.
   * @param {string} corporationName - The listed company.
   * @param {number} delta - Shares to add, negative to remove.
   * @returns {number} The resulting position.
   * @example
   * portfolio.adjust(holder, 'Acme Orbital', 100);
   */
  adjust(holder, corporationName, delta) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    const shares = Math.round(Number(delta) || 0);
    if (shares === 0) {
      return this.sharesHeld(key, corporationName);
    }

    if (!this.holdings.has(key)) {
      this.holdings.set(key, new Map());
    }

    const positions = this.holdings.get(key);
    const updated = (positions.get(corporationName) || 0) + shares;

    if (updated === 0) {
      positions.delete(corporationName);
    } else {
      positions.set(corporationName, updated);
    }

    return updated;
  }

  /**
   * Get everything a holder owns.
   * @param {Object|string} holder - Holder reference or key.
   * @returns {Object} Map of company name to shares held.
   * @example
   * portfolio.positionsFor(playerHolder(player));
   */
  positionsFor(holder) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    const positions = {};
    this.holdings.get(key)?.forEach((shares, corporationName) => {
      if (shares !== 0) {
        positions[corporationName] = shares;
      }
    });
    return positions;
  }

  /**
   * Get the register of everyone holding a listing.
   * @param {string} corporationName - The listed company.
   * @returns {Array<Object>} `{ holder, shares }`, largest holding first.
   * @example
   * const table = portfolio.capTable('Acme Orbital');
   */
  capTable(corporationName) {
    const rows = [];

    this.holdings.forEach((positions, key) => {
      const shares = positions.get(corporationName) || 0;
      if (shares !== 0) {
        rows.push({ holder: parseHolderKey(key), shares });
      }
    });

    // Largest first, then by holder key, so equal holdings do not reorder
    return rows.sort(
      (a, b) => (b.shares - a.shares)
        || holderKey(a.holder).localeCompare(holderKey(b.holder))
    );
  }

  /**
   * Total shares recorded as held in a listing.
   *
   * This should equal the listing's shares outstanding once every share has
   * been issued to somebody, and is the reconciliation that catches shares
   * being created or destroyed by a bad fill.
   * @param {string} corporationName - The listed company.
   * @returns {number} Total shares held across all holders.
   * @example
   * portfolio.totalHeld('Acme Orbital');
   */
  totalHeld(corporationName) {
    let total = 0;
    this.holdings.forEach(positions => {
      total += positions.get(corporationName) || 0;
    });
    return total;
  }

  /**
   * Get a holder's share of a listing.
   * @param {Object|string} holder - Holder reference or key.
   * @param {string} corporationName - The listed company.
   * @param {number} sharesOutstanding - Total shares in existence.
   * @returns {number} Fraction owned, from 0 to 1.
   * @example
   * portfolio.ownershipFraction(holder, 'Acme Orbital', 10000);
   */
  ownershipFraction(holder, corporationName, sharesOutstanding) {
    const outstanding = Number(sharesOutstanding) || 0;
    if (outstanding <= 0) {
      return 0;
    }
    return this.sharesHeld(holder, corporationName) / outstanding;
  }

  /**
   * Serialize the holdings for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = portfolio.toJSON();
   */
  toJSON() {
    // Sorted for stable output so saves diff cleanly and byte-identical
    // comparison works as a determinism assertion.
    const holders = [...this.holdings.keys()].sort().map(key => {
      const positions = {};
      [...this.holdings.get(key).keys()].sort().forEach(corporationName => {
        const shares = this.holdings.get(key).get(corporationName);
        if (shares !== 0) {
          positions[corporationName] = shares;
        }
      });
      return { holder: key, positions };
    }).filter(entry => Object.keys(entry.positions).length > 0);

    return { holders };
  }

  /**
   * Rebuild holdings from saved data.
   * @param {Object} [data] - Serialized holdings.
   * @returns {Portfolio} Restored store.
   * @example
   * const portfolio = Portfolio.fromJSON(saved);
   */
  static fromJSON(data) {
    const portfolio = new Portfolio();

    if (Array.isArray(data?.holders)) {
      data.holders.forEach(({ holder, positions }) => {
        if (!holder || !positions) {
          return;
        }
        const entries = new Map();
        Object.entries(positions).forEach(([corporationName, shares]) => {
          const held = Math.round(Number(shares) || 0);
          if (held !== 0) {
            entries.set(corporationName, held);
          }
        });
        if (entries.size > 0) {
          portfolio.holdings.set(holder, entries);
        }
      });
    }

    return portfolio;
  }
}

module.exports = {
  Portfolio
};

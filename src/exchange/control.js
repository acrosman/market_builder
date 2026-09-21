const { holderKey, parseHolderKey } = require('../economy/accounts');

/** Share of a company that constitutes control. */
const CONTROL_THRESHOLD = 0.5;

/**
 * Who controls a listed company.
 *
 * Control follows the cap table and nothing else. Whoever holds more than half
 * the shares controls the company, whether they are the player, a rival
 * corporation, or the investing public that never wanted the job. That is what
 * makes buying a failing company on the open market a real move rather than a
 * bookkeeping exercise, and it is why personal and corporate holdings share one
 * register: a takeover is a matter of who accumulates enough, not of which
 * system recorded it.
 *
 * Nothing is seized here. Detecting that control has changed is separate from
 * deciding what the new controller may do with the company's worlds and debts,
 * which is tracked separately and deliberately unbuilt.
 */

/**
 * Work out who controls a listing, if anyone.
 * @param {Object} portfolio - The holdings register.
 * @param {Object} listing - The listing to assess.
 * @returns {Object|null} `{ holder, shares, fraction }`, or null when nobody has control.
 * @example
 * const controller = controllingHolder(exchange.portfolio, listing);
 */
function controllingHolder(portfolio, listing) {
  const outstanding = Number(listing?.sharesOutstanding) || 0;
  if (outstanding <= 0) {
    return null;
  }

  const table = portfolio.capTable(listing.symbol);
  if (table.length === 0) {
    return null;
  }

  // capTable is sorted largest first, so only the top row can hold a majority
  const largest = table[0];
  const fraction = largest.shares / outstanding;

  if (fraction <= CONTROL_THRESHOLD) {
    return null;
  }

  return { holder: largest.holder, shares: largest.shares, fraction };
}

/**
 * Detect changes of control across every listing.
 *
 * Compared against what was recorded last time rather than recomputed from
 * scratch, so a change is reported once when it happens rather than every cycle
 * for as long as it persists.
 * @param {Object} exchange - The exchange.
 * @returns {Array<Object>} Changes as `{ symbol, from, to }`.
 * @example
 * const changes = detectControlChanges(exchange);
 */
function detectControlChanges(exchange) {
  const changes = [];

  // Sorted so a multi-listing change is reported in a fixed order
  [...exchange.listings.keys()].sort().forEach(symbol => {
    const listing = exchange.getListing(symbol);
    const controller = controllingHolder(exchange.portfolio, listing);
    const nextKey = controller ? holderKey(controller.holder) : null;
    const previousKey = listing.controllerKey ?? null;

    if (nextKey !== previousKey) {
      listing.controllerKey = nextKey;
      changes.push({
        symbol,
        corporationName: listing.corporationName,
        from: previousKey ? parseHolderKey(previousKey) : null,
        to: controller ? controller.holder : null,
        shares: controller ? controller.shares : 0,
        fraction: controller ? controller.fraction : 0
      });
    }
  });

  return changes;
}

/**
 * Whether a holder controls a listing.
 * @param {Object} portfolio - The holdings register.
 * @param {Object} listing - The listing.
 * @param {Object} holder - The holder to check.
 * @returns {boolean} True when that holder holds a majority.
 * @example
 * controls(exchange.portfolio, listing, playerHolder(player));
 */
function controls(portfolio, listing, holder) {
  const controller = controllingHolder(portfolio, listing);
  return Boolean(controller) && holderKey(controller.holder) === holderKey(holder);
}

module.exports = {
  CONTROL_THRESHOLD,
  controllingHolder,
  detectControlChanges,
  controls
};

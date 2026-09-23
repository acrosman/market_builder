const { holderKey } = require('../economy/accounts');

/**
 * Whether a company is controlled, and by whom.
 *
 * The exchange works out who holds what -- that is what a cap table is -- and
 * `src/exchange/control.js` reads it. What counts as control, and whether a
 * given holder has it, is a fact about the company, so it is decided here.
 */

/** The share of a company that constitutes control. */
const CONTROL_THRESHOLD = 0.5;

/**
 * Whether a holding is a controlling one.
 *
 * A simple majority, whoever holds it -- the player, a rival, or the investing
 * public that never wanted the job. That is what makes buying a failing company
 * on the open market a real move rather than a special case.
 * @param {number} fraction - Share of the company held, 0 to 1.
 * @returns {boolean} True when that holding controls the company.
 * @example
 * isControllingStake(0.51); // => true
 */
function isControllingStake(fraction) {
  return Number(fraction) > CONTROL_THRESHOLD;
}

/**
 * Whether a specific holder controls a company.
 * @param {Object|null} controller - The controlling holding, from the exchange.
 * @param {Object} holder - The holder to check.
 * @returns {boolean} True when that holder is the controller.
 * @example
 * isControlledBy(controllingHolder(portfolio, listing), playerHolder(player));
 */
function isControlledBy(controller, holder) {
  return Boolean(controller) && holderKey(controller.holder) === holderKey(holder);
}

module.exports = {
  CONTROL_THRESHOLD,
  isControllingStake,
  isControlledBy
};

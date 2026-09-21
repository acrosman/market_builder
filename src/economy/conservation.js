const { ACCOUNTS, holderKey } = require('./accounts');

/**
 * The money-conservation invariant.
 *
 * Every credit in the game entered it the same way: debited to a holder's CASH
 * and credited to that holder's CONTRIBUTED_CAPITAL. Opening balances, the bank
 * and market endowments, and the investing public's savings all take that form
 * and nothing else does.
 *
 * Every other posting moves credits sideways. A goods sale debits the seller's
 * cash and credits the buyer's; a loan moves cash from the bank against a
 * matching liability; a wage payment moves it to the local economy; a share
 * trade moves it between two holders. None of them changes the total.
 *
 * So the invariant is simply: **total cash equals total injected**. If it
 * stops holding, some subsystem has learned to create or destroy credits, and
 * this says so precisely rather than leaving it to be noticed eventually as
 * prices that make no sense.
 */

/** Entries matching this shape are the only way credits enter the game. */
const INJECTION = {
  debitAccount: ACCOUNTS.CASH,
  creditAccount: ACCOUNTS.CONTRIBUTED_CAPITAL
};

/**
 * Whether an entry injected new credits.
 * @param {Object} entry - A ledger entry.
 * @returns {boolean} True when it created cash from outside the simulation.
 * @example
 * isInjection(entry);
 */
function isInjection(entry) {
  return entry?.debit?.account === INJECTION.debitAccount
    && entry?.credit?.account === INJECTION.creditAccount
    && entry?.debit?.holder === entry?.credit?.holder;
}

/**
 * Total credits injected from outside the simulation.
 * @param {Object} ledger - The economy ledger.
 * @returns {number} Total injected.
 * @example
 * creditsInjected(economy.getLedger());
 */
function creditsInjected(ledger) {
  // Read from the ledger's running total rather than scanned from history.
  // Rollup replaces old entries with balance-preserving ones that do not keep
  // the injection shape, so scanning would report the money supply shrinking
  // every time the journal was compressed.
  return Number(ledger.injectedTotal) || 0;
}

/**
 * Break injections down by the reason recorded on them.
 *
 * Useful when the invariant fails: it says which inflow grew, which is usually
 * enough to identify the subsystem responsible. Scanned from the journal, so it
 * only covers history that has not yet been compressed.
 * @param {Object} ledger - The economy ledger.
 * @returns {Object} Map of reason to total injected.
 * @example
 * injectionsByReason(economy.getLedger());
 */
function injectionsByReason(ledger) {
  const totals = {};

  ledger.entries.forEach(entry => {
    if (!isInjection(entry)) {
      return;
    }
    const reason = entry.refs?.reason || 'opening_balance';
    totals[reason] = (totals[reason] || 0) + entry.amount;
  });

  return totals;
}

/**
 * Check the invariant.
 * @param {Object} ledger - The economy ledger.
 * @returns {Object} `{ holds, totalCash, injected, difference, byReason }`.
 * @example
 * expect(checkConservation(economy.getLedger()).holds).toBe(true);
 */
function checkConservation(ledger) {
  const totalCash = ledger.totalAcrossHolders(ACCOUNTS.CASH);
  const injected = creditsInjected(ledger);

  return {
    holds: totalCash === injected,
    totalCash,
    injected,
    difference: totalCash - injected,
    byReason: injectionsByReason(ledger)
  };
}

/**
 * Cash held by each holder, largest first.
 *
 * Reported alongside a failed conservation check so the holder whose balance
 * moved unexpectedly can be found without reading the journal by hand.
 * @param {Object} ledger - The economy ledger.
 * @returns {Array<Object>} `{ holder, cash }` rows.
 * @example
 * cashByHolder(economy.getLedger());
 */
function cashByHolder(ledger) {
  return ledger.listHolders()
    .map(holder => ({ holder, cash: ledger.balance(holder, ACCOUNTS.CASH) }))
    .filter(row => row.cash !== 0)
    .sort((a, b) => (b.cash - a.cash)
      || holderKey(a.holder).localeCompare(holderKey(b.holder)));
}

module.exports = {
  INJECTION,
  isInjection,
  creditsInjected,
  injectionsByReason,
  checkConservation,
  cashByHolder
};

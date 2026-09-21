const { ENTRY_KINDS } = require('./ledger');
const { ACCOUNTS, corporationHolder, holderKey } = require('./accounts');

/**
 * Paying shareholders out of a quarter's earnings.
 *
 * `dividendRate` has existed since before any of this work and paid nothing: it
 * was set, displayed, and read by no one. Without a payout a share is worth
 * only what the next buyer will pay, which makes the whole exchange a
 * greater-fool game with no anchor in what a company actually earns.
 *
 * Dividends are paid from the quarter's net income, not from cash on hand. A
 * company that lost money pays nothing however much cash it is sitting on,
 * because paying out of capital is a way to drain a treasury into shareholders'
 * pockets while the business fails -- which, once the player controls a
 * corporation and holds its shares, is exactly what they would do.
 */

/**
 * Work out what a corporation should distribute for a period.
 * @param {Object} corporation - The paying corporation.
 * @param {number} netIncome - The period's net income.
 * @returns {number} Integer credits to distribute, never negative.
 * @example
 * dividendDue(corporation, 40000);
 */
function dividendDue(corporation, netIncome) {
  const rate = Number(corporation?.dividendRate) || 0;
  const income = Number(netIncome) || 0;

  if (rate <= 0 || income <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(income * (Math.min(rate, 100) / 100)));
}

/**
 * Pay one corporation's dividend to its shareholders.
 *
 * Distributed in proportion to holdings, with the rounding remainder going to
 * the largest holder so the sum paid matches the sum declared exactly. Anything
 * else would leave credits stranded or conjure a few from nothing.
 *
 * A corporation with no shareholders on the register pays nothing: there is
 * nobody to pay, and declaring it anyway would destroy the credits.
 * @param {Object} params - Payment parameters.
 * @param {Object} params.economy - EconomyState holding the ledger and exchange.
 * @param {Object} params.corporation - The paying corporation.
 * @param {number} params.amount - Integer credits to distribute.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} `{ paid, recipients }`.
 * @example
 * payDividend({ economy, corporation, amount: 40000, tick });
 */
function payDividend({ economy, corporation, amount, tick }) {
  const total = Math.max(0, Math.round(Number(amount) || 0));
  if (total <= 0) {
    return { paid: 0, recipients: 0 };
  }

  const exchange = economy.getExchange();
  const listing = exchange.getListing(corporation.name);
  if (!listing) {
    return { paid: 0, recipients: 0 };
  }

  const issuer = corporationHolder(corporation);
  const issuerKey = holderKey(issuer);

  // Treasury shares pay nothing: a company cannot pay a dividend to itself, and
  // counting them would shrink everyone else's share of the same pot.
  const register = exchange.portfolio.capTable(listing.symbol)
    .filter(row => row.shares > 0 && holderKey(row.holder) !== issuerKey);

  const held = register.reduce((sum, row) => sum + row.shares, 0);
  if (held <= 0) {
    return { paid: 0, recipients: 0 };
  }

  const allocations = register.map(row => ({
    holder: row.holder,
    amount: Math.floor((total * row.shares) / held)
  }));

  const allocated = allocations.reduce((sum, entry) => sum + entry.amount, 0);
  if (allocations.length > 0 && allocated < total) {
    // capTable is sorted largest first, so this is the biggest holder
    allocations[0].amount += total - allocated;
  }

  const entries = [];
  allocations.forEach(entry => {
    if (entry.amount <= 0) {
      return;
    }
    entries.push({
      tick,
      amount: entry.amount,
      debit: { holder: entry.holder, account: ACCOUNTS.CASH },
      credit: { holder: issuer, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.DIVIDEND,
      refs: { corporationName: corporation.name }
    });
    entries.push({
      tick,
      amount: entry.amount,
      debit: { holder: issuer, account: ACCOUNTS.RETAINED_EARNINGS },
      credit: { holder: entry.holder, account: ACCOUNTS.RETAINED_EARNINGS },
      kind: ENTRY_KINDS.DIVIDEND,
      refs: { corporationName: corporation.name }
    });
  });

  if (entries.length === 0) {
    return { paid: 0, recipients: 0 };
  }

  economy.getLedger().postMany(entries);

  return {
    paid: allocations.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0),
    recipients: allocations.filter(entry => entry.amount > 0).length
  };
}

/**
 * Pay dividends for every statement published in a quarter close.
 * @param {Object} params - Payment parameters.
 * @param {Object} params.game - The game.
 * @param {Array<Object>} params.statements - Statements just published.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Array<Object>} Dividends actually paid.
 * @example
 * payQuarterlyDividends({ game, statements, tick });
 */
function payQuarterlyDividends({ game, statements, tick }) {
  if (game.getSettings().dividends?.pay_on_quarter_close === false) {
    return [];
  }

  const economy = game.getEconomy();
  const paid = [];

  statements.forEach(statement => {
    const corporation = game.findCorporation(statement.corporationName);
    if (!corporation || corporation.isBankrupt) {
      return;
    }

    const due = dividendDue(corporation, statement.income?.netIncome);
    if (due <= 0) {
      return;
    }

    const result = payDividend({ economy, corporation, amount: due, tick });
    if (result.paid > 0) {
      paid.push({ corporationName: corporation.name, ...result });
      corporation.setCashPosition(
        economy.getLedger().balance(corporationHolder(corporation), ACCOUNTS.CASH)
      );
    }
  });

  return paid;
}

module.exports = {
  dividendDue,
  payDividend,
  payQuarterlyDividends
};

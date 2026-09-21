const { ENTRY_KINDS } = require('./ledger');
const { ACCOUNTS, BANK_HOLDER } = require('./accounts');

/**
 * Recorders for the economy's money and goods movements.
 *
 * Most real transactions need more than one balanced entry: a goods sale is the
 * seller's proceeds, the seller's cost of sale, and the buyer's acquisition.
 * Encapsulating each one here means callers cannot post half a transaction or
 * get the legs backwards, and there is exactly one place to change when a
 * transaction's accounting changes.
 *
 * Every function takes the EconomyState so the ledger and the cost basis stay
 * in step: an acquisition that debits INVENTORY always records a cost basis,
 * and a sale that credits INVENTORY always consumes one.
 *
 * Callers round to integers before calling. Credits are integral in this game
 * and the ledger rejects fractional amounts.
 */

/**
 * Record value entering the simulation from outside it.
 *
 * Starting credits, starting corporate reserves, and initial market stock have
 * no counterparty inside the game, so they are booked as contributed capital.
 * These are the only defined sources of new value; everything else must be a
 * transfer, which is what makes money conservation checkable.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Opening balance parameters.
 * @param {number} params.tick - Tick to record at, normally 0.
 * @param {Object} params.holder - Holder receiving the opening balance.
 * @param {number} params.amount - Positive integer credits.
 * @param {string} [params.account] - Asset account credited, defaults to CASH.
 * @param {Object} [params.refs] - Optional references.
 * @returns {Object|null} The posted entry, or null when the amount is not positive.
 * @example
 * recordOpeningBalance(economy, { tick: 0, holder: playerHolder(player), amount: 1000 });
 */
function recordOpeningBalance(economy, { tick, holder, amount, account = ACCOUNTS.CASH, refs }) {
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) {
    return null;
  }

  return economy.getLedger().post({
    tick,
    amount: value,
    debit: { holder, account },
    credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
    kind: ENTRY_KINDS.SHARE_ISSUE,
    refs
  });
}

/**
 * Record opening goods stock, establishing its cost basis.
 *
 * Market inventory is created at world generation rather than bought, so it
 * enters as contributed capital at an assumed cost. That cost becomes the
 * market's basis, so its later sales show a real margin instead of booking the
 * entire sale price as profit.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Opening stock parameters.
 * @param {number} params.tick - Tick to record at, normally 0.
 * @param {Object} params.holder - Holder receiving the stock.
 * @param {string} params.goodName - Good being stocked.
 * @param {number} params.quantity - Positive integer units.
 * @param {number} params.totalCost - Assumed integer cost of the stock.
 * @returns {Object|null} The posted entry, or null when nothing was stocked.
 * @example
 * recordOpeningStock(economy, {
 *   tick: 0, holder: marketHolder(obj), goodName: 'metal', quantity: 250, totalCost: 3000
 * });
 */
function recordOpeningStock(economy, { tick, holder, goodName, quantity, totalCost }) {
  const units = Math.round(Number(quantity) || 0);
  const cost = Math.round(Number(totalCost) || 0);
  if (units <= 0 || cost < 0) {
    return null;
  }

  economy.getCostBasis().acquire(holder, goodName, units, cost);

  if (cost === 0) {
    return null;
  }

  return economy.getLedger().post({
    tick,
    amount: cost,
    debit: { holder, account: ACCOUNTS.INVENTORY },
    credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
    kind: ENTRY_KINDS.PRODUCTION_OUTPUT,
    refs: { goodName, quantity: units }
  });
}

/**
 * Record a goods trade between a buyer and a seller.
 *
 * Posts three entries atomically: the seller's proceeds, the seller's cost of
 * sale at weighted-average cost, and the buyer's acquisition. Cash moves from
 * buyer to seller, so the trade conserves money by construction.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Trade parameters.
 * @param {number} params.tick - Tick the trade occurred on.
 * @param {Object} params.buyer - Holder acquiring the goods and paying cash.
 * @param {Object} params.seller - Holder releasing the goods and receiving cash.
 * @param {string} params.goodName - Good traded.
 * @param {number} params.quantity - Positive integer units.
 * @param {number} params.totalPrice - Integer credits paid in total.
 * @param {Object} [params.refs] - Optional references such as `{ stellarObjectId }`.
 * @returns {Array<Object>} The posted entries.
 * @example
 * recordGoodsTrade(economy, {
 *   tick: 12, buyer: playerHolder(player), seller: marketHolder(obj),
 *   goodName: 'metal', quantity: 100, totalPrice: 1800
 * });
 */
function recordGoodsTrade(economy, { tick, buyer, seller, goodName, quantity, totalPrice, refs }) {
  const units = Math.round(Number(quantity) || 0);
  const price = Math.round(Number(totalPrice) || 0);
  if (units <= 0) {
    return [];
  }

  const ledger = economy.getLedger();
  const costBasis = economy.getCostBasis();
  const entryRefs = { goodName, quantity: units, ...refs };

  // Release the seller's cost basis first so the cost of sale is known.
  const { cost: costOfSale } = costBasis.consume(seller, goodName, units);

  const entries = [];

  if (price > 0) {
    entries.push({
      tick,
      amount: price,
      debit: { holder: seller, account: ACCOUNTS.CASH },
      credit: { holder: seller, account: ACCOUNTS.REVENUE },
      kind: ENTRY_KINDS.GOODS_SALE,
      refs: entryRefs
    });
    entries.push({
      tick,
      amount: price,
      debit: { holder: buyer, account: ACCOUNTS.INVENTORY },
      credit: { holder: buyer, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.GOODS_PURCHASE,
      refs: entryRefs
    });
  }

  if (costOfSale > 0) {
    entries.push({
      tick,
      amount: costOfSale,
      debit: { holder: seller, account: ACCOUNTS.COGS },
      credit: { holder: seller, account: ACCOUNTS.INVENTORY },
      kind: ENTRY_KINDS.COST_OF_SALE,
      refs: entryRefs
    });
  }

  const posted = ledger.postMany(entries);

  // The buyer's basis is what they actually paid, which becomes their cost of
  // sale when they resell. This is where a trading profit comes from.
  costBasis.acquire(buyer, goodName, units, price);

  return posted;
}

/**
 * Record a loan draw from the bank.
 *
 * Two entries: the borrower takes cash and owes it, and the bank gives cash and
 * holds a receivable. The bank is a real counterparty, so a loan moves existing
 * credits rather than creating them. `Corporation.takeLoan` alone would mint.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Loan parameters.
 * @param {number} params.tick - Tick the draw occurred on.
 * @param {Object} params.borrower - Holder receiving the principal.
 * @param {number} params.amount - Positive integer principal.
 * @param {Object} [params.refs] - Optional references such as `{ loanId }`.
 * @returns {Array<Object>} The posted entries.
 * @example
 * recordLoanDraw(economy, { tick: 40, borrower: corporationHolder(corp), amount: 50000 });
 */
function recordLoanDraw(economy, { tick, borrower, amount, refs }) {
  const principal = Math.round(Number(amount) || 0);
  if (principal <= 0) {
    return [];
  }

  return economy.getLedger().postMany([
    {
      tick,
      amount: principal,
      debit: { holder: borrower, account: ACCOUNTS.CASH },
      credit: { holder: borrower, account: ACCOUNTS.DEBT },
      kind: ENTRY_KINDS.LOAN_DRAW,
      refs
    },
    {
      tick,
      amount: principal,
      debit: { holder: BANK_HOLDER, account: ACCOUNTS.LOAN_RECEIVABLE },
      credit: { holder: BANK_HOLDER, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.LOAN_DRAW,
      refs
    }
  ]);
}

/**
 * Record a loan repayment.
 *
 * Cash returns to the bank, the borrower's debt falls, and the bank's
 * receivable falls with it.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Repayment parameters.
 * @param {number} params.tick - Tick the payment occurred on.
 * @param {Object} params.borrower - Holder making the payment.
 * @param {number} params.amount - Positive integer amount applied to principal.
 * @param {Object} [params.refs] - Optional references such as `{ loanId }`.
 * @returns {Array<Object>} The posted entries.
 * @example
 * recordLoanPayment(economy, { tick: 90, borrower: corporationHolder(corp), amount: 5000 });
 */
function recordLoanPayment(economy, { tick, borrower, amount, refs }) {
  const payment = Math.round(Number(amount) || 0);
  if (payment <= 0) {
    return [];
  }

  return economy.getLedger().postMany([
    {
      tick,
      amount: payment,
      debit: { holder: borrower, account: ACCOUNTS.DEBT },
      credit: { holder: borrower, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.LOAN_REPAYMENT,
      refs
    },
    {
      tick,
      amount: payment,
      debit: { holder: BANK_HOLDER, account: ACCOUNTS.CASH },
      credit: { holder: BANK_HOLDER, account: ACCOUNTS.LOAN_RECEIVABLE },
      kind: ENTRY_KINDS.LOAN_REPAYMENT,
      refs
    }
  ]);
}

/**
 * Record credits spent on construction.
 *
 * Two things happen. The spender converts cash into a fixed asset, so the spend
 * is capitalized to PROPERTY and does not reduce income for the period. And the
 * credits go to a recipient -- the local economy that supplied the labour and
 * materials -- rather than vanishing.
 *
 * The recipient matters more than it looks. Without one, construction would be
 * an unaccounted money sink, the mirror image of `Corporation.takeLoan` minting
 * credits from nothing, and total cash would no longer be invariant. Paying the
 * local market also gives a useful feedback loop: developing a world enriches
 * its market, which can then afford to buy more from passing traders.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Construction parameters.
 * @param {number} params.tick - Tick the spend occurred on.
 * @param {Object} params.spender - Holder paying for construction.
 * @param {Object} params.recipient - Holder receiving the credits, normally the
 *   local market for the stellar object being built on.
 * @param {number} params.amount - Positive integer credits spent.
 * @param {Object} [params.refs] - Optional references such as `{ stellarObjectId, buildingType }`.
 * @returns {Array<Object>} The posted entries.
 * @example
 * recordConstructionSpend(economy, {
 *   tick: 15, spender: corporationHolder(corp), recipient: marketHolder(obj),
 *   amount: 500, refs: { stellarObjectId: 3, buildingType: 'Mine' }
 * });
 */
function recordConstructionSpend(economy, { tick, spender, recipient, amount, refs }) {
  const spend = Math.round(Number(amount) || 0);
  if (spend <= 0) {
    return [];
  }

  const entries = [
    {
      tick,
      amount: spend,
      debit: { holder: spender, account: ACCOUNTS.PROPERTY },
      credit: { holder: spender, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.CONSTRUCTION_SPEND,
      refs
    }
  ];

  if (recipient) {
    entries.push({
      tick,
      amount: spend,
      debit: { holder: recipient, account: ACCOUNTS.CASH },
      credit: { holder: recipient, account: ACCOUNTS.REVENUE },
      kind: ENTRY_KINDS.CONSTRUCTION_SPEND,
      refs
    });
  }

  return economy.getLedger().postMany(entries);
}

/**
 * Record a transfer of a fixed asset between two holders.
 *
 * **The asset always books at appraised value, never at the price paid.** Any
 * difference between what changed hands and what the asset is worth posts to
 * contributed capital, and never to income.
 *
 * This rule exists ahead of the transfer mechanic it governs, because it cannot
 * be added afterwards without rewriting every posting that used the old one.
 * The hazard is specific: once a player controls two corporations, they will
 * sell a worthless rock from one to the other at an invented price to inflate
 * book value and, if the difference were treated as a gain, manufacture
 * earnings out of nothing. Booking at appraised value makes that trade move
 * assets around without creating a single credit of profit.
 *
 * The rule is applied to every transfer, not only related-party ones. An
 * arm's-length sale at a fair price produces no difference and so no gift
 * posting, which means correctness does not depend on detecting relatedness.
 * @param {Object} economy - EconomyState to record into.
 * @param {Object} params - Transfer parameters.
 * @param {number} params.tick - Tick the transfer occurred on.
 * @param {Object} params.seller - Holder giving up the asset.
 * @param {Object} params.buyer - Holder receiving the asset.
 * @param {number} params.appraisedValue - Independently appraised value.
 * @param {number} params.consideration - Credits actually paid.
 * @param {string} [params.account] - Asset account, defaults to PROPERTY.
 * @param {Object} [params.refs] - Optional references such as `{ stellarObjectId }`.
 * @returns {Array<Object>} The posted entries.
 * @example
 * recordAssetTransfer(economy, {
 *   tick, seller: corporationHolder(a), buyer: corporationHolder(b),
 *   appraisedValue: 250000, consideration: 1, refs: { stellarObjectId: 3 }
 * });
 */
function recordAssetTransfer(economy, {
  tick, seller, buyer, appraisedValue, consideration, account = ACCOUNTS.PROPERTY, refs
}) {
  const appraised = Math.max(0, Math.round(Number(appraisedValue) || 0));
  const paid = Math.max(0, Math.round(Number(consideration) || 0));

  if (appraised <= 0 && paid <= 0) {
    return [];
  }

  const entries = [];

  if (appraised > 0) {
    // The asset moves at what it is worth, on both sets of books
    entries.push({
      tick,
      amount: appraised,
      debit: { holder: buyer, account },
      credit: { holder: seller, account },
      kind: ENTRY_KINDS.PROPERTY_TRANSFER,
      refs
    });
  }

  if (paid > 0) {
    entries.push({
      tick,
      amount: paid,
      debit: { holder: seller, account: ACCOUNTS.CASH },
      credit: { holder: buyer, account: ACCOUNTS.CASH },
      kind: ENTRY_KINDS.PROPERTY_TRANSFER,
      refs
    });
  }

  const difference = appraised - paid;
  if (difference !== 0) {
    // Value given or received for nothing. Contributed capital, never income:
    // this is the leg that stops self-dealing manufacturing earnings.
    const giftRefs = { ...refs, underpaid: difference > 0 };
    entries.push({
      tick,
      amount: Math.abs(difference),
      debit: difference > 0
        ? { holder: seller, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
        : { holder: buyer, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
      credit: difference > 0
        ? { holder: buyer, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
        : { holder: seller, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
      kind: ENTRY_KINDS.RELATED_PARTY_GIFT,
      refs: giftRefs
    });
  }

  return economy.getLedger().postMany(entries);
}

module.exports = {
  recordOpeningBalance,
  recordOpeningStock,
  recordGoodsTrade,
  recordLoanDraw,
  recordLoanPayment,
  recordConstructionSpend,
  recordAssetTransfer
};

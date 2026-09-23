const { quarterForTick, quarterTickRange } = require('./clock');
const {
  ACCOUNTS,
  ASSET_ACCOUNTS,
  LIABILITY_ACCOUNTS,
  holderKey,
  corporationHolder
} = require('./accounts');

/**
 * Quarterly financial statements derived from the ledger.
 *
 * This is the point of the ledger. A corporation's reported figures are not
 * fields someone set, they are a summary of what actually happened, so they can
 * be checked against the journal and cannot be made to say something the
 * transactions do not support.
 *
 * Statements matter to the exchange for a specific reason: between reports a
 * share price moves on expectation, and at the report it snaps toward fact.
 * That gap is the game of investing, and it only exists because the books close
 * on a fixed cycle rather than being continuously visible.
 *
 * Every figure here is historical cost. Appraisal, which values a company on
 * expected cash flows and must never see a share price, comes separately.
 */

/**
 * Get a holder's balance on an account as of a tick.
 *
 * The ledger's own `balance()` is the live position. A balance sheet needs the
 * position at a period end, which is the net movement from the beginning of
 * time up to that tick.
 * @param {Object} ledger - The economy ledger.
 * @param {Object|string} holder - Holder reference or key.
 * @param {string} account - Account name.
 * @param {number} tick - Inclusive upper bound.
 * @returns {number} Balance as of that tick.
 * @example
 * balanceAsOf(ledger, holder, ACCOUNTS.CASH, 2159);
 */
function balanceAsOf(ledger, holder, account, tick) {
  return ledger.periodMovement(holder, account, 0, tick);
}

/**
 * Build an income statement for a holder over a tick range.
 *
 * Gross profit is revenue less the cost of the goods actually sold, which is
 * why inventory is carried at weighted-average cost: without a basis, every
 * sale would look like pure profit and margin would be meaningless.
 * @param {Object} ledger - The economy ledger.
 * @param {Object|string} holder - Holder reference or key.
 * @param {number} fromTick - Inclusive lower bound.
 * @param {number} toTick - Inclusive upper bound.
 * @returns {Object} Income statement figures.
 * @example
 * buildIncomeStatement(ledger, holder, 0, 2159);
 */
function buildIncomeStatement(ledger, holder, fromTick, toTick) {
  const movement = (account) => ledger.periodMovement(holder, account, fromTick, toTick);

  const revenue = movement(ACCOUNTS.REVENUE);
  const cogs = movement(ACCOUNTS.COGS);
  const operatingExpense = movement(ACCOUNTS.OPERATING_EXPENSE);
  const interestExpense = movement(ACCOUNTS.INTEREST_EXPENSE);
  const grossProfit = revenue - cogs;

  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpense,
    interestExpense,
    netIncome: grossProfit - operatingExpense - interestExpense
  };
}

/**
 * Build a balance sheet for a holder as of a tick.
 * @param {Object} ledger - The economy ledger.
 * @param {Object|string} holder - Holder reference or key.
 * @param {number} tick - Inclusive upper bound.
 * @returns {Object} Balance sheet figures.
 * @example
 * buildBalanceSheet(ledger, holder, 2159);
 */
function buildBalanceSheet(ledger, holder, tick) {
  const assets = {};
  let totalAssets = 0;
  ASSET_ACCOUNTS.forEach(account => {
    const value = balanceAsOf(ledger, holder, account, tick);
    assets[account] = value;
    totalAssets += value;
  });

  const liabilities = {};
  let totalLiabilities = 0;
  LIABILITY_ACCOUNTS.forEach(account => {
    const value = balanceAsOf(ledger, holder, account, tick);
    liabilities[account] = value;
    totalLiabilities += value;
  });

  return {
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities
  };
}

/**
 * Build a complete statement for one corporation for one quarter.
 * @param {Object} params - Statement parameters.
 * @param {Object} params.ledger - The economy ledger.
 * @param {Object} params.corporation - Corporation to report on.
 * @param {number} params.quarterIndex - Zero-based quarter index.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.closedAtTick - Tick the books were closed.
 * @returns {Object} A published statement.
 * @example
 * buildStatement({ ledger, corporation, quarterIndex: 0, settings, closedAtTick: 2160 });
 */
function buildStatement({ ledger, corporation, quarterIndex, settings, closedAtTick }) {
  const { fromTick, toTick } = quarterTickRange(quarterIndex, settings);
  const holder = corporationHolder(corporation);

  return {
    holder: holderKey(holder),
    corporationName: corporation.name,
    quarterIndex,
    fromTick,
    toTick,
    closedAtTick,
    income: buildIncomeStatement(ledger, holder, fromTick, toTick),
    balance: buildBalanceSheet(ledger, holder, toTick),
    sharesIssued: Number(corporation.sharesIssued) || 0,
    isBankrupt: Boolean(corporation.isBankrupt)
  };
}

/**
 * Store of published statements, one series per corporation.
 *
 * Only closed quarters are kept. A quarter in progress is deliberately not
 * published: the whole point is that the market cannot see inside the current
 * period and has to form an expectation instead.
 */
class StatementStore {
  /**
   * Create an empty store.
   * @example
   * const statements = new StatementStore();
   */
  constructor() {
    /** @type {Map<string, Array<Object>>} holder key -> statements, oldest first. */
    this.byHolder = new Map();
    /** Highest quarter index closed so far, or -1 when none. */
    this.lastClosedQuarter = -1;
  }

  /**
   * Record a published statement.
   * @param {Object} statement - Statement from buildStatement().
   * @returns {Object} The recorded statement.
   * @example
   * store.publish(statement);
   */
  publish(statement) {
    if (!this.byHolder.has(statement.holder)) {
      this.byHolder.set(statement.holder, []);
    }
    this.byHolder.get(statement.holder).push(statement);
    return statement;
  }

  /**
   * Get every published statement for a holder, oldest first.
   * @param {Object|string} holder - Holder reference or key.
   * @returns {Array<Object>} Published statements.
   * @example
   * store.forHolder(corporationHolder(corp));
   */
  forHolder(holder) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    return [...(this.byHolder.get(key) || [])];
  }

  /**
   * Get the most recently published statement for a holder.
   * @param {Object|string} holder - Holder reference or key.
   * @returns {Object|null} The latest statement, or null when none published.
   * @example
   * store.latestForHolder(corporationHolder(corp));
   */
  latestForHolder(holder) {
    const statements = this.forHolder(holder);
    return statements.length > 0 ? statements[statements.length - 1] : null;
  }

  /**
   * Serialize the store for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = store.toJSON();
   */
  toJSON() {
    return {
      lastClosedQuarter: this.lastClosedQuarter,
      // Sorted for stable output so saves diff cleanly
      holders: [...this.byHolder.keys()].sort().map(key => ({
        holder: key,
        statements: this.byHolder.get(key)
      }))
    };
  }

  /**
   * Rebuild a store from saved data.
   * @param {Object} [data] - Serialized store, or undefined for a fresh one.
   * @returns {StatementStore} Restored store.
   * @example
   * const store = StatementStore.fromJSON(saveData.economy.statements);
   */
  static fromJSON(data) {
    const store = new StatementStore();

    if (Array.isArray(data?.holders)) {
      data.holders.forEach(({ holder, statements }) => {
        if (holder && Array.isArray(statements)) {
          store.byHolder.set(holder, statements);
        }
      });
    }

    const savedQuarter = Number(data?.lastClosedQuarter);
    store.lastClosedQuarter = Number.isFinite(savedQuarter) ? savedQuarter : -1;

    return store;
  }
}

/**
 * Close any quarters that have fully elapsed and publish their statements.
 *
 * A quarter is closed only once its final tick is in the past, so the figures
 * cover a complete period and never change afterwards. Closing is driven from a
 * stored index rather than a tick comparison, so a long jump that spans a
 * boundary still publishes, and a save taken mid-quarter resumes without
 * republishing what it already has.
 * @param {Object} params - Close parameters.
 * @param {Object} params.economy - EconomyState holding the ledger and store.
 * @param {Array<Object>} params.corporations - Corporations to report on.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Array<Object>} Statements published by this call.
 * @example
 * closeElapsedQuarters({ economy, corporations, settings, tick: 2160 });
 */
function closeElapsedQuarters({ economy, corporations, settings, tick }) {
  const store = economy.getStatements();
  const ledger = economy.getLedger();
  const published = [];

  const currentQuarter = quarterForTick(tick, settings);

  // Everything before the quarter in progress is complete and can be closed.
  for (let quarter = store.lastClosedQuarter + 1; quarter < currentQuarter; quarter += 1) {
    corporations.forEach(corporation => {
      if (!corporation?.name) {
        return;
      }
      published.push(store.publish(buildStatement({
        ledger,
        corporation,
        quarterIndex: quarter,
        settings,
        closedAtTick: tick
      })));
    });
    store.lastClosedQuarter = quarter;
  }

  if (published.length > 0) {
    compressOldJournal({ economy, settings, store });
  }

  return published;
}

/**
 * Compress journal detail older than the retained reporting window.
 *
 * A busy economy posts tens of thousands of entries per quarter and the journal
 * is append-only, so the save file grows without bound and is written
 * synchronously. Once a quarter's statement is published, the entries behind it
 * have no further reader: published figures are never recalculated.
 *
 * A window of recent quarters is kept in full so recent activity can still be
 * inspected transaction by transaction, and because the current quarter's
 * statement has not been built yet.
 * @param {Object} params - Compression parameters.
 * @param {Object} params.economy - EconomyState holding the ledger.
 * @param {Object} params.settings - Resolved game settings.
 * @param {Object} params.store - The statement store, for the last closed quarter.
 * @returns {Object} `{ removed, added }` entry counts.
 * @example
 * compressOldJournal({ economy, settings, store });
 */
function compressOldJournal({ economy, settings, store }) {
  const retained = Number(settings.statements?.detail_quarters_retained);
  const keepQuarters = Number.isFinite(retained) && retained >= 0 ? retained : 2;

  const oldestRetainedQuarter = (store.lastClosedQuarter - keepQuarters) + 1;
  if (oldestRetainedQuarter <= 0) {
    return { removed: 0, added: 0 };
  }

  const { fromTick } = quarterTickRange(oldestRetainedQuarter, settings);
  return economy.getLedger().rollupThrough(fromTick - 1);
}

module.exports = {
  balanceAsOf,
  buildIncomeStatement,
  buildBalanceSheet,
  buildStatement,
  StatementStore,
  closeElapsedQuarters,
  compressOldJournal
};

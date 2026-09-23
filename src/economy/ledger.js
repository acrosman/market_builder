const {
  ACCOUNTS,
  isKnownAccount,
  increasesOnDebit,
  holderKey,
  parseHolderKey
} = require('./accounts');

/**
 * Every kind of entry the journal can hold.
 *
 * Recorded on each posting so a period can be summarized by activity and
 * related-party transactions can be found later.
 */
const ENTRY_KINDS = Object.freeze([
  'goods_purchase',
  'goods_sale',
  'cost_of_sale',
  'loan_draw',
  'loan_repayment',
  'interest_accrual',
  'construction_spend',
  'production_output',
  'dividend',
  'share_issue',
  'share_trade',
  'property_transfer',
  'related_party_gift',
  'period_close'
]);

/**
 * Double-entry journal for the whole economy.
 *
 * Everything that moves credits or goods posts here, and every posting names
 * both sides. That is what makes two properties assertable rather than hoped
 * for: money is conserved (no subsystem can mint credits, because a credit to
 * one holder is always a debit to another), and a company's reported figures
 * can be derived from its transaction history rather than trusted.
 *
 * Amounts are integers. Every caller rounds before posting. Fractional credits
 * would accumulate float residue across millions of tick postings, and the
 * existing `makeLoanPayment` already shows the failure mode: it deletes loans
 * on an exact `=== 0` comparison.
 *
 * Balances are maintained incrementally as entries are posted rather than
 * recomputed by scanning the journal, so a balance query stays constant-time
 * as history grows.
 */
class Ledger {
  /**
   * Create an empty ledger.
   * @example
   * const ledger = new Ledger();
   */
  constructor() {
    /** @type {Array<Object>} Append-only journal of posted entries. */
    this.entries = [];
    /** @type {Map<string, Map<string, number>>} holderKey -> account -> signed balance. */
    this.balances = new Map();
    /** Monotonic entry id. */
    this.nextEntryId = 1;
    /**
     * Running total of credits injected from outside the simulation.
     *
     * Tracked as a number rather than derived by scanning for injection-shaped
     * entries, because rollup replaces old entries with balance-preserving ones
     * that do not keep that shape. Deriving it would make the money supply
     * appear to shrink every time history was compressed.
     */
    this.additionalCapital = 0;
  }

  /**
   * Validate and normalize one entry without recording it.
   * @param {Object} entry - Candidate entry.
   * @returns {Object} Normalized entry ready to record.
   * @throws {TypeError} When the entry is malformed.
   * @example
   * const normalized = ledger.normalizeEntry({ tick: 1, amount: 100, ... });
   */
  normalizeEntry(entry) {
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError('entry must be an object');
    }

    const amount = Number(entry.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TypeError(
        `entry amount must be a positive integer, received ${entry.amount}`
      );
    }

    const tick = Number(entry.tick);
    if (!Number.isInteger(tick) || tick < 0) {
      throw new TypeError(`entry tick must be a non-negative integer, received ${entry.tick}`);
    }

    if (!entry.debit || !entry.credit) {
      throw new TypeError('entry must have both a debit and a credit leg');
    }
    if (!isKnownAccount(entry.debit.account)) {
      throw new TypeError(`unknown debit account: ${entry.debit.account}`);
    }
    if (!isKnownAccount(entry.credit.account)) {
      throw new TypeError(`unknown credit account: ${entry.credit.account}`);
    }

    const debitHolder = holderKey(entry.debit.holder);
    const creditHolder = holderKey(entry.credit.holder);

    if (debitHolder === creditHolder && entry.debit.account === entry.credit.account) {
      throw new TypeError('entry legs must differ in holder or account');
    }

    return {
      id: 0, // assigned at record time
      tick,
      amount,
      kind: entry.kind || 'unspecified',
      debit: { holder: debitHolder, account: entry.debit.account },
      credit: { holder: creditHolder, account: entry.credit.account },
      refs: entry.refs ? { ...entry.refs } : {}
    };
  }

  /**
   * Apply a normalized entry to the running balances.
   * @param {Object} entry - Normalized entry.
   * @returns {void}
   */
  applyToBalances(entry) {
    this.adjustBalance(entry.debit.holder, entry.debit.account, entry.amount, true);
    this.adjustBalance(entry.credit.holder, entry.credit.account, entry.amount, false);
  }

  /**
   * Whether an entry brought new credits into the simulation.
   *
   * Cash debited against the same holder's contributed capital is the only
   * shape that creates money; everything else moves it sideways.
   * @param {Object} entry - A normalized entry.
   * @returns {boolean} True when it injected credits.
   * @example
   * ledger.isInjection(entry);
   */
  isInjection(entry) {
    return entry.debit.account === ACCOUNTS.CASH
      && entry.credit.account === ACCOUNTS.CONTRIBUTED_CAPITAL
      && entry.debit.holder === entry.credit.holder;
  }

  /**
   * Adjust one holder/account balance by a signed amount.
   * @param {string} key - Holder key.
   * @param {string} account - Account name.
   * @param {number} amount - Positive magnitude.
   * @param {boolean} isDebit - True for the debit leg.
   * @returns {void}
   */
  adjustBalance(key, account, amount, isDebit) {
    if (!this.balances.has(key)) {
      this.balances.set(key, new Map());
    }
    const holderBalances = this.balances.get(key);
    // Store every account in its natural direction so callers reading a balance
    // get a positive number for a positive position, whatever the account type.
    const signedAmount = increasesOnDebit(account) === isDebit ? amount : -amount;
    holderBalances.set(account, (holderBalances.get(account) || 0) + signedAmount);
  }

  /**
   * Record a single balanced two-leg entry.
   * @param {Object} entry - Entry to post.
   * @param {number} entry.tick - Game tick the entry occurred on.
   * @param {number} entry.amount - Positive integer credits.
   * @param {Object} entry.debit - `{ holder, account }` receiving the debit.
   * @param {Object} entry.credit - `{ holder, account }` receiving the credit.
   * @param {string} [entry.kind] - One of ENTRY_KINDS.
   * @param {Object} [entry.refs] - Free-form references such as `{ stellarObjectId }`.
   * @returns {Object} The recorded entry, including its assigned id.
   * @throws {TypeError} When the entry is malformed.
   * @example
   * ledger.post({
   *   tick: 12,
   *   amount: 1200,
   *   debit:  { holder: corpHolder, account: ACCOUNTS.INVENTORY },
   *   credit: { holder: corpHolder, account: ACCOUNTS.CASH },
   *   kind: 'goods_purchase',
   *   refs: { goodName: 'metal', quantity: 100 }
   * });
   */
  post(entry) {
    const normalized = this.normalizeEntry(entry);
    normalized.id = this.nextEntryId;
    this.nextEntryId += 1;

    this.entries.push(normalized);
    this.applyToBalances(normalized);
    if (this.isInjection(normalized)) {
      this.additionalCapital += normalized.amount;
    }

    return normalized;
  }

  /**
   * Bring new credits into the game.
   *
   * This is the only way money is created. Cash is debited to a holder and
   * credited to that same holder's contributed capital, so the entry balances
   * like any other and the running total of capital put in stays exact. Every
   * other posting moves credits sideways between holders and leaves the money
   * supply alone, which is what lets `audit()` check the supply against this
   * total and report when something has started creating or destroying money.
   *
   * Opening balances, market endowments and the investing public's savings all
   * come through here. **Nothing else should post a CASH / CONTRIBUTED_CAPITAL
   * pair by hand.**
   * @param {Object} params - Capital parameters.
   * @param {number} params.tick - Game tick.
   * @param {Object} params.holder - Who receives the capital.
   * @param {number} params.amount - Credits to create, must be positive.
   * @param {string} params.reason - Why, recorded for diagnostics.
   * @returns {Object|null} The posted entry, or null when the amount is not positive.
   * @example
   * ledger.addCapital({ tick: 0, holder, amount: 250000, reason: 'opening_balance' });
   */
  addCapital({ tick, holder, amount, reason }) {
    const value = Math.round(Number(amount) || 0);
    if (value <= 0) {
      return null;
    }

    return this.post({
      tick,
      amount: value,
      debit: { holder, account: ACCOUNTS.CASH },
      credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
      kind: 'share_issue',
      refs: { reason }
    });
  }

  /**
   * Record several entries atomically.
   *
   * A goods sale is three entries (proceeds, cost of sale, and the buyer's
   * side); a loan draw is two. None of those may half-commit, so every entry is
   * validated before any is recorded.
   * @param {Array<Object>} entries - Entries to post together.
   * @returns {Array<Object>} The recorded entries.
   * @throws {TypeError} When any entry is malformed; nothing is recorded.
   * @example
   * ledger.postMany([proceedsEntry, costEntry, buyerEntry]);
   */
  postMany(entries) {
    if (!Array.isArray(entries)) {
      throw new TypeError('postMany requires an array of entries');
    }

    // Validate every entry first so a bad one cannot leave a partial transaction.
    const normalized = entries.map(entry => this.normalizeEntry(entry));

    return normalized.map(entry => {
      entry.id = this.nextEntryId;
      this.nextEntryId += 1;
      this.entries.push(entry);
      this.applyToBalances(entry);
      if (this.isInjection(entry)) {
        this.additionalCapital += entry.amount;
      }
      return entry;
    });
  }

  /**
   * Get one holder's balance on one account.
   * @param {Object|string} holder - Holder object or holder key.
   * @param {string} account - Account name.
   * @returns {number} Signed balance, positive for a positive position.
   * @example
   * ledger.balance(corporationHolder(corp), ACCOUNTS.CASH); // => 8400
   */
  balance(holder, account) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    return this.balances.get(key)?.get(account) || 0;
  }

  /**
   * Get all non-zero balances for one holder.
   * @param {Object|string} holder - Holder object or holder key.
   * @returns {Object} Map of account name to balance.
   * @example
   * ledger.holderBalances(corporationHolder(corp)); // => { cash: 8400, debt: 50000 }
   */
  holderBalances(holder) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    const balances = {};
    this.balances.get(key)?.forEach((value, account) => {
      if (value !== 0) {
        balances[account] = value;
      }
    });
    return balances;
  }

  /**
   * Sum one account across every holder.
   *
   * Summing CASH this way is the money-conservation check: it must not change
   * except through defined exogenous flows.
   * @param {string} account - Account name.
   * @returns {number} Total across all holders.
   * @example
   * ledger.totalAcrossHolders(ACCOUNTS.CASH);
   */
  totalAcrossHolders(account) {
    let total = 0;
    this.balances.forEach(holderBalances => {
      total += holderBalances.get(account) || 0;
    });
    return total;
  }

  /**
   * List every holder key that has any recorded activity.
   * @returns {Array<Object>} Holders as `{ kind, id }`, in first-posting order.
   * @example
   * ledger.listHolders();
   */
  listHolders() {
    return [...this.balances.keys()].map(key => parseHolderKey(key));
  }

  /**
   * Get entries within a tick range, optionally filtered by holder.
   *
   * Used to build period statements: the income statement for a quarter is a
   * summary of the entries whose tick falls inside it.
   * @param {Object} [options={}] - Query options.
   * @param {number} [options.fromTick=0] - Inclusive lower bound.
   * @param {number} [options.toTick=Infinity] - Inclusive upper bound.
   * @param {Object|string} [options.holder] - Restrict to entries touching this holder.
   * @param {string} [options.kind] - Restrict to one entry kind.
   * @returns {Array<Object>} Matching entries in posting order.
   * @example
   * const quarter = ledger.query({ fromTick: 0, toTick: 2159, holder: corpHolder });
   */
  query(options = {}) {
    const fromTick = options.fromTick ?? 0;
    const toTick = options.toTick ?? Infinity;
    const key = options.holder
      ? (typeof options.holder === 'string' ? options.holder : holderKey(options.holder))
      : null;

    return this.entries.filter(entry => {
      if (entry.tick < fromTick || entry.tick > toTick) {
        return false;
      }
      if (options.kind && entry.kind !== options.kind) {
        return false;
      }
      if (key && entry.debit.holder !== key && entry.credit.holder !== key) {
        return false;
      }
      return true;
    });
  }

  /**
   * Sum the net movement on one holder's account within a tick range.
   *
   * Positive means the account grew in its natural direction over the period,
   * so revenue over a quarter is a positive number.
   * @param {Object|string} holder - Holder object or key.
   * @param {string} account - Account name.
   * @param {number} [fromTick=0] - Inclusive lower bound.
   * @param {number} [toTick=Infinity] - Inclusive upper bound.
   * @returns {number} Net movement over the period.
   * @example
   * ledger.periodMovement(corpHolder, ACCOUNTS.REVENUE, 0, 2159);
   */
  periodMovement(holder, account, fromTick = 0, toTick = Infinity) {
    const key = typeof holder === 'string' ? holder : holderKey(holder);
    let total = 0;

    this.entries.forEach(entry => {
      if (entry.tick < fromTick || entry.tick > toTick) {
        return;
      }
      if (entry.debit.holder === key && entry.debit.account === account) {
        total += increasesOnDebit(account) ? entry.amount : -entry.amount;
      }
      if (entry.credit.holder === key && entry.credit.account === account) {
        total += increasesOnDebit(account) ? -entry.amount : entry.amount;
      }
    });

    return total;
  }

  /**
   * Verify that the journal is internally consistent.
   *
   * Three things have to hold at once. Every entry contributes an equal debit
   * and credit, so total debits must equal total credits. The balances kept
   * incrementally must match a full replay of the journal. And total cash must
   * equal the capital put in, because cash only ever enters through
   * `addCapital()` and every other posting moves it sideways between holders --
   * if that stops holding, something has learned to create or destroy credits.
   * @returns {Object} `{ balanced, totalDebits, totalCredits, balancesMatch,
   *   cashMatches, totalCash, additionalCapital }`.
   * @example
   * expect(ledger.audit().balanced).toBe(true);
   */
  audit() {
    let totalDebits = 0;
    let totalCredits = 0;

    const replay = new Map();
    const replayAdjust = (key, account, amount, isDebit) => {
      if (!replay.has(key)) {
        replay.set(key, new Map());
      }
      const accounts = replay.get(key);
      const signedAmount = increasesOnDebit(account) === isDebit ? amount : -amount;
      accounts.set(account, (accounts.get(account) || 0) + signedAmount);
    };

    this.entries.forEach(entry => {
      totalDebits += entry.amount;
      totalCredits += entry.amount;
      replayAdjust(entry.debit.holder, entry.debit.account, entry.amount, true);
      replayAdjust(entry.credit.holder, entry.credit.account, entry.amount, false);
    });

    let balancesMatch = true;
    replay.forEach((accounts, key) => {
      accounts.forEach((value, account) => {
        if (this.balance(key, account) !== value) {
          balancesMatch = false;
        }
      });
    });

    const totalCash = this.totalAcrossHolders(ACCOUNTS.CASH);

    return {
      balanced: totalDebits === totalCredits,
      totalDebits,
      totalCredits,
      balancesMatch,
      cashMatches: totalCash === this.additionalCapital,
      totalCash,
      additionalCapital: this.additionalCapital
    };
  }

  /**
   * Capital added, broken down by the reason recorded on it.
   *
   * The second thing to read when `audit()` reports `cashMatches: false`: it
   * names which inflow grew, which is usually enough to identify the subsystem
   * responsible. Scanned from the journal, so it covers only history that has
   * not yet been compressed.
   * @returns {Object} Map of reason to total credits added.
   * @example
   * ledger.capitalByReason(); // => { opening_balance: 3250000, investor_savings: 480000 }
   */
  capitalByReason() {
    const totals = {};

    this.entries.forEach(entry => {
      if (!this.isInjection(entry)) {
        return;
      }
      const reason = entry.refs?.reason || 'opening_balance';
      totals[reason] = (totals[reason] || 0) + entry.amount;
    });

    return totals;
  }

  /**
   * Cash held by each holder, largest first.
   *
   * The thing to read first when `audit()` reports `cashMatches: false`: it
   * names the holder whose balance moved unexpectedly without having to read
   * the journal by hand.
   * @returns {Array<Object>} `{ holder, cash }` rows, omitting empty holders.
   * @example
   * ledger.cashByHolder(); // => [{ holder: 'corporation:Acme', cash: 8400 }]
   */
  cashByHolder() {
    return this.listHolders()
      .map(holder => ({ holder, cash: this.balance(holder, ACCOUNTS.CASH) }))
      .filter(row => row.cash !== 0)
      .sort((a, b) => (b.cash - a.cash)
        || holderKey(a.holder).localeCompare(holderKey(b.holder)));
  }

  /**
   * Compress history older than a tick into a small set of opening balances.
   *
   * The journal is append-only, and a busy economy posts tens of thousands of
   * entries per quarter. Left alone the save file grows without bound and is
   * written synchronously, so it eventually stalls the UI. Detail older than
   * the reporting window has no reader: statements for those quarters are
   * already published and never recalculated.
   *
   * The replacement entries reproduce every holder's balance on every account
   * exactly, so `audit()` still reconciles and money conservation still holds.
   * Required debits and credits are paired off greedily and split where the
   * amounts do not match; the totals are guaranteed equal because the journal
   * they replace was itself balanced.
   * @param {number} tick - Entries at or before this tick are compressed.
   * @returns {Object} `{ removed, added }` entry counts.
   * @example
   * ledger.rollupThrough(2159);
   */
  rollupThrough(tick) {
    const cutoff = Number(tick);
    if (!Number.isFinite(cutoff)) {
      return { removed: 0, added: 0 };
    }

    const older = this.entries.filter(entry => entry.tick <= cutoff);
    if (older.length === 0) {
      return { removed: 0, added: 0 };
    }

    // Balances produced by the entries being replaced, per holder and account.
    const opening = new Map();
    const adjust = (key, account, amount, isDebit) => {
      const mapKey = `${key}\u0000${account}`;
      const signedAmount = increasesOnDebit(account) === isDebit ? amount : -amount;
      opening.set(mapKey, (opening.get(mapKey) || 0) + signedAmount);
    };

    older.forEach(entry => {
      adjust(entry.debit.holder, entry.debit.account, entry.amount, true);
      adjust(entry.credit.holder, entry.credit.account, entry.amount, false);
    });

    // Split each surviving balance into the leg needed to recreate it.
    const debits = [];
    const credits = [];
    [...opening.entries()].sort().forEach(([mapKey, balance]) => {
      if (balance === 0) {
        return;
      }
      const [holder, account] = mapKey.split('\u0000');
      const wantsDebit = increasesOnDebit(account) === (balance > 0);
      const leg = { holder, account, amount: Math.abs(balance) };
      (wantsDebit ? debits : credits).push(leg);
    });

    const rolled = [];
    let debitIndex = 0;
    let creditIndex = 0;

    while (debitIndex < debits.length && creditIndex < credits.length) {
      const debit = debits[debitIndex];
      const credit = credits[creditIndex];
      const amount = Math.min(debit.amount, credit.amount);

      if (amount > 0) {
        rolled.push({
          id: 0,
          tick: cutoff,
          amount,
          kind: 'period_close',
          debit: { holder: debit.holder, account: debit.account },
          credit: { holder: credit.holder, account: credit.account },
          refs: { rollup: true }
        });
      }

      debit.amount -= amount;
      credit.amount -= amount;
      if (debit.amount === 0) {
        debitIndex += 1;
      }
      if (credit.amount === 0) {
        creditIndex += 1;
      }
    }

    const newer = this.entries.filter(entry => entry.tick > cutoff);

    // additionalCapital is deliberately not recomputed here. The replacement
    // entries preserve balances but not entry shapes, so counting them would
    // make the money supply appear to change whenever history is compressed.
    this.entries = [];
    this.balances = new Map();
    rolled.forEach(entry => {
      entry.id = this.nextEntryId;
      this.nextEntryId += 1;
      this.entries.push(entry);
      this.applyToBalances(entry);
    });
    newer.forEach(entry => {
      this.entries.push(entry);
      this.applyToBalances(entry);
    });

    return { removed: older.length, added: rolled.length };
  }

  /**
   * Serialize the ledger for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = ledger.toJSON();
   */
  toJSON() {
    return {
      nextEntryId: this.nextEntryId,
      additionalCapital: this.additionalCapital,
      entries: this.entries
    };
  }

  /**
   * Rebuild a ledger from saved data.
   *
   * Balances are replayed from the journal rather than stored, so they can
   * never disagree with history.
   * @param {Object} [data] - Serialized ledger, or undefined for a fresh one.
   * @returns {Ledger} Restored ledger.
   * @example
   * const ledger = Ledger.fromJSON(saveData.economy.ledger);
   */
  static fromJSON(data) {
    const ledger = new Ledger();

    if (Array.isArray(data?.entries)) {
      data.entries.forEach(entry => {
        ledger.entries.push(entry);
        ledger.applyToBalances(entry);
      });
    }

    // Restored rather than recounted, for the same reason rollup does not
    // recount it: compressed history no longer carries the original shapes.
    const savedInjected = Number(data?.additionalCapital);
    ledger.additionalCapital = Number.isFinite(savedInjected)
      ? savedInjected
      : ledger.entries.reduce(
        (total, entry) => (ledger.isInjection(entry) ? total + entry.amount : total),
        0
      );

    const savedNextId = Number(data?.nextEntryId);
    const maxEntryId = ledger.entries.reduce(
      (maxId, entry) => Math.max(maxId, Number(entry.id) || 0),
      0
    );
    ledger.nextEntryId = Number.isFinite(savedNextId) && savedNextId > maxEntryId
      ? savedNextId
      : maxEntryId + 1;

    return ledger;
  }
}

module.exports = {
  Ledger,
  ENTRY_KINDS,
  ACCOUNTS
};

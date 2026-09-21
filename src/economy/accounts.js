/**
 * Chart of accounts and holder identity for the economy ledger.
 *
 * Kept in its own module because the ledger, production, statements, appraisal,
 * and exchange subsystems all need these constants. Importing them from the
 * ledger would create cycles once the ledger needs appraisal for related-party
 * postings.
 */

/**
 * Account kinds. Every ledger leg names one of these.
 *
 * The set is deliberately small. It is enough to produce an income statement
 * with a real gross margin and a balance sheet that nets debt, which is what
 * valuation needs, without becoming a general accounting system.
 */
const ACCOUNTS = {
  /** Spendable credits. The conserved quantity: summed across all holders it is invariant. */
  CASH: 'cash',
  /** Goods held, carried at weighted-average purchase cost. */
  INVENTORY: 'inventory',
  /** Stellar objects and other fixed assets, carried at acquisition cost. */
  PROPERTY: 'property',
  /** Shares held in other companies. */
  INVESTMENTS: 'investments',
  /** Loans extended to others. The bank's side of a loan draw. */
  LOAN_RECEIVABLE: 'loan_receivable',

  /** Loan principal outstanding, including capitalized interest. */
  DEBT: 'debt',

  /** Proceeds from issuing shares. */
  SHARE_CAPITAL: 'share_capital',
  /**
   * Value received for nothing. Related-party transfers above or below appraised
   * value post the difference here so self-dealing cannot manufacture income.
   */
  CONTRIBUTED_CAPITAL: 'contributed_capital',
  /** Accumulated net income from closed periods. */
  RETAINED_EARNINGS: 'retained_earnings',

  /** Sales proceeds. */
  REVENUE: 'revenue',
  /** Cost of goods sold, at weighted-average cost. */
  COGS: 'cogs',
  /** Interest charged on debt. */
  INTEREST_EXPENSE: 'interest_expense',
  /** Everything else that reduces income in the period it occurs. */
  OPERATING_EXPENSE: 'operating_expense'
};

/** Broad classification, which determines how a balance is derived from legs. */
const ACCOUNT_TYPES = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  INCOME: 'income',
  EXPENSE: 'expense'
};

/** Maps each account to its type. */
const ACCOUNT_TYPE_BY_ACCOUNT = {
  [ACCOUNTS.CASH]: ACCOUNT_TYPES.ASSET,
  [ACCOUNTS.INVENTORY]: ACCOUNT_TYPES.ASSET,
  [ACCOUNTS.PROPERTY]: ACCOUNT_TYPES.ASSET,
  [ACCOUNTS.INVESTMENTS]: ACCOUNT_TYPES.ASSET,
  [ACCOUNTS.LOAN_RECEIVABLE]: ACCOUNT_TYPES.ASSET,

  [ACCOUNTS.DEBT]: ACCOUNT_TYPES.LIABILITY,

  [ACCOUNTS.SHARE_CAPITAL]: ACCOUNT_TYPES.EQUITY,
  [ACCOUNTS.CONTRIBUTED_CAPITAL]: ACCOUNT_TYPES.EQUITY,
  [ACCOUNTS.RETAINED_EARNINGS]: ACCOUNT_TYPES.EQUITY,

  [ACCOUNTS.REVENUE]: ACCOUNT_TYPES.INCOME,

  [ACCOUNTS.COGS]: ACCOUNT_TYPES.EXPENSE,
  [ACCOUNTS.INTEREST_EXPENSE]: ACCOUNT_TYPES.EXPENSE,
  [ACCOUNTS.OPERATING_EXPENSE]: ACCOUNT_TYPES.EXPENSE
};

/** Holder kinds. A holder is any entity that can own a balance. */
const HOLDER_KINDS = {
  PLAYER: 'player',
  CORPORATION: 'corporation',
  /** The interstellar bank. Real counterparty, so loans are transfers not minting. */
  BANK: 'bank',
  /** The aggregate investing public, with finite capital. */
  INVESTOR_POOL: 'investor_pool'
};

/** The singleton bank holder. */
const BANK_HOLDER = { kind: HOLDER_KINDS.BANK, id: 'interstellar_bank' };

/** The singleton investor pool holder. */
const INVESTOR_POOL_HOLDER = { kind: HOLDER_KINDS.INVESTOR_POOL, id: 'public' };

/**
 * Check that an account name is one of the known accounts.
 * @param {string} account - Account name to check.
 * @returns {boolean} True when the account is recognized.
 * @example
 * isKnownAccount(ACCOUNTS.CASH); // => true
 */
function isKnownAccount(account) {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_TYPE_BY_ACCOUNT, account);
}

/**
 * Get the broad type of an account.
 * @param {string} account - Account name.
 * @returns {string|null} One of ACCOUNT_TYPES, or null when unknown.
 * @example
 * accountType(ACCOUNTS.REVENUE); // => 'income'
 */
function accountType(account) {
  return ACCOUNT_TYPE_BY_ACCOUNT[account] || null;
}

/**
 * Whether an account's balance increases on the debit side.
 * Assets and expenses do; liabilities, equity, and income do not.
 * @param {string} account - Account name.
 * @returns {boolean} True when debits increase this account.
 * @example
 * increasesOnDebit(ACCOUNTS.CASH);    // => true
 * increasesOnDebit(ACCOUNTS.REVENUE); // => false
 */
function increasesOnDebit(account) {
  const type = accountType(account);
  return type === ACCOUNT_TYPES.ASSET || type === ACCOUNT_TYPES.EXPENSE;
}

/**
 * Build a stable string key for a holder, used to index balances.
 * @param {Object} holder - Holder as `{ kind, id }`.
 * @returns {string} Stable key such as 'corporation:Acme Orbital'.
 * @throws {TypeError} When the holder is malformed.
 * @example
 * holderKey({ kind: 'corporation', id: 'Acme Orbital' }); // => 'corporation:Acme Orbital'
 */
function holderKey(holder) {
  if (holder === null || typeof holder !== 'object') {
    throw new TypeError('holder must be an object with kind and id');
  }
  const { kind, id } = holder;
  if (!kind || id === undefined || id === null || id === '') {
    throw new TypeError('holder must have a non-empty kind and id');
  }
  return `${kind}:${id}`;
}

/**
 * Parse a holder key back into a holder object.
 * @param {string} key - Key produced by holderKey().
 * @returns {Object} Holder as `{ kind, id }`.
 * @example
 * parseHolderKey('corporation:Acme Orbital'); // => { kind: 'corporation', id: 'Acme Orbital' }
 */
function parseHolderKey(key) {
  const separatorIndex = String(key).indexOf(':');
  if (separatorIndex === -1) {
    return { kind: '', id: String(key) };
  }
  return {
    kind: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + 1)
  };
}

/**
 * Build a corporation holder reference.
 * @param {Object|string} corporation - Corporation instance or its name.
 * @returns {Object} Holder as `{ kind: 'corporation', id }`.
 * @example
 * corporationHolder(playerCorp);
 */
function corporationHolder(corporation) {
  const id = typeof corporation === 'string' ? corporation : corporation?.name;
  return { kind: HOLDER_KINDS.CORPORATION, id };
}

/**
 * Build a player holder reference.
 * @param {Object|string} player - Player instance or its name.
 * @returns {Object} Holder as `{ kind: 'player', id }`.
 * @example
 * playerHolder(game.getPlayer());
 */
function playerHolder(player) {
  const id = typeof player === 'string' ? player : player?.name;
  return { kind: HOLDER_KINDS.PLAYER, id };
}

module.exports = {
  ACCOUNTS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_BY_ACCOUNT,
  HOLDER_KINDS,
  BANK_HOLDER,
  INVESTOR_POOL_HOLDER,
  isKnownAccount,
  accountType,
  increasesOnDebit,
  holderKey,
  parseHolderKey,
  corporationHolder,
  playerHolder
};

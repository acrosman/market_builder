const { ticksPerDay } = require('./clock');
const { ACCOUNTS, corporationHolder } = require('./accounts');

/**
 * Solvency enforcement for corporations.
 *
 * Corporations could previously run an unlimited cash deficit. Wages, energy,
 * and restock purchases all draw on cash, so a corporation with production and
 * no sales simply went further and further negative with nothing to stop it.
 * That is credits borrowed from nowhere, which breaks the same rule the ledger
 * exists to enforce everywhere else.
 *
 * A deficit is now a dated obligation. A corporation that goes cash-negative
 * has a grace window to trade its way back to positive. If the window closes
 * while it is still short, it is forced to borrow enough to cover the gap,
 * which is what a real business with a credit line would do.
 *
 * That borrowing is what eventually kills it. Each forced loan adds debt, the
 * debt accrues interest, and the interest deepens the deficit. When net worth
 * reaches zero the corporation is insolvent and is declared bankrupt. The
 * death spiral is the mechanic, not a bug in it.
 *
 * What happens to a bankrupt corporation's worlds, goods, shares and debts is
 * deliberately out of scope here and tracked separately.
 */

/** Asset accounts that count toward net worth. */
const ASSET_ACCOUNTS = [
  ACCOUNTS.CASH,
  ACCOUNTS.INVENTORY,
  ACCOUNTS.PROPERTY,
  ACCOUNTS.INVESTMENTS,
  ACCOUNTS.LOAN_RECEIVABLE
];

/** Liability accounts that count against net worth. */
const LIABILITY_ACCOUNTS = [ACCOUNTS.DEBT];

/** Defaults for the solvency settings block. */
const DEFAULT_SOLVENCY = {
  deficit_grace_days: 30,
  forced_loan_buffer: 0.1
};

/**
 * Read solvency configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Solvency configuration.
 * @example
 * const config = solvencyConfig(game.getSettings());
 */
function solvencyConfig(settings = {}) {
  const configured = settings.solvency || {};
  const read = (key) => {
    const value = Number(configured[key]);
    return Number.isFinite(value) ? value : DEFAULT_SOLVENCY[key];
  };
  return {
    deficitGraceDays: read('deficit_grace_days'),
    forcedLoanBuffer: read('forced_loan_buffer')
  };
}

/**
 * Compute a holder's book net worth from the ledger.
 *
 * Read from the journal rather than from `Corporation.calculateTotalValue`,
 * which adds cash but never subtracts debt and so reports a borrowing
 * corporation as richer by exactly the amount it owes.
 *
 * This is book value, not appraised value: assets are carried at what they
 * cost. A cash-flow-based appraisal comes later, and deliberately cannot see
 * share price.
 * @param {Object} ledger - The economy ledger.
 * @param {Object} holder - Holder reference.
 * @returns {Object} `{ assets, liabilities, netWorth }`.
 * @example
 * const { netWorth } = bookNetWorth(economy.getLedger(), corporationHolder(corp));
 */
function bookNetWorth(ledger, holder) {
  const assets = ASSET_ACCOUNTS.reduce(
    (sum, account) => sum + ledger.balance(holder, account),
    0
  );
  const liabilities = LIABILITY_ACCOUNTS.reduce(
    (sum, account) => sum + ledger.balance(holder, account),
    0
  );
  return { assets, liabilities, netWorth: assets - liabilities };
}

/**
 * Assess one corporation's solvency without changing anything.
 * @param {Object} params - Assessment parameters.
 * @param {Object} params.economy - EconomyState holding the ledger.
 * @param {Object} params.corporation - Corporation to assess.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} Assessment with cash, net worth, and deficit state.
 * @example
 * const assessment = assessSolvency({ economy, corporation, settings, tick });
 */
function assessSolvency({ economy, corporation, settings, tick }) {
  const holder = corporationHolder(corporation);
  const ledger = economy.getLedger();
  const cash = ledger.balance(holder, ACCOUNTS.CASH);
  const { assets, liabilities, netWorth } = bookNetWorth(ledger, holder);

  const config = solvencyConfig(settings);
  const graceTicks = config.deficitGraceDays * ticksPerDay(settings);
  const deficitSince = corporation.deficitSinceTick;
  const inDeficit = cash < 0;

  const deficitAge = inDeficit && Number.isFinite(deficitSince)
    ? tick - deficitSince
    : 0;

  return {
    holder,
    cash,
    assets,
    liabilities,
    netWorth,
    inDeficit,
    deficitAge,
    graceTicks,
    graceExpired: inDeficit && deficitAge >= graceTicks,
    insolvent: netWorth <= 0
  };
}

/**
 * Enforce solvency for one corporation, borrowing or declaring bankruptcy.
 *
 * Insolvency is checked before the grace window, because a corporation whose
 * net worth has already gone gives no reason to lend it more.
 * @param {Object} params - Enforcement parameters.
 * @param {Object} params.economy - EconomyState holding the ledger.
 * @param {Object} params.game - Game, used to draw a loan through its ledger path.
 * @param {Object} params.corporation - Corporation to enforce against.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} `{ action, assessment, loan }` where action is
 *   'none', 'deficit_opened', 'deficit_cleared', 'forced_loan' or 'bankrupt'.
 * @example
 * const result = enforceSolvency({ economy, game, corporation, tick });
 */
function enforceSolvency({ economy, game, corporation, tick }) {
  const settings = game.getSettings();
  const assessment = assessSolvency({ economy, corporation, settings, tick });

  if (corporation.isBankrupt) {
    return { action: 'none', assessment, loan: null };
  }

  // A corporation with nothing left is bankrupt whether or not it is currently
  // short of cash, so this is checked before the grace window.
  if (assessment.insolvent && (assessment.inDeficit || assessment.liabilities > 0)) {
    corporation.isBankrupt = true;
    corporation.bankruptSinceTick = tick;
    game.getEventBus().emit('corporation-bankrupt', {
      tick,
      corporationName: corporation.name,
      netWorth: assessment.netWorth,
      liabilities: assessment.liabilities
    });
    return { action: 'bankrupt', assessment, loan: null };
  }

  if (!assessment.inDeficit) {
    if (Number.isFinite(corporation.deficitSinceTick)) {
      corporation.deficitSinceTick = null;
      return { action: 'deficit_cleared', assessment, loan: null };
    }
    return { action: 'none', assessment, loan: null };
  }

  if (!Number.isFinite(corporation.deficitSinceTick)) {
    // Start the clock. The corporation has until the window closes to trade
    // its way back to positive before it is made to borrow.
    corporation.deficitSinceTick = tick;
    return { action: 'deficit_opened', assessment, loan: null };
  }

  if (!assessment.graceExpired) {
    return { action: 'none', assessment, loan: null };
  }

  const config = solvencyConfig(settings);
  const principal = Math.ceil(Math.abs(assessment.cash) * (1 + config.forcedLoanBuffer));
  const loan = game.takeCorporationLoan(corporation.name, principal);

  if (!loan) {
    corporation.isBankrupt = true;
    corporation.bankruptSinceTick = tick;
    game.getEventBus().emit('corporation-bankrupt', {
      tick,
      corporationName: corporation.name,
      netWorth: assessment.netWorth,
      liabilities: assessment.liabilities
    });
    return { action: 'bankrupt', assessment, loan: null };
  }

  corporation.deficitSinceTick = null;
  game.getEventBus().emit('corporation-forced-loan', {
    tick,
    corporationName: corporation.name,
    principal,
    loanId: loan.id
  });

  return { action: 'forced_loan', assessment, loan };
}

module.exports = {
  ASSET_ACCOUNTS,
  LIABILITY_ACCOUNTS,
  DEFAULT_SOLVENCY,
  solvencyConfig,
  bookNetWorth,
  assessSolvency,
  enforceSolvency
};

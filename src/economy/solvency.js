const { ticksPerDay } = require('./clock');
const { ACCOUNTS, corporationHolder } = require('./accounts');
const { NEWS_KINDS, SEVERITY, corporationOriginSystem } = require('./news');
const { numericReader } = require('../settings');

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

/**
 * Read solvency configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Solvency configuration.
 * @example
 * const config = solvencyConfig(game.getSettings());
 */
function solvencyConfig(settings = {}) {
  const read = numericReader(settings, 'solvency');
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
 * Record a solvency event in the news.
 * @param {Object} params - Report parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.corporation - The corporation concerned.
 * @param {number} params.tick - Current tick.
 * @param {string} params.kind - One of NEWS_KINDS.
 * @param {string} params.severity - One of SEVERITY.
 * @param {Object} params.tokens - Values for the message.
 * @returns {void}
 * @example
 * reportSolvency({ game, corporation, tick, kind, severity, tokens });
 */
function reportSolvency({ game, corporation, tick, kind, severity, tokens }) {
  game.getEconomy().getNews().record({
    tick,
    kind,
    severity,
    tokens,
    originSystemId: corporationOriginSystem(game, corporation)
  });
}

/**
 * Warn when a balloon maturity is close enough to matter.
 *
 * A balloon is dangerous precisely because the date is known in advance, so the
 * warning is the mechanic rather than a courtesy: it is what lets anyone
 * watching price the risk before it lands, and what turns a collapse into
 * something that could be seen coming.
 * @param {Object} params - Warning parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.corporation - The corporation to check.
 * @param {number} params.tick - Current tick.
 * @param {Object} params.assessment - Its current solvency assessment.
 * @returns {boolean} True when a warning was issued.
 * @example
 * warnOnApproachingMaturity({ game, corporation, tick, assessment });
 */
function warnOnApproachingMaturity({ game, corporation, tick, assessment }) {
  const settings = game.getSettings();
  const horizon = ticksPerDay(settings) * 30;

  const due = typeof corporation.getMaturedLoans === 'function'
    ? corporation.loans.filter(
      loan => loan.maturityTick > 0
        && loan.remainingBalance > 0
        && loan.maturityTick - tick > 0
        && loan.maturityTick - tick <= horizon
    )
    : [];

  if (due.length === 0) {
    return false;
  }

  // Only worth saying when the corporation cannot obviously meet it
  const principal = due.reduce((sum, loan) => sum + loan.remainingBalance, 0);
  if (assessment.cash >= principal) {
    return false;
  }

  // One warning per loan, not one per day, or the news would be nothing else
  const alreadyWarned = due.every(loan => loan.maturityWarned);
  if (alreadyWarned) {
    return false;
  }

  due.forEach(loan => { loan.maturityWarned = true; });

  reportSolvency({
    game,
    corporation,
    tick,
    kind: 'maturity_approaching',
    severity: 'critical',
    tokens: {
      companyName: corporation.name,
      principal: Math.round(principal),
      shortfall: Math.round(principal - Math.max(0, assessment.cash)),
      ticksRemaining: Math.min(...due.map(loan => loan.maturityTick - tick))
    }
  });

  return true;
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
    declareBankrupt({ game, corporation, tick, assessment });
    return { action: 'bankrupt', assessment, loan: null };
  }

  warnOnApproachingMaturity({ game, corporation, tick, assessment });

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
    declareBankrupt({ game, corporation, tick, assessment });
    return { action: 'bankrupt', assessment, loan: null };
  }

  corporation.deficitSinceTick = null;
  game.getEventBus().emit('corporation-forced-loan', {
    tick,
    corporationName: corporation.name,
    principal,
    loanId: loan.id
  });
  reportSolvency({
    game,
    corporation,
    tick,
    kind: 'forced_loan',
    severity: 'notable',
    tokens: { companyName: corporation.name, principal }
  });

  return { action: 'forced_loan', assessment, loan };
}

/**
 * Mark a corporation bankrupt and announce it.
 * @param {Object} params - Declaration parameters.
 * @param {Object} params.game - The game.
 * @param {Object} params.corporation - The failing corporation.
 * @param {number} params.tick - Current tick.
 * @param {Object} params.assessment - Its final solvency assessment.
 * @returns {void}
 * @example
 * declareBankrupt({ game, corporation, tick, assessment });
 */
function declareBankrupt({ game, corporation, tick, assessment }) {
  corporation.isBankrupt = true;
  corporation.bankruptSinceTick = tick;

  game.getEventBus().emit('corporation-bankrupt', {
    tick,
    corporationName: corporation.name,
    netWorth: assessment.netWorth,
    liabilities: assessment.liabilities
  });

  reportSolvency({
    game,
    corporation,
    tick,
    kind: 'bankruptcy',
    severity: 'critical',
    tokens: {
      companyName: corporation.name,
      netWorth: Math.round(assessment.netWorth),
      liabilities: Math.round(assessment.liabilities)
    }
  });
}

module.exports = {
  ASSET_ACCOUNTS,
  warnOnApproachingMaturity,
  declareBankrupt,
  LIABILITY_ACCOUNTS,
  solvencyConfig,
  bookNetWorth,
  assessSolvency,
  enforceSolvency
};

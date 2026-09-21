const { ticksPerYear, ticksPerDay } = require('./clock');
const { runProduction, consumeFood } = require('./production');
const { restockMarket } = require('./restock');
const { enforceSolvency } = require('./solvency');
const { closeElapsedQuarters } = require('./statements');
const { payQuarterlyDividends } = require('./dividends');
const { runInvestorPool } = require('../agents/investorPool');
const { runCorporateAI, corporateCycleTicks } = require('../agents/corporateAI');
const { ENTRY_KINDS } = require('./ledger');
const { ACCOUNTS, BANK_HOLDER, corporationHolder } = require('./accounts');

/**
 * Drives the per-tick economy from the game's tick events.
 *
 * Registered as an EventBus subscriber alongside the stellar objects, so it
 * implements `onTick`. Like those subscriptions it is behaviour rather than
 * state: it is not persisted and is re-created after a load.
 *
 * This is the single entry point for everything that happens to the economy as
 * time passes. Interest accrual lives here now; production and period close
 * will hang off the same tick.
 */
class EconomyTicker {
  /**
   * Create a ticker bound to a game session.
   * @param {Object} game - The Game whose economy this drives.
   * @example
   * const ticker = new EconomyTicker(game);
   * game.getEventBus().subscribe('tick', ticker);
   */
  constructor(game) {
    this.game = game;
  }

  /**
   * Handle one tick event.
   * @param {Object} data - Event data as `{ ticks, delta, action }`.
   * @param {number} [data.delta=1] - Ticks elapsed in this event.
   * @returns {void}
   * @example
   * ticker.onTick({ ticks: 42, delta: 1, action: 'jump' });
   */
  onTick(data) {
    const elapsed = data?.delta ?? 1;
    const tick = data?.ticks ?? 0;

    this.accrueInterest(elapsed, tick);
    this.runDailyCycles(tick);
  }

  /**
   * Accrue and post interest on every corporation's outstanding loans.
   *
   * Interest per tick is a fraction of a credit -- a 100,000 credit loan at 4%
   * accrues about 0.46 credits per game-hour -- but the ledger only accepts
   * integers. Rounding each tick's interest would floor almost all of it to
   * zero and the debt would never grow.
   *
   * So interest accrues at full precision on the loan, and the ledger is posted
   * the integer difference between total accrued and total already posted. The
   * books lag reality by under one credit and nothing is lost to rounding.
   * @param {number} elapsedTicks - Ticks elapsed in this event.
   * @param {number} tick - Current absolute game tick.
   * @returns {void}
   * @example
   * ticker.accrueInterest(1, 42);
   */
  accrueInterest(elapsedTicks, tick) {
    const game = this.game;
    const economy = game.getEconomy();
    const perYear = ticksPerYear(game.getSettings());

    game.getCorporations().forEach(corporation => {
      if (typeof corporation.accrueLoanInterest !== 'function') {
        return;
      }

      corporation.accrueLoanInterest(perYear, elapsedTicks);

      const holder = corporationHolder(corporation);
      if (!holder.id) {
        return;
      }

      corporation.loans.forEach(loan => {
        const accrued = Number(loan.accruedInterest) || 0;
        const posted = Number(loan.postedInterest) || 0;
        const toPost = Math.floor(accrued) - posted;

        if (toPost <= 0) {
          return;
        }

        // Interest capitalizes into the balance rather than being billed, so no
        // cash moves and total cash stays invariant. The borrower recognizes an
        // expense against a larger debt; the bank recognizes income against a
        // larger receivable.
        economy.getLedger().postMany([
          {
            tick,
            amount: toPost,
            debit: { holder, account: ACCOUNTS.INTEREST_EXPENSE },
            credit: { holder, account: ACCOUNTS.DEBT },
            kind: ENTRY_KINDS.INTEREST_ACCRUAL,
            refs: { loanId: loan.id }
          },
          {
            tick,
            amount: toPost,
            debit: { holder: BANK_HOLDER, account: ACCOUNTS.LOAN_RECEIVABLE },
            credit: { holder: BANK_HOLDER, account: ACCOUNTS.REVENUE },
            kind: ENTRY_KINDS.INTEREST_ACCRUAL,
            refs: { loanId: loan.id }
          }
        ]);

        loan.postedInterest = posted + toPost;
      });
    });
  }

  /**
   * Run production and consumption for any whole days that have elapsed.
   *
   * Daily rather than hourly because a building's hourly output is a fraction
   * of a unit and goods are integers, so rounding every tick would floor almost
   * all production to zero.
   *
   * Elapsed days are computed from a persisted marker rather than by testing
   * the current tick against a modulus. That way a batch of ticks cannot skip
   * a boundary, and a save taken mid-day resumes without losing or repeating a
   * cycle.
   * @param {number} tick - Current absolute game tick.
   * @returns {number} Days processed.
   * @example
   * ticker.runDailyCycles(48);
   */
  runDailyCycles(tick) {
    const game = this.game;
    const settings = game.getSettings();
    const economy = game.getEconomy();
    const perDay = ticksPerDay(settings);

    const elapsedDays = Math.floor((tick - economy.lastProductionTick) / perDay);
    if (elapsedDays <= 0) {
      return 0;
    }

    economy.lastProductionTick += elapsedDays * perDay;

    const corporations = game.getCorporations();
    game.getUniverse().stellarObjects.forEach(stellarObject => {
      if (!stellarObject.marketState) {
        return;
      }

      const params = {
        economy,
        stellarObject,
        corporations,
        settings,
        days: elapsedDays,
        tick
      };

      // Order matters: produce, then feed the population, then let the wider
      // galaxy make up whatever the world could not supply itself.
      runProduction(params);
      consumeFood({ ...params, market: game.getMarket() });
      restockMarket({ ...params, market: game.getMarket() });
    });

    this.settleCorporations(tick);
    this.runAgents(tick, elapsedDays);
    // The exchange clears on the market cycle, after the agents have placed
    // their orders, after solvency so a distressed company's state is current,
    // and before the books close so a quarter's closing balance sheet reflects
    // the day's trading.
    this.clearExchange(tick);
    this.closeBooks(tick);

    return elapsedDays;
  }

  /**
   * Bring corporation cash into line with the ledger, then enforce solvency.
   *
   * The ledger is where wages, restock purchases and interest actually land,
   * so it is the truth about a corporation's cash. `cashReserves` is projected
   * from it rather than maintained in parallel, because the two had already
   * drifted: a corporation could be a quarter of a million credits overdrawn on
   * the books while reporting a balance of zero.
   * @param {number} tick - Current absolute game tick.
   * @returns {void}
   * @example
   * ticker.settleCorporations(720);
   */
  settleCorporations(tick) {
    const game = this.game;
    const economy = game.getEconomy();
    const ledger = economy.getLedger();

    game.getCorporations().forEach(corporation => {
      if (typeof corporation.setCashPosition !== 'function') {
        return;
      }

      const holder = corporationHolder(corporation);
      if (!holder.id) {
        return;
      }

      corporation.setCashPosition(ledger.balance(holder, ACCOUNTS.CASH));
      enforceSolvency({ economy, game, corporation, tick });
    });
  }

  /**
   * Run the corporate and investor agents.
   *
   * Corporations decide on a slower cadence than the market clears: deciding
   * every day would build out every world almost at once and the differences
   * between companies would collapse before anyone could price them.
   * @param {number} tick - Current absolute game tick.
   * @param {number} elapsedDays - Whole days elapsed.
   * @returns {void}
   * @example
   * ticker.runAgents(168, 1);
   */
  runAgents(tick, elapsedDays) {
    const game = this.game;

    runInvestorPool({ game, days: elapsedDays, tick });

    const cycle = corporateCycleTicks(game.getSettings());
    if (cycle > 0 && Math.floor(tick / cycle) > Math.floor((tick - elapsedDays * 24) / cycle)) {
      runCorporateAI({ game, tick }).forEach(build => {
        game.getEventBus().emit('corporation-built', { tick, ...build });
      });
    }
  }

  /**
   * Run the day's share auctions.
   * @param {number} tick - Current absolute game tick.
   * @returns {Array<Object>} Listings that traded.
   * @example
   * ticker.clearExchange(24);
   */
  clearExchange(tick) {
    const game = this.game;
    const economy = game.getEconomy();
    const cleared = economy.getExchange().clearAll({ economy, tick });

    cleared.forEach(result => {
      game.getEventBus().emit('exchange-cleared', {
        tick,
        corporationName: result.corporationName,
        price: result.clearingPrice,
        volume: result.volume
      });
    });

    return cleared;
  }

  /**
   * Publish statements for any quarter that has fully elapsed.
   *
   * Runs after solvency settlement so a quarter's closing balance sheet
   * reflects any forced borrowing that happened in it.
   * @param {number} tick - Current absolute game tick.
   * @returns {Array<Object>} Statements published by this call.
   * @example
   * ticker.closeBooks(2160);
   */
  closeBooks(tick) {
    const game = this.game;
    const published = closeElapsedQuarters({
      economy: game.getEconomy(),
      corporations: game.getCorporations(),
      settings: game.getSettings(),
      tick
    });

    // Paid from the published figures, so a dividend is a share of a quarter's
    // earnings rather than a draw on whatever cash happens to be lying about.
    const dividends = payQuarterlyDividends({ game, statements: published, tick });
    dividends.forEach(dividend => {
      game.getEventBus().emit('dividend-paid', { tick, ...dividend });
    });

    published.forEach(statement => {
      game.getEventBus().emit('statement-published', {
        tick,
        corporationName: statement.corporationName,
        quarterIndex: statement.quarterIndex,
        netIncome: statement.income.netIncome
      });
    });

    return published;
  }
}

module.exports = {
  EconomyTicker
};

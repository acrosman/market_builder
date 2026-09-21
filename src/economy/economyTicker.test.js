const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { ACCOUNTS, BANK_HOLDER, corporationHolder } = require('./accounts');
const { ticksPerYear, ticksPerQuarter } = require('./clock');
const { checkConservation } = require('./conservation');
const { recordOpeningBalance } = require('./transactions');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

/**
 * Fund a corporation in the ledger so it never falls into deficit.
 *
 * Owning a world costs cash: its market restocks, and its production pays
 * wages. Tests that isolate interest accrual need the corporation solvent, or
 * solvency enforcement forces extra loans and the debt under test is no longer
 * the only debt.
 * @param {Object} game - The game holding the corporation.
 * @param {string} name - Corporation name.
 * @param {number} [amount=50000000] - Cash to grant.
 * @returns {void}
 */
function fundCorporation(game, name, amount = 50000000) {
  recordOpeningBalance(game.getEconomy(), {
    tick: game.getTicks(),
    holder: corporationHolder(game.findCorporation(name)),
    amount
  });
}

/**
 * Build a started game on a small real universe.
 * @returns {Object} An initialized Game.
 */
function startedGame() {
  const game = new Game(createUniverse(5, 7, 10), settings, { seed: 'ticker' });
  game.initializeGame({
    name: 'Borrower',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Interest test player',
    corporation: { name: 'Debt Co', description: 'A leveraged corporation' }
  });
  return game;
}

describe('EconomyTicker interest accrual', () => {
  describe('balloon loan structure', () => {
    test('should give a loan an origin and maturity tick', () => {
      const game = startedGame();
      game.advanceTicks(100, 'test');

      const loan = game.takeCorporationLoan('Debt Co', 50000);

      expect(loan.originTick).toBe(100);
      expect(loan.maturityTick).toBe(100 + (ticksPerQuarter(settings) * 4));
      expect(loan.accruedInterest).toBe(0);
    });

    test('should report a loan as matured once its tick passes', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const loan = game.takeCorporationLoan('Debt Co', 10000);

      expect(corporation.getMaturedLoans(loan.maturityTick - 1)).toHaveLength(0);
      expect(corporation.getMaturedLoans(loan.maturityTick)).toHaveLength(1);
    });

    test('should not report a repaid loan as matured', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      corporation.addCashReserve(100000);
      const loan = game.takeCorporationLoan('Debt Co', 10000);

      game.makeCorporationLoanPayment('Debt Co', loan.id, 10000);
      expect(corporation.getMaturedLoans(loan.maturityTick + 1)).toHaveLength(0);
    });
  });

  describe('accrual', () => {
    test('should grow the debt as ticks pass', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      game.takeCorporationLoan('Debt Co', 100000);

      const before = corporation.getOutstandingDebt();
      game.advanceTicks(500, 'jump');

      expect(corporation.getOutstandingDebt()).toBeGreaterThan(before);
    });

    test('should compound to the expected annual amount', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      fundCorporation(game, 'Debt Co');
      const loan = game.takeCorporationLoan('Debt Co', 100000);

      // A full game year of hourly accrual
      game.advanceTicks(ticksPerYear(settings), 'test');

      // Continuous compounding at the loan's fixed rate
      const expected = 100000 * Math.exp(loan.interestRate / 100);
      expect(corporation.getOutstandingDebt()).toBeCloseTo(expected, 0);
    });

    test('should not accrue on a corporation with no loans', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      fundCorporation(game, 'Debt Co');

      game.advanceTicks(1000, 'test');
      expect(corporation.getOutstandingDebt()).toBe(0);
    });

    test('should use the rate fixed at origination, not the current one', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;

      const cheap = game.takeCorporationLoan('Debt Co', 10000);
      expect(cheap.interestRate).toBe(4);

      // Borrowing heavily downgrades the corporation
      game.takeCorporationLoan('Debt Co', 400000);
      expect(corporation.getInterestRate()).toBeGreaterThan(4);

      // The first loan keeps its original rate
      expect(corporation.loans.find(l => l.id === cheap.id).interestRate).toBe(4);
    });
  });

  describe('ledger posting', () => {
    test('should post interest without moving cash', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      game.takeCorporationLoan('Debt Co', 500000);

      game.advanceTicks(2000, 'test');

      // Interest capitalizes into the balance rather than being billed, so it
      // moves no cash. Checked against the conservation invariant rather than a
      // raw total, because the investing public's savings are a defined inflow
      // and would otherwise read as a leak.
      expect(checkConservation(ledger)).toMatchObject({ holds: true });
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });

      // And interest specifically added nothing to the money supply
      expect(checkConservation(ledger).byReason.interest_accrual).toBeUndefined();
    });

    test('should recognize expense for the borrower and income for the bank', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const holder = corporationHolder(game.getPlayer().corporation);
      game.takeCorporationLoan('Debt Co', 500000);

      game.advanceTicks(2000, 'test');

      const expense = ledger.balance(holder, ACCOUNTS.INTEREST_EXPENSE);
      expect(expense).toBeGreaterThan(0);

      // The bank lends to every corporation, not just this one, so its income
      // is the total across all borrowers rather than this borrower's expense.
      const allExpense = game.getCorporations().reduce(
        (sum, corporation) => sum + ledger.balance(
          corporationHolder(corporation), ACCOUNTS.INTEREST_EXPENSE
        ),
        0
      );
      expect(ledger.balance(BANK_HOLDER, ACCOUNTS.REVENUE)).toBe(allExpense);
    });

    test('should keep posted interest within one credit of accrued', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const holder = corporationHolder(game.getPlayer().corporation);
      const loan = game.takeCorporationLoan('Debt Co', 500000);

      game.advanceTicks(3000, 'test');

      const posted = ledger.balance(holder, ACCOUNTS.INTEREST_EXPENSE);
      // Fractional interest accrues at full precision and is posted as whole
      // credits, so the books lag by under one credit and lose nothing
      expect(loan.accruedInterest - posted).toBeGreaterThanOrEqual(0);
      expect(loan.accruedInterest - posted).toBeLessThan(1);
    });

    test('should not post anything before a whole credit has accrued', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const holder = corporationHolder(game.getPlayer().corporation);

      // A small loan accrues well under a credit per tick
      game.takeCorporationLoan('Debt Co', 1000);
      game.advanceTicks(1, 'test');

      expect(ledger.balance(holder, ACCOUNTS.INTEREST_EXPENSE)).toBe(0);
    });

    test('should track debt growth in the ledger alongside the corporation', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const corporation = game.getPlayer().corporation;
      const holder = corporationHolder(corporation);
      game.takeCorporationLoan('Debt Co', 500000);

      game.advanceTicks(2500, 'test');

      // Ledger debt is the integer-posted view of the corporation's balance
      const ledgerDebt = ledger.balance(holder, ACCOUNTS.DEBT);
      expect(corporation.getOutstandingDebt() - ledgerDebt).toBeLessThan(1);
    });
  });

  describe('persistence', () => {
    test('should keep accruing at the same rate after a save and load', () => {
      const game = startedGame();
      game.takeCorporationLoan('Debt Co', 200000);
      game.advanceTicks(1000, 'test');

      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
      const loadedCorp = loaded.getPlayer().corporation;
      const debtAtLoad = loadedCorp.getOutstandingDebt();

      expect(debtAtLoad).toBeCloseTo(game.getPlayer().corporation.getOutstandingDebt(), 6);

      loaded.advanceTicks(1000, 'test');
      game.advanceTicks(1000, 'test');

      expect(loadedCorp.getOutstandingDebt())
        .toBeCloseTo(game.getPlayer().corporation.getOutstandingDebt(), 6);
    });

    test('should not double-post interest after a load', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const holder = corporationHolder(game.getPlayer().corporation);
      game.takeCorporationLoan('Debt Co', 500000);
      game.advanceTicks(2000, 'test');

      const postedBefore = ledger.balance(holder, ACCOUNTS.INTEREST_EXPENSE);
      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));

      // postedInterest survives on the loan, so the restored ledger agrees
      expect(loaded.getEconomy().getLedger().balance(holder, ACCOUNTS.INTEREST_EXPENSE))
        .toBe(postedBefore);
    });

    test('should preserve balloon maturity across a save and load', () => {
      const game = startedGame();
      const loan = game.takeCorporationLoan('Debt Co', 50000);

      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
      const restored = loaded.getPlayer().corporation.loans.find(l => l.id === loan.id);

      expect(restored.maturityTick).toBe(loan.maturityTick);
      expect(restored.originTick).toBe(loan.originTick);
    });
  });

  describe('defensive handling', () => {
    test('should skip corporations that cannot accrue', () => {
      const game = startedGame();
      // A plain object standing in for a corporation-shaped record
      game.addCorporation({ name: 'Plain Co', loans: [] });

      expect(() => game.advanceTicks(10, 'test')).not.toThrow();
    });

    test('should skip corporations with no usable name', () => {
      const game = startedGame();
      const nameless = game.getPlayer().corporation;
      game.takeCorporationLoan('Debt Co', 100000);
      nameless.name = '';

      expect(() => game.advanceTicks(50, 'test')).not.toThrow();
      // Interest still accrues on the corporation itself, it just is not posted
      expect(nameless.getOutstandingDebt()).toBeGreaterThan(100000);
    });
  });

  describe('accrueLoanInterest guards', () => {
    test('should ignore invalid calendars or elapsed ticks', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      game.takeCorporationLoan('Debt Co', 100000);
      const before = corporation.getOutstandingDebt();

      expect(corporation.accrueLoanInterest(0, 1)).toEqual([]);
      expect(corporation.accrueLoanInterest(NaN, 1)).toEqual([]);
      expect(corporation.accrueLoanInterest(8640, 0)).toEqual([]);
      expect(corporation.accrueLoanInterest(8640, -5)).toEqual([]);
      expect(corporation.getOutstandingDebt()).toBe(before);
    });

    test('should skip loans with a zero rate or balance', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const loan = game.takeCorporationLoan('Debt Co', 100000);

      loan.interestRate = 0;
      expect(corporation.accrueLoanInterest(8640, 1)).toEqual([]);

      loan.interestRate = 6;
      loan.remainingBalance = 0;
      expect(corporation.accrueLoanInterest(8640, 1)).toEqual([]);
    });

    test('should report what it accrued', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const loan = game.takeCorporationLoan('Debt Co', 100000);

      const accruals = corporation.accrueLoanInterest(8640, 1);
      expect(accruals).toHaveLength(1);
      expect(accruals[0].loanId).toBe(loan.id);
      expect(accruals[0].interest).toBeCloseTo(100000 * (4 / 100) / 8640, 8);
    });
  });
});

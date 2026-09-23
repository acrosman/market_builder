const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { Corporation } = require('../corporation');
const {
  solvencyConfig,
  bookNetWorth,
  assessSolvency,
  enforceSolvency
} = require('./solvency');
const { recordOpeningBalance, recordConstructionSpend } = require('../economy/transactions');
const { ACCOUNTS, corporationHolder, marketHolder } = require('../economy/accounts');
const { ticksPerDay } = require('../economy/clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

const GRACE_TICKS = solvencyConfig(settings).deficitGraceDays * ticksPerDay(settings);

/**
 * Build a started game on a small real universe.
 * @returns {Object} An initialized Game.
 */
function startedGame() {
  const game = new Game(createUniverse(5, 7, 10), settings, { seed: 'solvency' });
  game.initializeGame({
    name: 'Operator',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Solvency test player',
    corporation: { name: 'Main Co', description: 'The player corporation' }
  });
  return game;
}

/**
 * Add a corporation with a chosen cash position and no other assets.
 * @param {Object} game - Game to add to.
 * @param {string} name - Corporation name.
 * @param {number} cash - Opening cash, which may be zero.
 * @returns {Object} The corporation.
 */
function addCorporation(game, name, cash) {
  const corporation = new Corporation(name, 'test corporation', false, 0);
  game.addCorporation(corporation);
  if (cash > 0) {
    recordOpeningBalance(game.getEconomy(), {
      tick: game.getTicks(),
      holder: corporationHolder(corporation),
      amount: cash
    });
    corporation.setCashPosition(cash);
  }
  return corporation;
}

/**
 * Drive a corporation's ledger cash negative by spending to a third party.
 * @param {Object} game - Game holding the economy.
 * @param {Object} corporation - Corporation to overdraw.
 * @param {number} amount - Amount to spend.
 * @returns {void}
 */
function overdraw(game, corporation, amount) {
  recordConstructionSpend(game.getEconomy(), {
    tick: game.getTicks(),
    spender: corporationHolder(corporation),
    recipient: marketHolder(1),
    amount
  });
  corporation.setCashPosition(
    game.getEconomy().getLedger().balance(corporationHolder(corporation), ACCOUNTS.CASH)
  );
}

describe('solvencyConfig', () => {
  test('should read configured values', () => {
    expect(solvencyConfig(settings).deficitGraceDays).toBeGreaterThan(0);
  });

  test('should keep a configured zero', () => {
    expect(solvencyConfig({ solvency: { forced_loan_buffer: 0 } }).forcedLoanBuffer).toBe(0);
  });

  test('should fall back for missing or unusable values', () => {
    expect(solvencyConfig({}).deficitGraceDays).toBe(30);
    expect(solvencyConfig({ solvency: { deficit_grace_days: 'x' } }).deficitGraceDays).toBe(30);
  });
});

describe('bookNetWorth', () => {
  test('should subtract debt from assets', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Leveraged Co', 100000);
    game.takeCorporationLoan('Leveraged Co', 60000);

    const result = bookNetWorth(game.getEconomy().getLedger(), corporationHolder(corporation));

    // Cash rose by the loan but so did debt, so net worth is unchanged.
    // calculateTotalValue would have reported this as 60000 richer.
    expect(result.assets).toBe(160000);
    expect(result.liabilities).toBe(60000);
    expect(result.netWorth).toBe(100000);
  });

  test('should be zero for an untouched holder', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Empty Co', 0);
    expect(bookNetWorth(game.getEconomy().getLedger(), corporationHolder(corporation)))
      .toEqual({ assets: 0, liabilities: 0, netWorth: 0 });
  });
});

describe('assessSolvency', () => {
  test('should report a solvent corporation as not in deficit', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Solid Co', 50000);

    const assessment = assessSolvency({
      economy: game.getEconomy(), corporation, settings, tick: 0
    });

    expect(assessment.inDeficit).toBe(false);
    expect(assessment.insolvent).toBe(false);
    expect(assessment.cash).toBe(50000);
  });

  test('should report a deficit when ledger cash is negative', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 10000);
    overdraw(game, corporation, 25000);

    const assessment = assessSolvency({
      economy: game.getEconomy(), corporation, settings, tick: 0
    });

    expect(assessment.inDeficit).toBe(true);
    expect(assessment.cash).toBe(-15000);
  });

  test('should age a deficit from when it opened', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Aging Co', 0);
    overdraw(game, corporation, 5000);
    corporation.deficitSinceTick = 100;

    const assessment = assessSolvency({
      economy: game.getEconomy(), corporation, settings, tick: 100 + GRACE_TICKS
    });

    expect(assessment.deficitAge).toBe(GRACE_TICKS);
    expect(assessment.graceExpired).toBe(true);
  });

  test('should not expire the grace window early', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Young Co', 0);
    overdraw(game, corporation, 5000);
    corporation.deficitSinceTick = 100;

    const assessment = assessSolvency({
      economy: game.getEconomy(), corporation, settings, tick: 100 + GRACE_TICKS - 1
    });

    expect(assessment.graceExpired).toBe(false);
  });
});

describe('enforceSolvency', () => {
  test('should do nothing for a solvent corporation', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Solid Co', 50000);

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 0
    });

    expect(result.action).toBe('none');
    expect(corporation.deficitSinceTick).toBeNull();
  });

  test('should open the deficit clock on first going negative', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 1000);
    overdraw(game, corporation, 5000);

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 500
    });

    expect(result.action).toBe('deficit_opened');
    expect(corporation.deficitSinceTick).toBe(500);
  });

  test('should hold during the grace window without borrowing', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 1000);
    overdraw(game, corporation, 5000);
    corporation.deficitSinceTick = 0;

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: GRACE_TICKS - 1
    });

    expect(result.action).toBe('none');
    expect(corporation.loans).toHaveLength(0);
  });

  test('should clear the clock when the corporation recovers on its own', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Recovered Co', 50000);
    corporation.deficitSinceTick = 100;

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 200
    });

    expect(result.action).toBe('deficit_cleared');
    expect(corporation.deficitSinceTick).toBeNull();
    expect(corporation.loans).toHaveLength(0);
  });

  test('should force a loan covering the deficit when the window closes', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Forced Co', 100000);
    overdraw(game, corporation, 150000);
    corporation.deficitSinceTick = 0;

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: GRACE_TICKS
    });

    expect(result.action).toBe('forced_loan');
    expect(corporation.loans).toHaveLength(1);
    // Covers the 50000 gap plus the configured buffer
    expect(result.loan.principal).toBeGreaterThanOrEqual(50000);
    expect(corporation.deficitSinceTick).toBeNull();
  });

  test('should bring the cash position back above zero', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Forced Co', 100000);
    overdraw(game, corporation, 150000);
    corporation.deficitSinceTick = 0;

    enforceSolvency({ economy: game.getEconomy(), game, corporation, tick: GRACE_TICKS });

    const ledger = game.getEconomy().getLedger();
    expect(ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH)).toBeGreaterThan(0);
  });

  test('should emit an event when it forces a loan', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Forced Co', 100000);
    overdraw(game, corporation, 150000);
    corporation.deficitSinceTick = 0;

    const listener = jest.fn();
    game.getEventBus().on('corporation-forced-loan', listener);

    enforceSolvency({ economy: game.getEconomy(), game, corporation, tick: GRACE_TICKS });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ corporationName: 'Forced Co' })
    );
  });

  test('should declare bankruptcy when net worth is gone', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Doomed Co', 0);
    game.takeCorporationLoan('Doomed Co', 200000);
    // Spend the borrowed cash away, leaving only the debt
    overdraw(game, corporation, 200000);

    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 100
    });

    expect(result.action).toBe('bankrupt');
    expect(corporation.isBankrupt).toBe(true);
    expect(corporation.bankruptSinceTick).toBe(100);
  });

  test('should emit an event on bankruptcy', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Doomed Co', 0);
    game.takeCorporationLoan('Doomed Co', 200000);
    overdraw(game, corporation, 200000);

    const listener = jest.fn();
    game.getEventBus().on('corporation-bankrupt', listener);

    enforceSolvency({ economy: game.getEconomy(), game, corporation, tick: 100 });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ corporationName: 'Doomed Co' })
    );
  });

  test('should not act again on an already bankrupt corporation', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Doomed Co', 0);
    game.takeCorporationLoan('Doomed Co', 200000);
    overdraw(game, corporation, 200000);

    enforceSolvency({ economy: game.getEconomy(), game, corporation, tick: 100 });
    const loansAfterFirst = corporation.loans.length;

    const second = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 200
    });

    expect(second.action).toBe('none');
    expect(corporation.loans).toHaveLength(loansAfterFirst);
    expect(corporation.bankruptSinceTick).toBe(100);
  });

  test('should not bankrupt a corporation that simply has nothing', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Dormant Co', 0);

    // Zero net worth with no debt and no deficit is dormant, not insolvent
    const result = enforceSolvency({
      economy: game.getEconomy(), game, corporation, tick: 100
    });

    expect(result.action).toBe('none');
    expect(corporation.isBankrupt).toBe(false);
  });
});

describe('solvency through the tick loop', () => {
  test('should force a loan for a corporation that stays overdrawn', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Tick Co', 10000);
    overdraw(game, corporation, 40000);

    const listener = jest.fn();
    game.getEventBus().on('corporation-forced-loan', listener);

    game.advanceTicks(GRACE_TICKS + ticksPerDay(settings), 'test');

    expect(listener).toHaveBeenCalled();
    expect(corporation.loans.length).toBeGreaterThan(0);
    expect(corporation.getTotalCashReserves()).toBeGreaterThan(0);
  });

  test('should keep corporation cash in step with the ledger', () => {
    const game = startedGame();
    const corporation = game.getPlayer().corporation;

    game.advanceTicks(ticksPerDay(settings) * 40, 'test');

    const ledgerCash = game.getEconomy().getLedger()
      .balance(corporationHolder(corporation), ACCOUNTS.CASH);
    // cashReserves is a projection of the ledger, not a parallel tally
    expect(corporation.getTotalCashReserves()).toBe(ledgerCash);
  });

  test('should keep the journal balanced through forced borrowing', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Tick Co', 10000);
    overdraw(game, corporation, 40000);

    game.advanceTicks(GRACE_TICKS * 2, 'test');

    expect(game.getEconomy().getLedger().audit())
      .toMatchObject({ balanced: true, balancesMatch: true });
  });
});

describe('solvency persistence', () => {
  test('should restore bankruptcy across a save and load', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Doomed Co', 0);
    game.takeCorporationLoan('Doomed Co', 200000);
    overdraw(game, corporation, 200000);
    enforceSolvency({ economy: game.getEconomy(), game, corporation, tick: 100 });

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
    const restored = loaded.findCorporation('Doomed Co');

    // Without explicit restoration a bankrupt corporation would come back solvent
    expect(restored.isBankrupt).toBe(true);
    expect(restored.bankruptSinceTick).toBe(100);
  });

  test('should restore an open deficit clock', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 1000);
    overdraw(game, corporation, 5000);
    corporation.deficitSinceTick = 500;

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));

    // Otherwise the clock would restart on every load and never expire
    expect(loaded.findCorporation('Short Co').deficitSinceTick).toBe(500);
  });

  test('should restore a negative cash position', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 1000);
    overdraw(game, corporation, 5000);

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));

    // normalizeCashReserves floors negatives, which would erase the deficit
    expect(loaded.findCorporation('Short Co').getTotalCashReserves()).toBe(-4000);
  });

  test('should surface solvency state to the company management UI', () => {
    const game = startedGame();
    const corporation = addCorporation(game, 'Short Co', 1000);
    overdraw(game, corporation, 5000);
    corporation.deficitSinceTick = 500;

    const state = corporation.getCompanyManagementState(game.getUniverse());

    expect(state.isBankrupt).toBe(false);
    expect(state.deficitSinceTick).toBe(500);
  });
});

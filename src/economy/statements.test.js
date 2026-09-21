const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { Corporation } = require('../corporation');
const { EconomyState } = require('./economyState');
const {
  balanceAsOf,
  buildIncomeStatement,
  buildBalanceSheet,
  buildStatement,
  StatementStore,
  closeElapsedQuarters
} = require('./statements');
const { recordOpeningBalance } = require('./transactions');
const { ENTRY_KINDS } = require('./ledger');
const { ACCOUNTS, corporationHolder, holderKey } = require('./accounts');
const { ticksPerQuarter } = require('./clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const QUARTER = ticksPerQuarter(settings);
const ACME = corporationHolder('Acme Orbital');

/**
 * Build an economy with a simple trading history.
 * @returns {Object} An EconomyState.
 */
function economyWithHistory() {
  const economy = new EconomyState({ seed: 'statements' });
  const ledger = economy.getLedger();

  recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 100000 });

  // A sale in quarter zero
  ledger.postMany([
    {
      tick: 100,
      amount: 5000,
      debit: { holder: ACME, account: ACCOUNTS.CASH },
      credit: { holder: ACME, account: ACCOUNTS.REVENUE },
      kind: ENTRY_KINDS.GOODS_SALE
    },
    {
      tick: 100,
      amount: 3000,
      debit: { holder: ACME, account: ACCOUNTS.COGS },
      credit: { holder: ACME, account: ACCOUNTS.INVENTORY },
      kind: ENTRY_KINDS.COST_OF_SALE
    }
  ]);

  // And a sale in quarter one
  ledger.post({
    tick: QUARTER + 50,
    amount: 8000,
    debit: { holder: ACME, account: ACCOUNTS.CASH },
    credit: { holder: ACME, account: ACCOUNTS.REVENUE },
    kind: ENTRY_KINDS.GOODS_SALE
  });

  return economy;
}

describe('balanceAsOf', () => {
  test('should report the position at a tick, not the live position', () => {
    const economy = economyWithHistory();
    const ledger = economy.getLedger();

    expect(balanceAsOf(ledger, ACME, ACCOUNTS.CASH, 99)).toBe(100000);
    expect(balanceAsOf(ledger, ACME, ACCOUNTS.CASH, 100)).toBe(105000);
    expect(balanceAsOf(ledger, ACME, ACCOUNTS.CASH, QUARTER + 50)).toBe(113000);
  });

  test('should be zero before anything happened', () => {
    const economy = economyWithHistory();
    expect(balanceAsOf(economy.getLedger(), ACME, ACCOUNTS.CASH, -1)).toBe(0);
  });
});

describe('buildIncomeStatement', () => {
  test('should cover only the requested period', () => {
    const ledger = economyWithHistory().getLedger();

    const first = buildIncomeStatement(ledger, ACME, 0, QUARTER - 1);
    expect(first.revenue).toBe(5000);
    expect(first.cogs).toBe(3000);

    const second = buildIncomeStatement(ledger, ACME, QUARTER, (QUARTER * 2) - 1);
    expect(second.revenue).toBe(8000);
    expect(second.cogs).toBe(0);
  });

  test('should compute gross profit and net income', () => {
    const ledger = economyWithHistory().getLedger();
    const statement = buildIncomeStatement(ledger, ACME, 0, QUARTER - 1);

    expect(statement.grossProfit).toBe(2000);
    expect(statement.netIncome).toBe(2000);
  });

  test('should subtract operating and interest expense from net income', () => {
    const economy = economyWithHistory();
    const ledger = economy.getLedger();

    ledger.post({
      tick: 200,
      amount: 500,
      debit: { holder: ACME, account: ACCOUNTS.OPERATING_EXPENSE },
      credit: { holder: ACME, account: ACCOUNTS.CASH }
    });
    ledger.post({
      tick: 200,
      amount: 300,
      debit: { holder: ACME, account: ACCOUNTS.INTEREST_EXPENSE },
      credit: { holder: ACME, account: ACCOUNTS.DEBT }
    });

    const statement = buildIncomeStatement(ledger, ACME, 0, QUARTER - 1);
    expect(statement.operatingExpense).toBe(500);
    expect(statement.interestExpense).toBe(300);
    expect(statement.netIncome).toBe(2000 - 500 - 300);
  });

  test('should be all zeros for a holder with no activity', () => {
    const ledger = economyWithHistory().getLedger();
    const statement = buildIncomeStatement(ledger, corporationHolder('Nobody'), 0, QUARTER);

    expect(statement).toEqual({
      revenue: 0, cogs: 0, grossProfit: 0,
      operatingExpense: 0, interestExpense: 0, netIncome: 0
    });
  });
});

describe('buildBalanceSheet', () => {
  test('should total assets and subtract liabilities', () => {
    const economy = economyWithHistory();
    const ledger = economy.getLedger();

    ledger.postMany([
      {
        tick: 300,
        amount: 40000,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.DEBT },
        kind: ENTRY_KINDS.LOAN_DRAW
      }
    ]);

    const sheet = buildBalanceSheet(ledger, ACME, QUARTER - 1);

    expect(sheet.liabilities[ACCOUNTS.DEBT]).toBe(40000);
    expect(sheet.netWorth).toBe(sheet.totalAssets - sheet.totalLiabilities);
    // Borrowing raises cash and debt equally, so net worth is unmoved
    expect(sheet.netWorth).toBe(102000);
  });

  test('should reflect the period end, not the present', () => {
    const ledger = economyWithHistory().getLedger();

    const atFirstClose = buildBalanceSheet(ledger, ACME, QUARTER - 1);
    const atSecondClose = buildBalanceSheet(ledger, ACME, (QUARTER * 2) - 1);

    expect(atFirstClose.assets[ACCOUNTS.CASH]).toBe(105000);
    expect(atSecondClose.assets[ACCOUNTS.CASH]).toBe(113000);
  });
});

describe('buildStatement', () => {
  test('should carry the period, holder, and share count', () => {
    const economy = economyWithHistory();
    const corporation = new Corporation('Acme Orbital', 'desc', true, 0);
    corporation.issueShares(1000);

    const statement = buildStatement({
      ledger: economy.getLedger(),
      corporation,
      quarterIndex: 0,
      settings,
      closedAtTick: QUARTER
    });

    expect(statement.holder).toBe(holderKey(ACME));
    expect(statement.corporationName).toBe('Acme Orbital');
    expect(statement.quarterIndex).toBe(0);
    expect(statement.fromTick).toBe(0);
    expect(statement.toTick).toBe(QUARTER - 1);
    expect(statement.closedAtTick).toBe(QUARTER);
    expect(statement.sharesIssued).toBe(1000);
    expect(statement.isBankrupt).toBe(false);
  });

  test('should survive JSON serialization', () => {
    const economy = economyWithHistory();
    const corporation = new Corporation('Acme Orbital', 'desc', true, 0);
    const statement = buildStatement({
      ledger: economy.getLedger(), corporation, quarterIndex: 0, settings, closedAtTick: QUARTER
    });

    expect(() => JSON.parse(JSON.stringify(statement))).not.toThrow();
  });
});

describe('StatementStore', () => {
  /**
   * Build a statement stub for a holder and quarter.
   * @param {number} quarterIndex - Quarter index.
   * @returns {Object} A statement-shaped object.
   */
  function stub(quarterIndex) {
    return { holder: holderKey(ACME), corporationName: 'Acme Orbital', quarterIndex };
  }

  test('should return statements oldest first', () => {
    const store = new StatementStore();
    store.publish(stub(0));
    store.publish(stub(1));

    expect(store.forHolder(ACME).map(s => s.quarterIndex)).toEqual([0, 1]);
  });

  test('should return the latest statement', () => {
    const store = new StatementStore();
    store.publish(stub(0));
    store.publish(stub(1));

    expect(store.latestForHolder(ACME).quarterIndex).toBe(1);
  });

  test('should return empties for an unknown holder', () => {
    const store = new StatementStore();
    expect(store.forHolder(ACME)).toEqual([]);
    expect(store.latestForHolder(ACME)).toBeNull();
  });

  test('should not expose its internal array', () => {
    const store = new StatementStore();
    store.publish(stub(0));
    store.forHolder(ACME).push(stub(99));

    expect(store.forHolder(ACME)).toHaveLength(1);
  });

  test('should round trip through JSON', () => {
    const store = new StatementStore();
    store.publish(stub(0));
    store.publish(stub(1));
    store.lastClosedQuarter = 1;

    const restored = StatementStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));

    expect(restored.forHolder(ACME).map(s => s.quarterIndex)).toEqual([0, 1]);
    expect(restored.lastClosedQuarter).toBe(1);
  });

  test('should return a usable store from missing data', () => {
    const restored = StatementStore.fromJSON(undefined);
    expect(restored.lastClosedQuarter).toBe(-1);
    expect(restored.forHolder(ACME)).toEqual([]);
  });

  test('should emit holders in stable sorted order', () => {
    const store = new StatementStore();
    store.publish({ holder: 'corporation:Zeta', quarterIndex: 0 });
    store.publish({ holder: 'corporation:Alpha', quarterIndex: 0 });

    expect(store.toJSON().holders.map(h => h.holder))
      .toEqual(['corporation:Alpha', 'corporation:Zeta']);
  });
});

describe('closeElapsedQuarters', () => {
  /**
   * Build an economy and one corporation to report on.
   * @returns {Object} `{ economy, corporation }`.
   */
  function setup() {
    const economy = economyWithHistory();
    const corporation = new Corporation('Acme Orbital', 'desc', true, 0);
    return { economy, corporation };
  }

  test('should publish nothing during the first quarter', () => {
    const { economy, corporation } = setup();

    const published = closeElapsedQuarters({
      economy, corporations: [corporation], settings, tick: QUARTER - 1
    });

    // A quarter in progress stays unpublished so the market must form an
    // expectation rather than read the current period
    expect(published).toEqual([]);
    expect(economy.getStatements().lastClosedQuarter).toBe(-1);
  });

  test('should publish the first quarter once it has elapsed', () => {
    const { economy, corporation } = setup();

    const published = closeElapsedQuarters({
      economy, corporations: [corporation], settings, tick: QUARTER
    });

    expect(published).toHaveLength(1);
    expect(published[0].quarterIndex).toBe(0);
    expect(published[0].income.revenue).toBe(5000);
    expect(economy.getStatements().lastClosedQuarter).toBe(0);
  });

  test('should not republish a quarter already closed', () => {
    const { economy, corporation } = setup();
    closeElapsedQuarters({ economy, corporations: [corporation], settings, tick: QUARTER });

    const again = closeElapsedQuarters({
      economy, corporations: [corporation], settings, tick: QUARTER + 10
    });

    expect(again).toEqual([]);
    expect(economy.getStatements().forHolder(ACME)).toHaveLength(1);
  });

  test('should catch up several quarters spanned in one jump', () => {
    const { economy, corporation } = setup();

    const published = closeElapsedQuarters({
      economy, corporations: [corporation], settings, tick: QUARTER * 3
    });

    expect(published.map(s => s.quarterIndex)).toEqual([0, 1, 2]);
    expect(economy.getStatements().lastClosedQuarter).toBe(2);
  });

  test('should skip corporations with no name', () => {
    const { economy } = setup();
    const nameless = new Corporation('', 'desc', false, 0);

    const published = closeElapsedQuarters({
      economy, corporations: [nameless], settings, tick: QUARTER
    });

    expect(published).toEqual([]);
  });
});

describe('statements through the tick loop', () => {
  /**
   * Build a started game with a producing world.
   * @returns {Object} An initialized Game.
   */
  function startedGame() {
    const game = new Game(createUniverse(5, 7, 10), settings, { seed: 'statement-loop' });
    game.initializeGame({
      name: 'Reporter',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'Statement test player',
      corporation: { name: 'Report Co', description: 'A reporting corporation' }
    });
    return game;
  }

  test('should publish a statement when a quarter ends', () => {
    const game = startedGame();
    const listener = jest.fn();
    game.getEventBus().on('statement-published', listener);

    game.advanceTicks(QUARTER + 24, 'test');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ corporationName: 'Report Co', quarterIndex: 0 })
    );
  });

  test('should publish nothing before the first quarter ends', () => {
    const game = startedGame();
    game.advanceTicks(QUARTER - 100, 'test');

    expect(game.getEconomy().getStatements()
      .forHolder(corporationHolder(game.getPlayer().corporation))).toEqual([]);
  });

  test('should restore published statements across a save and load', () => {
    const game = startedGame();
    game.advanceTicks(QUARTER + 24, 'test');

    const holder = corporationHolder(game.getPlayer().corporation);
    const before = game.getEconomy().getStatements().forHolder(holder);
    expect(before.length).toBeGreaterThan(0);

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
    const after = loaded.getEconomy().getStatements().forHolder(holder);

    expect(after).toHaveLength(before.length);
    expect(after[0].income.revenue).toBe(before[0].income.revenue);
  });

  test('should not republish quarters after a load', () => {
    const game = startedGame();
    game.advanceTicks(QUARTER + 24, 'test');

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
    loaded.advanceTicks(48, 'test');

    const holder = corporationHolder(loaded.getPlayer().corporation);
    expect(loaded.getEconomy().getStatements().forHolder(holder)).toHaveLength(1);
  });

  test('should reconcile a statement to the journal', () => {
    const game = startedGame();
    const corporation = game.getPlayer().corporation;
    const object = game.getUniverse().stellarObjects.find(
      obj => corporation.stellarObjects.includes(obj.id)
    );
    if (object) {
      object.buildings = { Farm: { count: 1 } };
    }

    game.advanceTicks(QUARTER + 24, 'test');

    const holder = corporationHolder(corporation);
    const statement = game.getEconomy().getStatements().latestForHolder(holder);
    const ledger = game.getEconomy().getLedger();

    // The reported figures are a summary of the journal, not fields someone set
    expect(statement.income.revenue)
      .toBe(ledger.periodMovement(holder, ACCOUNTS.REVENUE, statement.fromTick, statement.toTick));
    expect(statement.balance.totalAssets - statement.balance.totalLiabilities)
      .toBe(statement.balance.netWorth);
  });
});

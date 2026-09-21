const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { EconomyState } = require('./economyState');
const {
  isInjection, creditsInjected, injectionsByReason, checkConservation, cashByHolder
} = require('./conservation');
const { recordOpeningBalance, recordGoodsTrade } = require('./transactions');
const { ACCOUNTS, playerHolder, corporationHolder, marketHolder } = require('./accounts');
const { ticksPerQuarter } = require('./clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const ALICE = playerHolder('Alice');
const ACME = corporationHolder('Acme Orbital');

describe('isInjection', () => {
  test('should recognize cash credited against the same holder’s capital', () => {
    expect(isInjection({
      debit: { holder: 'player:Alice', account: ACCOUNTS.CASH },
      credit: { holder: 'player:Alice', account: ACCOUNTS.CONTRIBUTED_CAPITAL }
    })).toBe(true);
  });

  test('should not count a transfer between holders', () => {
    // The same accounts across two holders is a gift, not new money
    expect(isInjection({
      debit: { holder: 'player:Alice', account: ACCOUNTS.CASH },
      credit: { holder: 'player:Bob', account: ACCOUNTS.CONTRIBUTED_CAPITAL }
    })).toBe(false);
  });

  test('should not count ordinary trade', () => {
    expect(isInjection({
      debit: { holder: 'player:Alice', account: ACCOUNTS.CASH },
      credit: { holder: 'player:Alice', account: ACCOUNTS.REVENUE }
    })).toBe(false);
  });
});

describe('the invariant on a bare economy', () => {
  test('should hold for an empty ledger', () => {
    expect(checkConservation(new EconomyState({ seed: 'c' }).getLedger()))
      .toMatchObject({ holds: true, totalCash: 0, injected: 0 });
  });

  test('should count an opening balance as an injection', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 1000 });

    expect(checkConservation(economy.getLedger()))
      .toMatchObject({ holds: true, totalCash: 1000, injected: 1000 });
  });

  test('should hold through trades, which only move credits sideways', () => {
    const economy = new EconomyState({ seed: 'c' });
    const market = marketHolder(1);
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 5000 });
    recordOpeningBalance(economy, { tick: 0, holder: market, amount: 5000 });

    for (let i = 1; i <= 20; i += 1) {
      recordGoodsTrade(economy, {
        tick: i, buyer: ALICE, seller: market,
        goodName: 'wheat', quantity: 2, totalPrice: 20
      });
    }

    expect(checkConservation(economy.getLedger()))
      .toMatchObject({ holds: true, injected: 10000 });
  });

  test('should report a leak when credits go missing', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 1000 });

    // A one-sided spend, the shape a subsystem destroying money would take
    economy.getLedger().post({
      tick: 1,
      amount: 250,
      debit: { holder: ALICE, account: ACCOUNTS.OPERATING_EXPENSE },
      credit: { holder: ALICE, account: ACCOUNTS.CASH }
    });

    const result = checkConservation(economy.getLedger());
    expect(result.holds).toBe(false);
    expect(result.difference).toBe(-250);
  });

  test('should attribute injections to their reason', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 1000 });
    economy.getLedger().post({
      tick: 1,
      amount: 500,
      debit: { holder: ACME, account: ACCOUNTS.CASH },
      credit: { holder: ACME, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
      refs: { reason: 'investor_savings' }
    });

    expect(injectionsByReason(economy.getLedger()))
      .toEqual({ opening_balance: 1000, investor_savings: 500 });
  });

  test('should survive journal compression', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 100000 });
    const market = marketHolder(1);
    recordOpeningBalance(economy, { tick: 0, holder: market, amount: 100000 });

    for (let tick = 1; tick <= 200; tick += 1) {
      recordGoodsTrade(economy, {
        tick, buyer: ALICE, seller: market, goodName: 'wheat', quantity: 1, totalPrice: 10
      });
    }

    economy.getLedger().rollupThrough(150);

    // Rollup replaces entries with balance-preserving ones that do not keep the
    // injection shape, so a derived total would report the money supply
    // shrinking whenever history was compressed
    expect(checkConservation(economy.getLedger()))
      .toMatchObject({ holds: true, injected: 200000 });
  });

  test('should survive a save and load', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 7500 });

    const restored = EconomyState.fromJSON(JSON.parse(JSON.stringify(economy.toJSON())));
    expect(creditsInjected(restored.getLedger())).toBe(7500);
    expect(checkConservation(restored.getLedger()).holds).toBe(true);
  });
});

describe('cashByHolder', () => {
  test('should list holders with cash, largest first', () => {
    const economy = new EconomyState({ seed: 'c' });
    recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 100 });
    recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 900 });

    const rows = cashByHolder(economy.getLedger());
    expect(rows[0].holder.id).toBe('Acme Orbital');
    expect(rows[0].cash).toBe(900);
  });

  test('should exclude holders with no cash', () => {
    expect(cashByHolder(new EconomyState({ seed: 'c' }).getLedger())).toEqual([]);
  });
});

describe('the invariant across a running game', () => {
  /**
   * Build a started game with several listed companies.
   * @returns {Object} An initialized Game.
   */
  function populatedGame() {
    const game = new Game(createUniverse(8, 12, 25), settings, { seed: 'conservation' });
    game.initializeGame({
      name: 'Trader',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'Conservation test player',
      corporation: { name: 'PlayerCo', description: 'The player corporation' }
    });

    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .slice(0, 3)
      .forEach(corporation => {
        corporation.setDividendRate(30);
        game.listCorporation(corporation.name, 10000);
      });

    return game;
  }

  test('should hold at game start', () => {
    expect(checkConservation(populatedGame().getEconomy().getLedger()).holds).toBe(true);
  });

  test('should hold across a full quarter of every subsystem running', () => {
    const game = populatedGame();
    game.advanceTicks(ticksPerQuarter(settings), 'test');

    const result = checkConservation(game.getEconomy().getLedger());

    // Production, restocking, wages, interest, forced loans, share auctions and
    // dividends all ran; none of them may create or destroy a credit
    expect(result.holds).toBe(true);
    expect(game.getEconomy().getLedger().audit())
      .toMatchObject({ balanced: true, balancesMatch: true });
  });

  test('should hold across a full game year', () => {
    const game = populatedGame();
    game.advanceTicks(ticksPerQuarter(settings) * 4, 'test');

    expect(checkConservation(game.getEconomy().getLedger()).holds).toBe(true);
  });

  test('should name savings as the only recurring inflow', () => {
    const game = populatedGame();
    game.advanceTicks(ticksPerQuarter(settings), 'test');

    const reasons = injectionsByReason(game.getEconomy().getLedger());

    // Everything else is a transfer, which is what makes the total checkable
    expect(Object.keys(reasons).sort())
      .toEqual(['investor_pool_opening', 'investor_savings', 'opening_balance']);
  });

  test('should hold across a save and load mid-game', () => {
    const game = populatedGame();
    game.advanceTicks(ticksPerQuarter(settings), 'test');

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
    loaded.advanceTicks(ticksPerQuarter(settings), 'test');

    expect(checkConservation(loaded.getEconomy().getLedger()).holds).toBe(true);
  });
});

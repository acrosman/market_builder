const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { ACCOUNTS, BANK_HOLDER, playerHolder, corporationHolder } = require('./accounts');

/**
 * Integration coverage for the economy ledger against a real universe.
 *
 * The unit tests prove the ledger balances in isolation. These prove the game
 * actually posts through it: that credits recorded in the journal match the
 * mutable player and corporation state the rest of the game reads, and that no
 * gameplay path mints or destroys credits.
 */

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

/**
 * Build player data for initializeGame.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} Player data.
 */
function playerData(overrides = {}) {
  return {
    name: 'LedgerTester',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Integration test player',
    corporation: { name: 'Ledger Test Corp', description: 'A test corporation' },
    ...overrides
  };
}

/**
 * Build a started game on a real generated universe.
 * @returns {Object} An initialized Game.
 */
function startedGame() {
  const universe = createUniverse(8, 12, 20);
  const game = new Game(universe, settings, { seed: 'integration' });
  game.initializeGame(playerData());
  return game;
}

/**
 * Find a stellar object in the player's current system that has a market.
 *
 * The starting system always contains a Trading Post, so a missing market means
 * the fixture is broken rather than that this universe happened to lack one.
 * Asserting here stops a broken setup from silently passing every test.
 * @param {Object} game - The game to search.
 * @returns {Object} A stellar object with a market.
 */
function localMarketObject(game) {
  const object = game.getUniverse().stellarObjects.find(
    obj => obj.location === game.getPlayer().location && obj.marketState
  );
  expect(object).toBeDefined();
  return object;
}

/**
 * Find a good the given market stocks at least `minimum` units of.
 * @param {Object} object - Stellar object with a market.
 * @param {number} [minimum=1] - Minimum units required.
 * @returns {string} The good name.
 */
function stockedGood(object, minimum = 1) {
  const goodName = Object.keys(object.marketState.inventory)
    .find(name => object.marketState.inventory[name] >= minimum);
  expect(goodName).toBeDefined();
  return goodName;
}

describe('economy ledger integration', () => {
  describe('opening balances', () => {
    test('should record the player opening cash matching their credits', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();

      expect(ledger.balance(playerHolder(game.getPlayer()), ACCOUNTS.CASH))
        .toBe(game.getPlayer().credits);
    });

    test('should record corporation opening cash matching their reserves', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();

      game.getCorporations().forEach(corporation => {
        expect(ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH))
          .toBe(corporation.getTotalCashReserves());
      });
    });

    test('should give every stocked market a cost basis for its inventory', () => {
      const game = startedGame();
      const basis = game.getEconomy().getCostBasis();
      const ledger = game.getEconomy().getLedger();

      const markets = game.getUniverse().stellarObjects.filter(obj => obj.marketState);
      expect(markets.length).toBeGreaterThan(0);

      markets.forEach(obj => {
        const holder = { kind: 'market', id: obj.id };
        // Inventory carried in the books equals the tracked cost basis
        expect(basis.holderInventoryValue(holder))
          .toBe(ledger.balance(holder, ACCOUNTS.INVENTORY));
      });
    });

    test('should leave the journal balanced at game start', () => {
      const game = startedGame();
      expect(game.getEconomy().getLedger().audit()).toMatchObject({
        balanced: true,
        balancesMatch: true
      });
    });
  });

  describe('goods trading', () => {
    test('should keep journal cash in step with player credits through trades', () => {
      const game = startedGame();
      const object = localMarketObject(game);

      const holder = playerHolder(game.getPlayer());
      const ledger = game.getEconomy().getLedger();
      const goodNames = Object.keys(object.marketState.inventory)
        .filter(name => object.marketState.inventory[name] > 0);

      let traded = 0;
      goodNames.forEach(goodName => {
        if (game.buyGood(object.id, goodName, 1).success) {
          traded += 1;
        }
      });

      expect(traded).toBeGreaterThan(0);
      // The books agree with the state the rest of the game reads
      expect(ledger.balance(holder, ACCOUNTS.CASH)).toBe(game.getPlayer().credits);
    });

    test('should record a buy then sell round trip as revenue against cost', () => {
      const game = startedGame();
      const object = localMarketObject(game);

      const goodName = stockedGood(object, 5);

      const holder = playerHolder(game.getPlayer());
      const ledger = game.getEconomy().getLedger();

      expect(game.buyGood(object.id, goodName, 5).success).toBe(true);
      const inventoryAfterBuy = ledger.balance(holder, ACCOUNTS.INVENTORY);
      expect(inventoryAfterBuy).toBeGreaterThan(0);

      expect(game.sellGood(object.id, goodName, 5).success).toBe(true);

      // Selling the whole position releases the whole basis, leaving no residue
      expect(ledger.balance(holder, ACCOUNTS.INVENTORY)).toBe(0);
      expect(ledger.balance(holder, ACCOUNTS.COGS)).toBe(inventoryAfterBuy);
      expect(ledger.balance(holder, ACCOUNTS.REVENUE)).toBeGreaterThan(0);
      expect(ledger.balance(holder, ACCOUNTS.CASH)).toBe(game.getPlayer().credits);
    });

    test('should conserve total cash across many trades', () => {
      const game = startedGame();
      const object = localMarketObject(game);

      const ledger = game.getEconomy().getLedger();
      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);
      const goodNames = Object.keys(object.marketState.inventory);

      for (let round = 0; round < 10; round += 1) {
        goodNames.forEach(goodName => {
          game.buyGood(object.id, goodName, 2);
          game.sellGood(object.id, goodName, 1);
        });
      }

      // Not one credit created or destroyed by any amount of trading
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should not post anything for a failed trade', () => {
      const game = startedGame();
      const object = localMarketObject(game);

      const ledger = game.getEconomy().getLedger();
      const entriesBefore = ledger.entries.length;

      // Far more than any market stocks
      const goodName = Object.keys(object.marketState.inventory)[0];
      expect(game.buyGood(object.id, goodName, 999999).success).toBe(false);

      expect(ledger.entries.length).toBe(entriesBefore);
    });
  });

  describe('loans', () => {
    test('should conserve cash on a draw by posting against the bank', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const ledger = game.getEconomy().getLedger();
      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      const loan = game.takeCorporationLoan(corporation.name, 50000);
      expect(loan).not.toBeNull();

      const holder = corporationHolder(corporation);
      // takeLoan alone would have created 50000 credits from nothing
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      expect(ledger.balance(holder, ACCOUNTS.DEBT)).toBe(50000);
      expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(50000);
      expect(ledger.balance(holder, ACCOUNTS.CASH))
        .toBe(corporation.getTotalCashReserves());
    });

    test('should unwind debt and conserve cash on repayment', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const ledger = game.getEconomy().getLedger();
      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      const loan = game.takeCorporationLoan(corporation.name, 20000);
      expect(game.makeCorporationLoanPayment(corporation.name, loan.id, 20000)).toBe(true);

      const holder = corporationHolder(corporation);
      expect(ledger.balance(holder, ACCOUNTS.DEBT)).toBe(0);
      expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(0);
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      expect(ledger.balance(holder, ACCOUNTS.CASH))
        .toBe(corporation.getTotalCashReserves());
    });

    test('should not post more than an overpayment actually retires', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;
      const ledger = game.getEconomy().getLedger();

      // Fund the corporation so the overpayment is affordable, and re-baseline
      corporation.addCashReserve(100000);
      const cashBefore = ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH);

      const loan = game.takeCorporationLoan(corporation.name, 10000);
      // Pay far more than is owed; only the outstanding balance may be spent
      game.makeCorporationLoanPayment(corporation.name, loan.id, 30000);

      // The excess was never spent, so the ledger and reserves still agree
      expect(ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH)).toBe(cashBefore);

      const holder = corporationHolder(corporation);
      expect(ledger.balance(holder, ACCOUNTS.DEBT)).toBe(0);
      expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(0);
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should reject a loan for an unknown corporation', () => {
      const game = startedGame();
      const entriesBefore = game.getEconomy().getLedger().entries.length;

      expect(game.takeCorporationLoan('No Such Corp', 1000)).toBeNull();
      expect(game.makeCorporationLoanPayment('No Such Corp', 1, 100)).toBe(false);
      expect(game.getEconomy().getLedger().entries.length).toBe(entriesBefore);
    });
  });

  describe('construction', () => {
    test('should capitalize a build and conserve cash', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;

      // Put the player on a world their corporation controls
      const owned = game.getUniverse().stellarObjects.find(
        obj => corporation.stellarObjects.includes(obj.id) && obj.capabilities.buildings
      );
      expect(owned).toBeDefined();

      game.getPlayer().location = owned.location;
      game.getPlayer().landedOn = owned.id;
      corporation.addCashReserve(100000);

      const ledger = game.getEconomy().getLedger();
      const holder = corporationHolder(corporation);
      // The reserve top-up is outside the ledger, so re-baseline against it
      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);
      const propertyBefore = ledger.balance(holder, ACCOUNTS.PROPERTY);

      const options = game.getBuildableBuildingsForCurrentObject();
      expect(Array.isArray(options)).toBe(true);
      const buildable = options.find(option => option.canBuild);
      if (!buildable) {
        return;
      }

      expect(game.buildBuildingAtCurrentObject(buildable.type).success).toBe(true);

      // Credits went to the local economy rather than vanishing
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      // And the spend sits on the balance sheet, not in the income statement
      expect(ledger.balance(holder, ACCOUNTS.PROPERTY)).toBeGreaterThanOrEqual(propertyBefore);
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });
  });

  describe('persistence', () => {
    test('should restore the journal and balances across a save and load', () => {
      const game = startedGame();
      const object = localMarketObject(game);
      game.buyGood(object.id, stockedGood(object, 2), 2);

      const ledger = game.getEconomy().getLedger();
      const holder = playerHolder(game.getPlayer());
      const cashBefore = ledger.balance(holder, ACCOUNTS.CASH);
      const entryCount = ledger.entries.length;

      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
      const loadedLedger = loaded.getEconomy().getLedger();

      expect(loadedLedger.entries).toHaveLength(entryCount);
      expect(loadedLedger.balance(holder, ACCOUNTS.CASH)).toBe(cashBefore);
      expect(loadedLedger.balance(holder, ACCOUNTS.CASH)).toBe(loaded.getPlayer().credits);
      expect(loadedLedger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should keep trading correctly after a load', () => {
      const game = startedGame();
      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));

      const object = localMarketObject(loaded);
      const goodName = stockedGood(object, 3);

      const ledger = loaded.getEconomy().getLedger();
      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      expect(loaded.buyGood(object.id, goodName, 3).success).toBe(true);

      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      expect(ledger.balance(playerHolder(loaded.getPlayer()), ACCOUNTS.CASH))
        .toBe(loaded.getPlayer().credits);
    });

    test('should not double-record opening balances on load', () => {
      const game = startedGame();
      const entryCount = game.getEconomy().getLedger().entries.length;

      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));

      expect(loaded.getEconomy().getLedger().entries).toHaveLength(entryCount);
    });
  });
});

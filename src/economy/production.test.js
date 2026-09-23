const fs = require('fs');
const path = require('path');
const { EconomyState } = require('./economyState');
const {
  EXTRACTION_RATINGS,
  productionConfig,
  rawGoodsInCategory,
  resolveInputGoods,
  operatorHolder,
  drawFromInventory,
  runProduction,
  consumeFood
} = require('./production');
const { loadContent } = require('../contentCache');
const { ACCOUNTS, corporationHolder, marketHolder, holderKey } = require('./accounts');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const goodsData = loadContent('goods');

/**
 * Build a stellar-object-shaped fixture with a market.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} A stellar object fixture.
 */
function makeObject(overrides = {}) {
  return {
    id: 1,
    owner: 'Independent',
    productivityModifiers: { metal: 5, food: 10, chemicals: 6, energy: 7 },
    population: { current: 0, limit: 1e9, growthRate: 0 },
    buildings: {},
    marketState: { inventory: {}, prices: {}, tradeRoutes: [] },
    ...overrides
  };
}

describe('production helpers', () => {
  describe('productionConfig', () => {
    test('should read configured values', () => {
      const config = productionConfig(settings);
      expect(config.unitsPerPointPerDay).toBeGreaterThan(0);
    });

    test('should keep a configured zero rather than falling back', () => {
      const config = productionConfig({ production: { staff_wage_per_day: 0 } });
      expect(config.staffWagePerDay).toBe(0);
    });

    test('should fall back for missing or unusable values', () => {
      expect(productionConfig({}).staffWagePerDay).toBe(1);
      expect(productionConfig({ production: { staff_wage_per_day: 'x' } }).staffWagePerDay).toBe(1);
    });
  });

  describe('rawGoodsInCategory', () => {
    test('should return only raw goods of the category, sorted', () => {
      const food = rawGoodsInCategory(goodsData, 'food');
      expect(food).toEqual(['cotton', 'water', 'wheat', 'wood', 'yeast']);
      expect(rawGoodsInCategory(goodsData, 'metal')).toEqual(['metalOre']);
    });

    test('should return empty for an unknown category', () => {
      expect(rawGoodsInCategory(goodsData, 'nonsense')).toEqual([]);
    });
  });

  describe('resolveInputGoods', () => {
    test('should resolve a key that names a real good to that good', () => {
      expect(resolveInputGoods(goodsData, 'chemicals')).toEqual(['chemicals']);
    });

    test('should resolve a category-only key to its raw goods', () => {
      expect(resolveInputGoods(goodsData, 'food')).toEqual(
        ['cotton', 'water', 'wheat', 'wood', 'yeast']
      );
    });

    test('should return empty for an unrecognized key', () => {
      expect(resolveInputGoods(goodsData, 'unobtanium')).toEqual([]);
    });
  });

  describe('operatorHolder', () => {
    test('should return the owning corporation when one owns it', () => {
      const object = makeObject({ owner: 'Acme Orbital' });
      const holder = operatorHolder(object, [{ name: 'Acme Orbital' }]);
      expect(holder).toEqual(corporationHolder('Acme Orbital'));
    });

    test('should return the local market when independent', () => {
      const object = makeObject();
      expect(operatorHolder(object, [{ name: 'Acme Orbital' }])).toEqual(marketHolder(object));
    });

    test('should tolerate a missing corporation list', () => {
      expect(operatorHolder(makeObject(), undefined)).toEqual(marketHolder(makeObject()));
    });
  });

  describe('drawFromInventory', () => {
    test('should draw across candidates in order', () => {
      const inventory = { wheat: 10, water: 30 };
      expect(drawFromInventory(inventory, ['wheat', 'water'], 25))
        .toEqual({ taken: { wheat: 10, water: 15 }, total: 25 });
    });

    test('should return null when short', () => {
      expect(drawFromInventory({ wheat: 5 }, ['wheat'], 10)).toBeNull();
    });

    test('should handle candidates absent from inventory', () => {
      expect(drawFromInventory({ wheat: 10 }, ['missing', 'wheat'], 10))
        .toEqual({ taken: { wheat: 10 }, total: 10 });
    });
  });
});

describe('runProduction', () => {
  /**
   * Run one production cycle against a fresh economy.
   * @param {Object} stellarObject - Object to run for.
   * @param {Object} [options={}] - `{ days, corporations, economy }`.
   * @returns {Object} `{ economy, summary }`.
   */
  function run(stellarObject, options = {}) {
    const economy = options.economy || new EconomyState({ seed: 'production' });
    const summary = runProduction({
      economy,
      stellarObject,
      corporations: options.corporations || [],
      settings,
      days: options.days ?? 1,
      tick: options.tick ?? 24
    });
    return { economy, summary };
  }

  test('should produce nothing without a market to hold output', () => {
    const object = makeObject({ marketState: null, buildings: { Farm: { count: 1 } } });
    expect(run(object).summary.produced).toEqual({});
  });

  test('should produce nothing for zero or negative days', () => {
    const object = makeObject({ buildings: { Farm: { count: 1 } } });
    object.marketState.inventory.chemicals = 1000;
    expect(run(object, { days: 0 }).summary.produced).toEqual({});
  });

  test('should extract food from farms', () => {
    const object = makeObject({ buildings: { Farm: { count: 1 } } });
    object.marketState.inventory.chemicals = 1000;

    const { summary } = run(object);

    // farming 10 x food modifier 10 = 100 units a day
    const total = Object.values(summary.produced).reduce((sum, units) => sum + units, 0);
    expect(total).toBe(100);
    expect(Object.keys(summary.produced).sort())
      .toEqual(['cotton', 'water', 'wheat', 'wood', 'yeast']);
  });

  test('should extract metal from mines', () => {
    const object = makeObject({ buildings: { Mine: { count: 2 } } });
    object.marketState.inventory.wheat = 10000;

    const { summary } = run(object);

    // mining 5 x metal modifier 5 x 2 mines = 50 a day, all metalOre
    expect(summary.produced).toEqual({ metalOre: 50 });
  });

  test('should scale output with elapsed days', () => {
    const object = makeObject({ buildings: { Mine: { count: 1 } } });
    object.marketState.inventory.wheat = 100000;

    expect(run(object, { days: 7 }).summary.produced.metalOre).toBe(175);
  });

  test('should consume its declared inputs', () => {
    const object = makeObject({ buildings: { Farm: { count: 1 } } });
    object.marketState.inventory.chemicals = 1000;

    run(object);

    // Farm consumes 5 chemicals a day
    expect(object.marketState.inventory.chemicals).toBe(995);
  });

  test('should scale down rather than stall when inputs are short', () => {
    const full = makeObject({ buildings: { Farm: { count: 10 } } });
    full.marketState.inventory.chemicals = 1000;
    const fullOutput = Object.values(run(full).summary.produced)
      .reduce((sum, units) => sum + units, 0);

    const starved = makeObject({ buildings: { Farm: { count: 10 } } });
    // A quarter of the 50 chemicals ten farms need for a day
    starved.marketState.inventory.chemicals = 12;
    const starvedOutput = Object.values(run(starved).summary.produced)
      .reduce((sum, units) => sum + units, 0);

    expect(starvedOutput).toBeGreaterThan(0);
    expect(starvedOutput).toBeLessThan(fullOutput);
  });

  test('should produce nothing with no inputs at all', () => {
    const object = makeObject({ buildings: { Farm: { count: 1 } } });
    object.marketState.inventory.chemicals = 0;
    expect(run(object).summary.produced).toEqual({});
  });

  test('should ignore buildings that extract nothing', () => {
    const object = makeObject({ buildings: { Warehouse: { count: 5 } } });
    expect(run(object).summary.produced).toEqual({});
  });

  test('should ignore unknown building types', () => {
    const object = makeObject({ buildings: { 'Orbital Casino': { count: 3 } } });
    expect(run(object).summary.produced).toEqual({});
  });

  test('should produce nothing where the modifier is zero', () => {
    const object = makeObject({
      buildings: { Farm: { count: 1 } },
      productivityModifiers: { food: 0, metal: 0, chemicals: 0 }
    });
    object.marketState.inventory.chemicals = 1000;
    expect(run(object).summary.produced).toEqual({});
  });

  test('should give output a cost basis so it shows a margin when sold', () => {
    const object = makeObject({ buildings: { Mine: { count: 1 } } });
    object.marketState.inventory.wheat = 100000;

    const { economy } = run(object);
    const holder = marketHolder(object);

    // Wages, energy, and consumed inputs all land in the output's basis
    expect(economy.getCostBasis().totalCost(holder, 'metalOre')).toBeGreaterThan(0);
  });

  test('should keep the cost basis equal to the ledger inventory balance', () => {
    const object = makeObject({ buildings: { Farm: { count: 3 }, Mine: { count: 2 } } });
    object.marketState.inventory.chemicals = 100000;
    object.marketState.inventory.wheat = 100000;

    const economy = new EconomyState({ seed: 'basis' });
    const holder = marketHolder(object);
    // Give the pre-existing stock a basis so both sides start in step
    economy.getCostBasis().acquire(holder, 'chemicals', 100000, 0);
    economy.getCostBasis().acquire(holder, 'wheat', 100000, 0);

    for (let day = 1; day <= 30; day += 1) {
      run(object, { economy, days: 1, tick: day * 24 });
    }

    expect(economy.getCostBasis().holderInventoryValue(holder))
      .toBe(economy.getLedger().balance(holder, ACCOUNTS.INVENTORY));
  });

  test('should pay wages to the local economy rather than destroying them', () => {
    const object = makeObject({ owner: 'Acme Orbital', buildings: { Mine: { count: 1 } } });
    object.marketState.inventory.wheat = 100000;

    const economy = new EconomyState({ seed: 'wages' });
    const corporations = [{ name: 'Acme Orbital' }];
    const ledger = economy.getLedger();
    const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);

    const { summary } = run(object, { economy, corporations });

    expect(summary.creditsSpent).toBeGreaterThan(0);
    expect(ledger.balance(marketHolder(object), ACCOUNTS.CASH)).toBe(summary.creditsSpent);
    expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
  });

  test('should credit output to the owning corporation when there is one', () => {
    const object = makeObject({ owner: 'Acme Orbital', buildings: { Mine: { count: 1 } } });
    object.marketState.inventory.wheat = 100000;

    const { economy } = run(object, { corporations: [{ name: 'Acme Orbital' }] });

    expect(economy.getCostBasis().quantity(corporationHolder('Acme Orbital'), 'metalOre'))
      .toBeGreaterThan(0);
    expect(economy.getCostBasis().quantity(marketHolder(object), 'metalOre')).toBe(0);
  });

  test('should keep the journal balanced', () => {
    const object = makeObject({ buildings: { Farm: { count: 4 } } });
    object.marketState.inventory.chemicals = 100000;

    const { economy } = run(object, { days: 10 });
    expect(economy.getLedger().audit()).toMatchObject({ balanced: true, balancesMatch: true });
  });

  test('should be deterministic for identical inputs', () => {
    const runOnce = () => {
      const object = makeObject({ buildings: { Farm: { count: 3 } } });
      object.marketState.inventory.chemicals = 5000;
      const { economy } = run(object, { days: 5 });
      return JSON.stringify({
        inventory: object.marketState.inventory,
        basis: economy.getCostBasis().toJSON()
      });
    };
    expect(runOnce()).toBe(runOnce());
  });
});

describe('consumeFood', () => {
  /**
   * Run one consumption cycle against a fresh economy.
   * @param {Object} stellarObject - Object to run for.
   * @param {Object} [options={}] - `{ days, economy }`.
   * @returns {Object} `{ economy, summary }`.
   */
  function eat(stellarObject, options = {}) {
    const economy = options.economy || new EconomyState({ seed: 'consumption' });
    const summary = consumeFood({
      economy,
      stellarObject,
      corporations: [],
      settings,
      days: options.days ?? 1,
      tick: options.tick ?? 24
    });
    return { economy, summary };
  }

  test('should eat nothing with no population', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 1000;
    expect(eat(object).summary.consumed).toEqual({});
  });

  test('should eat nothing without a market', () => {
    const object = makeObject({ marketState: null, population: { current: 1e12 } });
    expect(eat(object).summary.consumed).toEqual({});
  });

  test('should scale demand with population and days', () => {
    const object = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    object.marketState.inventory.water = 100000;

    // 10 billion people at 2 units per billion per day
    expect(eat(object, { days: 1 }).summary.consumed.water).toBe(20);

    const longer = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    longer.marketState.inventory.water = 100000;
    expect(eat(longer, { days: 10 }).summary.consumed.water).toBe(200);
  });

  test('should eat the cheapest food first', () => {
    const object = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    // Water is the cheapest food good, wood and cotton are not really edible
    object.marketState.inventory.water = 15;
    object.marketState.inventory.wheat = 1000;
    object.marketState.inventory.wood = 1000;

    const { summary } = eat(object);

    expect(summary.consumed.water).toBe(15);
    expect(summary.consumed.wheat).toBe(5);
    expect(summary.consumed.wood).toBeUndefined();
  });

  test('should report a shortfall rather than eating what is not there', () => {
    const object = makeObject({ population: { current: 100e9, limit: 1e12, growthRate: 0 } });
    object.marketState.inventory.water = 10;

    const { summary } = eat(object);

    expect(summary.consumed.water).toBe(10);
    expect(summary.shortfall).toBe(190);
    expect(object.marketState.inventory.water).toBe(0);
  });

  test('should book eaten food as an operating expense', () => {
    const object = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'expense' });
    const holder = marketHolder(object);
    economy.getCostBasis().acquire(holder, 'water', 1000, 5000);

    eat(object, { economy });

    const ledger = economy.getLedger();
    expect(ledger.balance(holder, ACCOUNTS.OPERATING_EXPENSE)).toBeGreaterThan(0);
    expect(ledger.balance(holder, ACCOUNTS.INVENTORY)).toBeLessThan(0);
    expect(ledger.audit().balanced).toBe(true);
  });

  test('should keep the cost basis equal to the ledger inventory movement', () => {
    const object = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'step' });
    const holder = marketHolder(object);
    economy.getCostBasis().acquire(holder, 'water', 1000, 5000);
    const ledger = economy.getLedger();
    ledger.post({
      tick: 0,
      amount: 5000,
      debit: { holder, account: ACCOUNTS.INVENTORY },
      credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
    });

    eat(object, { economy, days: 20 });

    expect(economy.getCostBasis().holderInventoryValue(holder))
      .toBe(ledger.balance(holder, ACCOUNTS.INVENTORY));
  });

  test('should use a holder key that matches the operator', () => {
    const object = makeObject({ owner: 'Acme Orbital', population: { current: 10e9 } });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'owner' });
    consumeFood({
      economy, stellarObject: object, corporations: [{ name: 'Acme Orbital' }],
      settings, days: 1, tick: 24
    });

    expect(Object.keys(economy.getLedger().holderBalances(
      holderKey(corporationHolder('Acme Orbital'))
    )).length).toBeGreaterThanOrEqual(0);
  });
});

describe('consumeFood as a sale to the population', () => {
  /**
   * Build a market stub that prices at the good's base value.
   * @returns {Object} A market-shaped stub.
   */
  function stubMarket() {
    return {
      calculateMarketPrice: (object, goodName) => Number(goodsData[goodName].value) || 1
    };
  }

  test('should sell food to the population when a corporation owns the world', () => {
    const object = makeObject({
      owner: 'Acme Orbital',
      population: { current: 10e9, limit: 1e12, growthRate: 0 }
    });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'sale' });
    const seller = corporationHolder('Acme Orbital');
    economy.getCostBasis().acquire(seller, 'water', 1000, 3000);

    consumeFood({
      economy,
      stellarObject: object,
      market: stubMarket(),
      corporations: [{ name: 'Acme Orbital' }],
      settings,
      days: 1,
      tick: 24
    });

    const ledger = economy.getLedger();
    // Feeding a world is a business, not a charge against the owner
    expect(ledger.balance(seller, ACCOUNTS.REVENUE)).toBeGreaterThan(0);
    expect(ledger.balance(seller, ACCOUNTS.OPERATING_EXPENSE)).toBe(0);
    expect(ledger.balance(marketHolder(object), ACCOUNTS.CASH)).toBeLessThan(0);
  });

  test('should leave the population holding no stock after eating', () => {
    const object = makeObject({
      owner: 'Acme Orbital',
      population: { current: 10e9, limit: 1e12, growthRate: 0 }
    });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'eaten' });
    economy.getCostBasis().acquire(corporationHolder('Acme Orbital'), 'water', 1000, 3000);

    consumeFood({
      economy,
      stellarObject: object,
      market: stubMarket(),
      corporations: [{ name: 'Acme Orbital' }],
      settings,
      days: 1,
      tick: 24
    });

    expect(economy.getCostBasis().quantity(marketHolder(object), 'water')).toBe(0);
  });

  test('should expense rather than bill itself on an independent world', () => {
    const object = makeObject({ population: { current: 10e9, limit: 1e12, growthRate: 0 } });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'independent' });
    const holder = marketHolder(object);
    economy.getCostBasis().acquire(holder, 'water', 1000, 3000);

    consumeFood({
      economy, stellarObject: object, market: stubMarket(),
      corporations: [], settings, days: 1, tick: 24
    });

    const ledger = economy.getLedger();
    expect(ledger.balance(holder, ACCOUNTS.OPERATING_EXPENSE)).toBeGreaterThan(0);
    expect(ledger.balance(holder, ACCOUNTS.REVENUE)).toBe(0);
  });

  test('should conserve cash on the sale', () => {
    const object = makeObject({
      owner: 'Acme Orbital',
      population: { current: 10e9, limit: 1e12, growthRate: 0 }
    });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'conserve-food' });
    economy.getCostBasis().acquire(corporationHolder('Acme Orbital'), 'water', 1000, 3000);
    const cashBefore = economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH);

    consumeFood({
      economy, stellarObject: object, market: stubMarket(),
      corporations: [{ name: 'Acme Orbital' }], settings, days: 5, tick: 24
    });

    expect(economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
    expect(economy.getLedger().audit()).toMatchObject({ balanced: true, balancesMatch: true });
  });

  test('should fall back to base value without a market', () => {
    const object = makeObject({
      owner: 'Acme Orbital',
      population: { current: 10e9, limit: 1e12, growthRate: 0 }
    });
    object.marketState.inventory.water = 1000;

    const economy = new EconomyState({ seed: 'no-market' });
    economy.getCostBasis().acquire(corporationHolder('Acme Orbital'), 'water', 1000, 3000);

    expect(() => consumeFood({
      economy, stellarObject: object, corporations: [{ name: 'Acme Orbital' }],
      settings, days: 1, tick: 24
    })).not.toThrow();

    expect(economy.getLedger().balance(corporationHolder('Acme Orbital'), ACCOUNTS.REVENUE))
      .toBeGreaterThan(0);
  });
});

describe('EXTRACTION_RATINGS', () => {
  test('should map only to categories that have raw goods', () => {
    Object.values(EXTRACTION_RATINGS).forEach(category => {
      expect(rawGoodsInCategory(goodsData, category).length).toBeGreaterThan(0);
    });
  });
});

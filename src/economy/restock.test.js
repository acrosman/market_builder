const fs = require('fs');
const path = require('path');
const { EconomyState } = require('./economyState');
const { Market } = require('../market');
const { restockConfig, idealStockFor, restockMarket } = require('./restock');
const { loadContent } = require('../contentCache');
const { ACCOUNTS, EXTERNAL_HOLDER, marketHolder } = require('./accounts');

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

/**
 * Run a restock cycle against a fresh economy.
 * @param {Object} stellarObject - Object whose market to restock.
 * @param {Object} [options={}] - `{ days, economy, tick }`.
 * @returns {Object} `{ economy, summary }`.
 */
function restock(stellarObject, options = {}) {
  const economy = options.economy || new EconomyState({ seed: 'restock' });
  const universe = { systems: [], stellarObjects: [stellarObject] };
  const summary = restockMarket({
    economy,
    market: new Market(universe, settings),
    stellarObject,
    settings,
    days: options.days ?? 1,
    tick: options.tick ?? 24
  });
  return { economy, summary };
}

describe('restockConfig', () => {
  test('should read configured values', () => {
    expect(restockConfig(settings).dailyGapFraction).toBeGreaterThan(0);
  });

  test('should keep a configured zero', () => {
    expect(restockConfig({ restock: { daily_gap_fraction: 0 } }).dailyGapFraction).toBe(0);
  });

  test('should fall back for missing or unusable values', () => {
    expect(restockConfig({}).dailyGapFraction).toBe(0.05);
    expect(restockConfig({ restock: { max_ideal_multiple: 'x' } }).maxIdealMultiple).toBe(3);
  });
});

describe('idealStockFor', () => {
  test('should scale category goods by the productivity modifier', () => {
    const object = makeObject();
    // food modifier 10, raw goods ideal at 50 per point
    expect(idealStockFor(object, goodsData.wheat)).toBe(500);
    // metal modifier 5, intermediate at 20 per point
    expect(idealStockFor(object, goodsData.refinedMetal)).toBe(100);
    // metal modifier 5, finished at 10 per point
    expect(idealStockFor(object, goodsData.electronics)).toBe(50);
  });

  test('should use fixed levels for general and military goods', () => {
    const object = makeObject();
    expect(idealStockFor(object, goodsData.fabric)).toBe(50);
    expect(idealStockFor(object, goodsData.consumerGoods)).toBe(25);
    expect(idealStockFor(object, goodsData.smallFighters)).toBe(25);
  });

  test('should be zero where the modifier is zero', () => {
    const object = makeObject({ productivityModifiers: { food: 0 } });
    expect(idealStockFor(object, goodsData.wheat)).toBe(0);
  });

  test('should be zero for a missing good', () => {
    expect(idealStockFor(makeObject(), undefined)).toBe(0);
  });
});

describe('restockMarket', () => {
  test('should do nothing without a market', () => {
    const object = makeObject({ marketState: null });
    expect(restock(object).summary).toEqual({ bought: {}, sold: {} });
  });

  test('should do nothing for zero days', () => {
    const object = makeObject();
    expect(restock(object, { days: 0 }).summary).toEqual({ bought: {}, sold: {} });
  });

  test('should buy toward the ideal when short', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;

    const { summary } = restock(object);

    // 5% of the 500 gap
    expect(summary.bought.wheat).toBe(25);
    expect(object.marketState.inventory.wheat).toBe(25);
  });

  test('should sell down only above the ceiling', () => {
    const object = makeObject();
    // Ideal 500, ceiling 1500
    object.marketState.inventory.wheat = 1400;
    expect(restock(object).summary.sold.wheat).toBeUndefined();

    const over = makeObject();
    over.marketState.inventory.wheat = 2500;
    expect(restock(over).summary.sold.wheat).toBe(50);
  });

  test('should leave a market at its ideal alone', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 500;
    const { summary } = restock(object);
    expect(summary.bought.wheat).toBeUndefined();
    expect(summary.sold.wheat).toBeUndefined();
  });

  test('should ignore goods with no ideal here', () => {
    const object = makeObject({ productivityModifiers: { food: 0, metal: 0, chemicals: 0 } });
    const { summary } = restock(object);
    expect(summary.bought.wheat).toBeUndefined();
    expect(summary.bought.metalOre).toBeUndefined();
  });

  test('should restock a multi-day batch close to repeated single days', () => {
    const batched = makeObject();
    batched.marketState.inventory.wheat = 0;
    restock(batched, { days: 5 });

    const stepped = makeObject();
    stepped.marketState.inventory.wheat = 0;
    const economy = new EconomyState({ seed: 'stepped' });
    for (let day = 1; day <= 5; day += 1) {
      restock(stepped, { economy, days: 1, tick: day * 24 });
    }

    // The daily fraction is compounded rather than multiplied, so a batch lands
    // close to the same place as the equivalent single days. It is not exact
    // because each step floors to whole units, and the batch floors only once.
    // In practice every tick checks for a day boundary, so batches larger than
    // one day only arise as a safety net.
    const difference = Math.abs(
      batched.marketState.inventory.wheat - stepped.marketState.inventory.wheat
    );
    expect(difference).toBeLessThanOrEqual(5);
    expect(batched.marketState.inventory.wheat).toBeGreaterThan(100);
  });

  test('should move cash to the external galaxy when buying', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;

    const { economy } = restock(object);
    const ledger = economy.getLedger();
    const holder = marketHolder(object);

    expect(ledger.balance(holder, ACCOUNTS.CASH)).toBeLessThan(0);
    expect(ledger.balance(EXTERNAL_HOLDER, ACCOUNTS.CASH)).toBeGreaterThan(0);
  });

  test('should conserve total cash across the boundary', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;
    object.marketState.inventory.metalOre = 5000;

    const economy = new EconomyState({ seed: 'conserve' });
    const cashBefore = economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH);

    for (let day = 1; day <= 30; day += 1) {
      restock(object, { economy, days: 1, tick: day * 24 });
    }

    // The wider galaxy is a holder, not a void, so nothing is created at it
    expect(economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
    expect(economy.getLedger().audit()).toMatchObject({
      balanced: true, balancesMatch: true
    });
  });

  test('should give imported goods a cost basis at the price paid', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;

    const { economy } = restock(object);
    const holder = marketHolder(object);

    expect(economy.getCostBasis().quantity(holder, 'wheat')).toBe(25);
    expect(economy.getCostBasis().totalCost(holder, 'wheat')).toBeGreaterThan(0);
  });

  test('should not leave the external holder booking pure profit', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;

    const { economy } = restock(object);
    const ledger = economy.getLedger();

    // External stock is given a basis before it sells, so revenue nets to zero
    expect(ledger.balance(EXTERNAL_HOLDER, ACCOUNTS.REVENUE))
      .toBe(ledger.balance(EXTERNAL_HOLDER, ACCOUNTS.COGS));
  });

  test('should converge a drained market back toward its ideal', () => {
    const object = makeObject();
    object.marketState.inventory.wheat = 0;

    const economy = new EconomyState({ seed: 'converge' });
    for (let day = 1; day <= 120; day += 1) {
      restock(object, { economy, days: 1, tick: day * 24 });
    }

    // This is the mean reversion a valuation anchor needs
    expect(object.marketState.inventory.wheat).toBeGreaterThan(400);
    expect(object.marketState.inventory.wheat).toBeLessThanOrEqual(500);
  });

  test('should be deterministic', () => {
    const runOnce = () => {
      const object = makeObject();
      object.marketState.inventory.wheat = 0;
      const { economy } = restock(object, { days: 3 });
      return JSON.stringify({
        inventory: object.marketState.inventory,
        ledger: economy.getLedger().toJSON()
      });
    };
    expect(runOnce()).toBe(runOnce());
  });
});

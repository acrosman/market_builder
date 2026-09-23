const fs = require('fs');
const path = require('path');
const { Corporation } = require('../corporation');
const {
  appraisalConfig,
  referenceGoodsPrices,
  categoryPrice,
  estimateDailyCashFlow,
  appraiseStellarObject,
  liquidValue,
  defaultProbability,
  discountRateFor,
  appraiseCorporation
} = require('./appraisal');
const { loadContent } = require('../contentCache');
const { ticksPerYear, ticksPerQuarter } = require('./clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const goodsData = loadContent('goods');
const YEAR = ticksPerYear(settings);

/**
 * Build a stellar-object-shaped fixture.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} A stellar object fixture.
 */
function makeObject(overrides = {}) {
  return {
    id: 1,
    owner: 'Independent',
    value: 80000,
    productivityModifiers: { metal: 5, food: 10, chemicals: 6, energy: 7 },
    population: { current: 0, limit: 1e12, growthRate: 0 },
    buildings: {},
    marketState: { inventory: {}, prices: {}, tradeRoutes: [] },
    ...overrides
  };
}

/**
 * Build a metal-rich object, where mining earns more than its staff eat.
 *
 * On a world with a middling metal rating a Mine is genuinely unprofitable: it
 * consumes 50 food a day to produce 25 ore. That is the model working, not a
 * fault, so tests about profitable extraction need a world worth mining.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} A stellar object fixture.
 */
function makeMetalWorld(overrides = {}) {
  return makeObject({
    productivityModifiers: { metal: 10, food: 1, chemicals: 7, energy: 6 },
    ...overrides
  });
}

/**
 * Build a universe fixture holding the given objects.
 * @param {Array<Object>} stellarObjects - Objects to include.
 * @returns {Object} A universe fixture.
 */
function makeUniverse(stellarObjects) {
  return { systems: [], stellarObjects };
}

describe('the reflexivity firewall', () => {
  const source = fs.readFileSync(path.join(__dirname, 'appraisal.js'), 'utf-8');

  test('should not import anything from the exchange', () => {
    // Structural, not a matter of discipline: if appraisal could read a share
    // price while the market priced companies on appraised book value, the two
    // would drive each other and prices would explode for no reason connected
    // to anything happening in the game.
    const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

    requires.forEach(target => {
      expect(target).not.toMatch(/exchange/i);
      expect(target).not.toMatch(/listing|portfolio|auction|order/i);
    });
  });

  test('should not mention share price anywhere in its source', () => {
    expect(source).not.toMatch(/sharePrice|share_price|lastPrice|marketCap/);
  });

  test('should ignore a share price injected into its context', () => {
    const object = makeObject({ buildings: { Farm: { count: 2 } } });
    const universe = makeUniverse([object]);
    const corporation = new Corporation('Acme', 'desc', true, 5000);
    corporation.addStellarObject(1);

    const clean = appraiseCorporation(corporation, { universe, settings, tick: 0 });
    const poisoned = appraiseCorporation(corporation, {
      universe,
      settings,
      tick: 0,
      sharePrice: 999999,
      lastPrice: 999999,
      marketCap: 10 ** 12,
      exchange: { quote: () => 999999 }
    });

    expect(poisoned).toEqual(clean);
  });

  test('should value an object identically however the market is doing', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });

    const first = appraiseStellarObject(object, { settings });
    const second = appraiseStellarObject(object, {
      settings, sharePrice: 1, marketSentiment: 'euphoric'
    });

    expect(second.value).toBe(first.value);
  });
});

describe('appraisalConfig', () => {
  test('should read configured values', () => {
    expect(appraisalConfig(settings).baseDiscountRate).toBeGreaterThan(0);
  });

  test('should keep a configured zero', () => {
    expect(appraisalConfig({ appraisal: { distress_spread: 0 } }).distressSpread).toBe(0);
  });

  test('should fall back for missing or unusable values', () => {
    expect(appraisalConfig({}).baseDiscountRate).toBe(0.12);
    expect(appraisalConfig({ appraisal: { base_discount_rate: 'x' } }).baseDiscountRate)
      .toBe(0.12);
  });
});

describe('referenceGoodsPrices and categoryPrice', () => {
  test('should price every good from the content data', () => {
    const prices = referenceGoodsPrices(settings);
    expect(prices.wheat).toBe(goodsData.wheat.value);
    expect(Object.keys(prices).length).toBe(Object.keys(goodsData).length);
  });

  test('should average the raw goods of a category', () => {
    const prices = referenceGoodsPrices(settings);
    const food = ['cotton', 'water', 'wheat', 'wood', 'yeast'];
    const expected = food.reduce((sum, name) => sum + prices[name], 0) / food.length;

    expect(categoryPrice(goodsData, prices, 'food')).toBeCloseTo(expected, 6);
  });

  test('should return zero for a category with no raw goods', () => {
    expect(categoryPrice(goodsData, referenceGoodsPrices(settings), 'nonsense')).toBe(0);
  });
});

describe('estimateDailyCashFlow', () => {
  test('should be flat for an object with no buildings and no people', () => {
    const flow = estimateDailyCashFlow(makeObject(), { settings });
    expect(flow.revenuePerDay).toBe(0);
    expect(flow.costPerDay).toBe(0);
    expect(flow.netPerDay).toBe(0);
  });

  test('should earn from exporting a surplus', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    const flow = estimateDailyCashFlow(object, { settings });

    expect(flow.revenuePerDay).toBeGreaterThan(0);
    expect(flow.netPerDay).toBeGreaterThan(0);
  });

  test('should treat the population as a customer, not an overhead', () => {
    const empty = makeObject();
    const populated = makeObject({
      population: { current: 20e9, limit: 1e12, growthRate: 0 }
    });

    // A world that must import all its food still earns the retail margin,
    // rather than losing the whole value of what its people eat
    expect(estimateDailyCashFlow(populated, { settings }).revenuePerDay)
      .toBeGreaterThan(estimateDailyCashFlow(empty, { settings }).revenuePerDay);
  });

  test('should cap output at the available input supply', () => {
    // A Farm World: strong food rating, weak chemicals, so the chemical input
    // binds long before the buildings do
    const farmWorld = { productivityModifiers: { metal: 3, food: 10, chemicals: 2, energy: 7 } };
    const one = estimateDailyCashFlow(
      makeObject({ ...farmWorld, buildings: { Farm: { count: 1 } } }), { settings }
    );
    const eight = estimateDailyCashFlow(
      makeObject({ ...farmWorld, buildings: { Farm: { count: 8 } } }), { settings }
    );

    // Eight farms cannot obtain eight times the chemicals, so seven of them sit
    // idle. Without this the model valued them at eight times the return.
    expect(one.inputRatio).toBe(1);
    expect(eight.inputRatio).toBeLessThan(0.5);
    expect(eight.netPerDay).toBeLessThan(one.netPerDay * 2);
  });

  test('should not constrain a building that needs no inputs', () => {
    const flow = estimateDailyCashFlow(
      makeObject({ buildings: { Warehouse: { count: 5 } } }), { settings }
    );
    expect(flow.inputRatio).toBe(1);
  });

  test('should produce nothing where the productivity modifier is zero', () => {
    const object = makeObject({
      buildings: { Mine: { count: 4 } },
      productivityModifiers: { metal: 0, food: 0, chemicals: 0 }
    });
    expect(estimateDailyCashFlow(object, { settings }).revenuePerDay).toBe(0);
  });

  test('should ignore unknown building types', () => {
    const object = makeObject({ buildings: { 'Orbital Casino': { count: 9 } } });
    expect(estimateDailyCashFlow(object, { settings }).netPerDay).toBe(0);
  });
});

describe('appraiseStellarObject', () => {
  test('should floor at the infrastructure value for an idle world', () => {
    const object = makeObject();
    const result = appraiseStellarObject(object, { settings });

    // Idle is not worthless: it is waiting for an operator
    expect(result.value).toBe(result.floor);
    expect(result.floor).toBeGreaterThan(0);
  });

  test('should never value an object below zero', () => {
    const object = makeObject({
      value: 0,
      population: { current: 500e9, limit: 1e12, growthRate: 0 },
      productivityModifiers: { food: 0, metal: 0, chemicals: 0 }
    });
    expect(appraiseStellarObject(object, { settings }).value).toBeGreaterThanOrEqual(0);
  });

  test('should capitalize earnings above the floor', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    const result = appraiseStellarObject(object, { settings });

    expect(result.capitalized).toBeGreaterThan(result.floor);
    expect(result.value).toBe(result.capitalized);
  });

  test('should value earnings lower at a higher discount rate', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });

    const cheap = appraiseStellarObject(object, { settings, discountRate: 0.1 });
    const dear = appraiseStellarObject(object, { settings, discountRate: 0.4 });

    expect(dear.value).toBeLessThan(cheap.value);
  });

  test('should be a pure function of its inputs', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    expect(appraiseStellarObject(object, { settings }))
      .toEqual(appraiseStellarObject(object, { settings }));
  });
});

describe('liquidValue', () => {
  test('should count cash in full', () => {
    const corporation = new Corporation('Acme', 'desc', true, 5000);
    expect(liquidValue(corporation, { settings })).toBe(5000);
  });

  test('should haircut inventory', () => {
    const corporation = new Corporation('Acme', 'desc', true, 0);
    corporation.addGoods('wheat', 100);

    const gross = 100 * goodsData.wheat.value;
    const { inventoryLiquidationDiscount } = appraisalConfig(settings);

    // A forced seller dumping stock does not get the prevailing price
    expect(liquidValue(corporation, { settings }))
      .toBeCloseTo(gross * (1 - inventoryLiquidationDiscount), 6);
  });

  test('should exclude stellar objects', () => {
    const corporation = new Corporation('Acme', 'desc', true, 1000);
    corporation.addStellarObject(1);

    // A world cannot be sold before a maturity date arrives, which is exactly
    // why a balloon is dangerous to a property-rich corporation
    expect(liquidValue(corporation, { settings })).toBe(1000);
  });
});

describe('defaultProbability', () => {
  /**
   * Build a corporation carrying one dated loan.
   * @param {Object} options - `{ cash, principal, maturityTick }`.
   * @returns {Object} The corporation.
   */
  function indebted({ cash, principal, maturityTick }) {
    const corporation = new Corporation('Acme', 'desc', false, 0);
    const loan = corporation.takeLoan(principal, { originTick: 0, maturityTick });
    loan.remainingBalance = principal;
    corporation.setCashPosition(cash);
    return corporation;
  }

  test('should be zero with no debt', () => {
    const corporation = new Corporation('Acme', 'desc', true, 1000);
    expect(defaultProbability(corporation, { settings, tick: 0 }).probability).toBe(0);
  });

  test('should be zero when liquid assets cover the principal', () => {
    const corporation = indebted({ cash: 60000, principal: 50000, maturityTick: YEAR });
    expect(defaultProbability(corporation, { settings, tick: 0 }).probability).toBe(0);
  });

  test('should be certain for a bankrupt corporation', () => {
    const corporation = indebted({ cash: 0, principal: 50000, maturityTick: YEAR });
    corporation.isBankrupt = true;
    expect(defaultProbability(corporation, { settings, tick: 0 }).probability).toBe(1);
  });

  test('should rise monotonically as maturity approaches with cash held constant', () => {
    const corporation = indebted({ cash: 10000, principal: 100000, maturityTick: YEAR });

    const ticks = [0, YEAR / 4, YEAR / 2, (YEAR * 3) / 4, YEAR];
    const probabilities = ticks.map(
      tick => defaultProbability(corporation, { settings, tick }).probability
    );

    // A shortfall years out can still be traded out of; the same shortfall next
    // week cannot, and this is what makes the balloon cliff priceable
    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]).toBeGreaterThan(probabilities[i - 1]);
    }
  });

  test('should rise as coverage falls at a fixed date', () => {
    const rich = indebted({ cash: 80000, principal: 100000, maturityTick: YEAR });
    const poor = indebted({ cash: 5000, principal: 100000, maturityTick: YEAR });

    const atDate = { settings, tick: YEAR };
    expect(defaultProbability(poor, atDate).probability)
      .toBeGreaterThan(defaultProbability(rich, atDate).probability);
  });

  test('should never exceed the configured maximum', () => {
    const corporation = indebted({ cash: 0, principal: 100000, maturityTick: YEAR });
    const { probability } = defaultProbability(corporation, { settings, tick: YEAR * 2 });

    expect(probability).toBeLessThanOrEqual(appraisalConfig(settings).maxDefaultProbability);
  });

  test('should treat undated debt as a warning rather than a cliff', () => {
    const corporation = new Corporation('Acme', 'desc', false, 0);
    const loan = corporation.takeLoan(100000);
    loan.maturityTick = 0;
    corporation.setCashPosition(0);

    const { probability, ticksToMaturity } = defaultProbability(
      corporation, { settings, tick: YEAR }
    );

    expect(ticksToMaturity).toBe(Infinity);
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThan(0.6);
  });

  test('should report the figures behind the estimate', () => {
    const corporation = indebted({ cash: 25000, principal: 100000, maturityTick: YEAR });
    const result = defaultProbability(corporation, { settings, tick: 0 });

    expect(result.principal).toBe(100000);
    expect(result.liquid).toBe(25000);
    expect(result.coverage).toBeCloseTo(0.25, 6);
  });
});

describe('discountRateFor', () => {
  test('should be the base rate for a debt-free corporation', () => {
    const corporation = new Corporation('Acme', 'desc', true, 1000);
    expect(discountRateFor(corporation, { settings, tick: 0 }))
      .toBe(appraisalConfig(settings).baseDiscountRate);
  });

  test('should widen with default risk', () => {
    const corporation = new Corporation('Acme', 'desc', false, 0);
    corporation.takeLoan(100000, { originTick: 0, maturityTick: ticksPerQuarter(settings) });
    corporation.setCashPosition(0);

    // Credit risk widens the rate rather than being a separate haircut, so it
    // compounds through the valuation the way real credit risk does
    expect(discountRateFor(corporation, { settings, tick: ticksPerQuarter(settings) }))
      .toBeGreaterThan(appraisalConfig(settings).baseDiscountRate);
  });
});

describe('appraiseCorporation', () => {
  test('should value an empty corporation at nothing', () => {
    const corporation = new Corporation('Acme', 'desc', true, 0);
    expect(appraiseCorporation(corporation, { universe: makeUniverse([]), settings }).value)
      .toBe(0);
  });

  test('should include cash, inventory and owned worlds', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    const corporation = new Corporation('Acme', 'desc', true, 5000);
    corporation.addStellarObject(1);
    corporation.addGoods('wheat', 100);

    const result = appraiseCorporation(corporation, {
      universe: makeUniverse([object]), settings, tick: 0
    });

    expect(result.cash).toBe(5000);
    expect(result.inventoryValue).toBe(100 * goodsData.wheat.value);
    expect(result.propertyValue).toBeGreaterThan(0);
    expect(result.value).toBe(result.assets - result.debt);
  });

  test('should subtract debt', () => {
    const object = makeObject();
    const corporation = new Corporation('Acme', 'desc', true, 0);
    corporation.addStellarObject(1);

    const before = appraiseCorporation(corporation, {
      universe: makeUniverse([object]), settings, tick: 0
    }).value;

    corporation.takeLoan(20000, { originTick: 0, maturityTick: YEAR });

    const after = appraiseCorporation(corporation, {
      universe: makeUniverse([object]), settings, tick: 0
    });

    // The loan adds cash and debt together, leaving the owner no better off
    expect(after.value).toBe(before);
    expect(after.debt).toBe(20000);
  });

  test('should ignore worlds it does not own', () => {
    const owned = makeMetalWorld({ id: 1, buildings: { Mine: { count: 1 } } });
    const other = makeMetalWorld({ id: 2, buildings: { Mine: { count: 9 } } });

    const corporation = new Corporation('Acme', 'desc', true, 0);
    corporation.addStellarObject(1);

    const result = appraiseCorporation(corporation, {
      universe: makeUniverse([owned, other]), settings, tick: 0
    });

    expect(result.propertyValue)
      .toBe(appraiseStellarObject(owned, {
        settings, discountRate: result.discountRate
      }).value);
  });

  test('should tolerate a missing universe or owned object', () => {
    const corporation = new Corporation('Acme', 'desc', true, 100);
    corporation.addStellarObject(999);

    expect(appraiseCorporation(corporation, { settings }).value).toBe(100);
    expect(appraiseCorporation(corporation, { universe: makeUniverse([]), settings }).value)
      .toBe(100);
  });

  test('should include ships when values are supplied', () => {
    const corporation = new Corporation('Acme', 'desc', true, 0);
    corporation.addShip(7);

    const result = appraiseCorporation(corporation, {
      universe: makeUniverse([]), settings, shipValues: { 7: 4200 }
    });

    expect(result.fleetValue).toBe(4200);
  });

  test('should value a distressed corporation below an identical healthy one', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    const universe = makeUniverse([object]);

    const healthy = new Corporation('Healthy', 'desc', false, 200000);
    healthy.addStellarObject(1);

    const distressed = new Corporation('Distressed', 'desc', false, 0);
    distressed.addStellarObject(1);
    distressed.takeLoan(200000, { originTick: 0, maturityTick: ticksPerQuarter(settings) });
    distressed.setCashPosition(0);

    const atRisk = { universe, settings, tick: ticksPerQuarter(settings) };

    // Same operations, but cash flows that may never arrive are worth less
    expect(appraiseCorporation(distressed, atRisk).propertyValue)
      .toBeLessThan(appraiseCorporation(healthy, atRisk).propertyValue);
  });

  test('should be a pure function of its inputs', () => {
    const object = makeObject({ buildings: { Farm: { count: 2 } } });
    const corporation = new Corporation('Acme', 'desc', true, 1000);
    corporation.addStellarObject(1);

    const context = { universe: makeUniverse([object]), settings, tick: 500 };
    expect(appraiseCorporation(corporation, context))
      .toEqual(appraiseCorporation(corporation, context));
  });

  test('should disagree with book value, which is the point', () => {
    const object = makeMetalWorld({ buildings: { Mine: { count: 1 } } });
    const universe = makeUniverse([object]);
    const corporation = new Corporation('Acme', 'desc', true, 0);
    corporation.addStellarObject(1);

    // The ledger says what a world cost; appraisal says what it earns
    expect(appraiseCorporation(corporation, { universe, settings, tick: 0 }).value)
      .not.toBe(corporation.calculateTotalValue(universe));
  });
});

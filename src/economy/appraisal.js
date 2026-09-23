const { loadContent } = require('../contentCache');
const { ticksPerDay, ticksPerYear } = require('./clock');
const { restockConfig, idealStockFor } = require('./restock');
const { corporationHolder } = require('./accounts');
const { numericReader } = require('../settings');
const {
  EXTRACTION_RATINGS,
  productionConfig,
  rawGoodsInCategory,
  resolveInputGoods
} = require('./production');

/**
 * Appraisal: what a stellar object or a corporation is worth.
 *
 * **This module must never see a share price.** It does not import the
 * exchange, it takes no price argument, and nothing in its inputs carries one.
 * That is the whole defence against reflexivity, and it is structural rather
 * than a matter of discipline.
 *
 * The hazard it avoids: book value includes stellar objects, so if those were
 * appraised against market comparables while the market priced companies on
 * their book value, the two would drive each other. Prices would explode or
 * oscillate for no reason connected to anything happening in the game.
 *
 * Instead an object is worth the discounted cash flows it can generate at
 * prevailing *goods* prices. Goods prices come from local supply and demand,
 * which no amount of share trading can move, so the loop is broken at its root.
 *
 * Valuation is deliberately separate from the ledger's book value. The ledger
 * says what something cost; appraisal says what it is worth. A developed world
 * carried at the credits spent building it is not the same as one earning
 * steadily, and the exchange needs the second number.
 *
 * **Known calibration gap.** Measured against the simulation over settled
 * quarters, this model reproduces the right *shape* -- returns flat against
 * building count once inputs bind, rather than rising with it -- but overstates
 * the *level* by roughly two and a half times. The cause is that revenue is
 * taken at reference prices while the simulation transacts at local market
 * prices, which sit below reference wherever a good is in surplus. Relative
 * valuations are therefore sound and absolute ones are optimistic. Calibrate
 * once investor agents exist and there is something to calibrate against.
 */

/**
 * Read appraisal configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Appraisal configuration.
 * @example
 * const config = appraisalConfig(game.getSettings());
 */
function appraisalConfig(settings = {}) {
  const read = numericReader(settings, 'appraisal');
  return {
    baseDiscountRate: read('base_discount_rate'),
    distressSpread: read('distress_spread'),
    inventoryLiquidationDiscount: read('inventory_liquidation_discount'),
    infrastructureFloorWeight: read('infrastructure_floor_weight'),
    maxDefaultProbability: read('max_default_probability')
  };
}

/**
 * Build a reference price for every good from the content data.
 *
 * Base value is used rather than any one market's quote, because a good's worth
 * to a corporation is not what a single world happens to pay for it today. A
 * caller with a better reference can supply its own map.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Map of good name to reference price.
 * @example
 * const prices = referenceGoodsPrices(game.getSettings());
 */
function referenceGoodsPrices(settings = {}) {
  const goodsData = loadContent('goods', settings.data_directory || 'data/default/en-us');
  const prices = {};
  Object.keys(goodsData).forEach(goodName => {
    prices[goodName] = Number(goodsData[goodName].value) || 0;
  });
  return prices;
}

/**
 * Average reference price across the raw goods of a category.
 * @param {Object} goodsData - Parsed goods.json.
 * @param {Object} prices - Map of good name to price.
 * @param {string} category - Good category.
 * @returns {number} Mean price, or 0 when the category has no raw goods.
 * @example
 * categoryPrice(goodsData, prices, 'food');
 */
function categoryPrice(goodsData, prices, category) {
  const goods = rawGoodsInCategory(goodsData, category);
  if (goods.length === 0) {
    return 0;
  }
  const total = goods.reduce((sum, name) => sum + (Number(prices[name]) || 0), 0);
  return total / goods.length;
}

/**
 * Estimate a stellar object's net cash flow per day at prevailing goods prices.
 *
 * Mirrors what `production.js` and `restock.js` actually do, because an
 * appraisal that models the economy differently from the simulation produces a
 * fair value the market can never converge on.
 *
 * The population is a customer, not an overhead. It buys its food whether the
 * world grows it or imports it, so local demand is revenue either way, and a
 * world short of food earns the retail margin rather than losing the whole
 * value of what it eats. Surplus beyond local demand is exported to the wider
 * galaxy at a discount, and shortfalls are imported at a markup, exactly as
 * restocking does.
 *
 * Output is capped by input supply, which is the difference between an
 * appraisal that works and one that is wildly wrong. Buildings consume inputs,
 * and a world that does not make its own can only obtain them at the rate
 * restocking delivers. Ignoring that valued eight farms at eight times one
 * farm, when in the simulation they earn the same because seven of them sit
 * idle waiting for chemicals.
 * @param {Object} stellarObject - Object to appraise.
 * @param {Object} context - Appraisal context.
 * @param {Object} context.settings - Resolved game settings.
 * @param {Object} [context.goodsPrices] - Reference prices; defaults to base values.
 * @returns {Object} `{ revenuePerDay, costPerDay, netPerDay }`.
 * @example
 * const flow = estimateDailyCashFlow(object, { settings });
 */
function estimateDailyCashFlow(stellarObject, { settings, goodsPrices }) {
  const dataDir = settings?.data_directory || 'data/default/en-us';
  const goodsData = loadContent('goods', dataDir);
  const buildingsData = loadContent('buildings', dataDir);
  const prices = goodsPrices || referenceGoodsPrices(settings);
  const config = productionConfig(settings);
  const trade = restockConfig(settings);

  let revenuePerDay = 0;
  let costPerDay = 0;

  // First pass: what the buildings would produce and consume at full tilt,
  // before any input constraint is applied.
  const grossByCategory = {};
  const requiredByGood = {};
  let grossOperatingCost = 0;

  Object.entries(stellarObject.buildings || {}).forEach(([buildingType, built]) => {
    const count = Number(built?.count) || 0;
    const definition = buildingsData[buildingType];
    if (count <= 0 || !definition) {
      return;
    }

    const costs = definition.operationCosts || {};

    Object.entries(EXTRACTION_RATINGS).forEach(([ratingField, category]) => {
      const rating = Number(definition[ratingField]) || 0;
      if (rating <= 0) {
        return;
      }

      const modifier = Number(stellarObject.productivityModifiers?.[category]) || 0;
      const units = rating * modifier * config.unitsPerPointPerDay * count;
      if (units <= 0) {
        return;
      }

      grossByCategory[category] = (grossByCategory[category] || 0) + units;

      grossOperatingCost += ((Number(costs.staff) || 0) * config.staffWagePerDay
        + (Number(costs.energy) || 0) * config.energyCostPerUnitPerDay) * count;

      Object.entries(costs.goods || {}).forEach(([key, perDay]) => {
        const required = (Number(perDay) || 0) * count;
        if (required > 0) {
          requiredByGood[key] = (requiredByGood[key] || 0) + required;
        }
      });
    });
  });

  // How much of each input this world can actually obtain per day: whatever it
  // makes itself, plus what restocking can deliver. Restocking closes a
  // fraction of the gap to ideal stock each day, so its sustained throughput
  // tops out at that fraction of the ideal level.
  const inputSupplyFor = (key) => {
    const candidates = resolveInputGoods(goodsData, key);
    if (candidates.length === 0) {
      return 0;
    }

    const restockInflow = candidates.reduce(
      (sum, name) => sum + (idealStockFor(stellarObject, goodsData[name]) * trade.dailyGapFraction),
      0
    );

    const localCategories = new Set(candidates.map(name => goodsData[name].category));
    const locallyMade = [...localCategories].reduce(
      (sum, category) => sum + (grossByCategory[category] || 0),
      0
    );

    return restockInflow + locallyMade;
  };

  let inputRatio = 1;
  Object.entries(requiredByGood).forEach(([key, required]) => {
    inputRatio = Math.min(inputRatio, inputSupplyFor(key) / required);
  });
  inputRatio = Math.max(0, Math.min(1, inputRatio));

  const producedByCategory = {};
  Object.entries(grossByCategory).forEach(([category, units]) => {
    producedByCategory[category] = units * inputRatio;
  });

  // A part-run costs proportionally less in wages and energy
  costPerDay += grossOperatingCost * inputRatio;

  Object.entries(requiredByGood).forEach(([key, required]) => {
    const candidates = resolveInputGoods(goodsData, key);
    const unitPrice = candidates.length > 0
      ? candidates.reduce((sum, name) => sum + (Number(prices[name]) || 0), 0) / candidates.length
      : 0;
    costPerDay += required * inputRatio * unitPrice;
  });

  const population = Number(stellarObject.population?.current) || 0;
  const perPerson = Number(settings?.food_per_person) || 1;
  const foodDemand = population > 0
    ? (population / 1e9) * config.foodPerBillionPerDay * perPerson
    : 0;

  const categories = new Set([...Object.keys(producedByCategory), 'food']);

  categories.forEach(category => {
    const price = categoryPrice(goodsData, prices, category);
    if (price <= 0) {
      return;
    }

    const produced = producedByCategory[category] || 0;
    const localDemand = category === 'food' ? foodDemand : 0;

    // The population pays the local price for everything it consumes
    revenuePerDay += localDemand * price;

    const shortfall = Math.max(0, localDemand - produced);
    if (shortfall > 0) {
      costPerDay += shortfall * price * (1 + trade.importMarkup);
    }

    const surplus = Math.max(0, produced - localDemand);
    if (surplus > 0) {
      revenuePerDay += surplus * price * (1 - trade.exportDiscount);
    }
  });

  return { revenuePerDay, costPerDay, netPerDay: revenuePerDay - costPerDay, inputRatio };
}

/**
 * Appraise a stellar object.
 *
 * Worth is the capitalized value of what it can earn, plus a floor for the
 * infrastructure itself: a world with idle buildings is not worthless, it is
 * waiting for an operator. An object losing money is worth less than its
 * infrastructure but never less than nothing, since it can be abandoned.
 * @param {Object} stellarObject - Object to appraise.
 * @param {Object} context - Appraisal context.
 * @param {Object} context.settings - Resolved game settings.
 * @param {Object} [context.goodsPrices] - Reference prices; defaults to base values.
 * @param {number} [context.discountRate] - Override the base discount rate.
 * @returns {Object} `{ value, cashFlow, floor, capitalized }`.
 * @example
 * const { value } = appraiseStellarObject(object, { settings });
 */
function appraiseStellarObject(stellarObject, context = {}) {
  const settings = context.settings || {};
  const config = appraisalConfig(settings);
  const discountRate = Number.isFinite(context.discountRate) && context.discountRate > 0
    ? context.discountRate
    : config.baseDiscountRate;

  const cashFlow = estimateDailyCashFlow(stellarObject, {
    settings,
    goodsPrices: context.goodsPrices
  });

  const daysPerYear = ticksPerYear(settings) / ticksPerDay(settings);
  const annualNet = cashFlow.netPerDay * daysPerYear;
  const capitalized = discountRate > 0 ? annualNet / discountRate : 0;

  // Infrastructure retains value independent of who is running it
  const floor = (Number(stellarObject.value) || 0) * config.infrastructureFloorWeight;

  return {
    value: Math.round(Math.max(floor, capitalized)),
    cashFlow,
    floor: Math.round(floor),
    capitalized: Math.round(capitalized)
  };
}

/**
 * Estimate what a corporation could raise by liquidating quickly.
 *
 * Cash counts in full. Inventory takes a haircut, because a forced seller
 * dumping stock into local markets does not get the prevailing price for it.
 * Stellar objects are excluded: a world cannot be sold before a maturity date
 * arrives, which is exactly why a balloon loan is dangerous to a corporation
 * whose wealth is all tied up in property.
 * @param {Object} corporation - Corporation to assess.
 * @param {Object} context - Appraisal context.
 * @param {Object} context.settings - Resolved game settings.
 * @param {Object} [context.goodsPrices] - Reference prices; defaults to base values.
 * @returns {number} Liquid value available to meet debts.
 * @example
 * const liquid = liquidValue(corporation, { settings });
 */
function liquidValue(corporation, context = {}) {
  const settings = context.settings || {};
  const config = appraisalConfig(settings);
  const prices = context.goodsPrices || referenceGoodsPrices(settings);

  const cash = Number(corporation.getTotalCashReserves?.() ?? corporation.cashReserves ?? 0) || 0;

  let inventory = 0;
  Object.entries(corporation.goods || {}).forEach(([goodName, quantity]) => {
    inventory += (Number(prices[goodName]) || 0) * (Number(quantity) || 0);
  });

  return cash + (inventory * (1 - config.inventoryLiquidationDiscount));
}

/**
 * Estimate the probability a corporation defaults on its balloon debt.
 *
 * A balloon loan is a dated, public solvency cliff, and that is what makes
 * credit risk priceable here rather than a vague sense of trouble. Two things
 * drive the estimate: how much of the principal the corporation could cover
 * right now, and how little time is left to close the gap.
 *
 * Distance to maturity matters because a shortfall years out is a problem that
 * trading can still solve, while the same shortfall next week is not. As the
 * date approaches, an uncovered balance converges on a certain default.
 *
 * This is also what makes early repayment a real decision: retiring debt buys a
 * lower discount rate with working capital.
 * @param {Object} corporation - Corporation to assess.
 * @param {Object} context - Appraisal context.
 * @param {Object} context.settings - Resolved game settings.
 * @param {number} context.tick - Current absolute game tick.
 * @param {Object} [context.goodsPrices] - Reference prices; defaults to base values.
 * @returns {Object} `{ probability, coverage, principal, liquid, ticksToMaturity }`.
 * @example
 * const { probability } = defaultProbability(corporation, { settings, tick });
 */
function defaultProbability(corporation, context = {}) {
  const settings = context.settings || {};
  const config = appraisalConfig(settings);
  const tick = Number(context.tick) || 0;

  const loans = Array.isArray(corporation.loans) ? corporation.loans : [];
  const principal = loans.reduce(
    (sum, loan) => sum + (Number(loan.remainingBalance) || 0),
    0
  );

  if (corporation.isBankrupt) {
    return {
      probability: 1,
      coverage: 0,
      principal,
      liquid: 0,
      ticksToMaturity: 0
    };
  }

  if (principal <= 0) {
    return {
      probability: 0,
      coverage: Infinity,
      principal: 0,
      liquid: liquidValue(corporation, context),
      ticksToMaturity: Infinity
    };
  }

  const liquid = liquidValue(corporation, context);
  const coverage = liquid / principal;

  if (coverage >= 1) {
    return { probability: 0, coverage, principal, liquid, ticksToMaturity: 0 };
  }

  // The nearest maturity is the one that bites first
  const maturities = loans
    .filter(loan => (Number(loan.remainingBalance) || 0) > 0 && Number(loan.maturityTick) > 0)
    .map(loan => Number(loan.maturityTick));
  const nearestMaturity = maturities.length > 0 ? Math.min(...maturities) : null;

  const shortfallRatio = 1 - coverage;

  if (nearestMaturity === null) {
    // Undated debt never forces the issue, so a shortfall is only a warning
    return {
      probability: Math.min(config.maxDefaultProbability, shortfallRatio * 0.5),
      coverage,
      principal,
      liquid,
      ticksToMaturity: Infinity
    };
  }

  const ticksToMaturity = Math.max(0, nearestMaturity - tick);
  const horizon = ticksPerYear(settings);

  // Urgency runs from 0 a year or more out to 1 at the maturity tick, so the
  // same shortfall is priced harder the closer the date gets.
  const urgency = horizon > 0
    ? Math.min(1, 1 - (Math.min(ticksToMaturity, horizon) / horizon))
    : 1;

  return {
    probability: Math.min(config.maxDefaultProbability, shortfallRatio * urgency),
    coverage,
    principal,
    liquid,
    ticksToMaturity
  };
}

/**
 * Get the discount rate to value a corporation's cash flows at.
 *
 * A corporation likely to default is worth less than one that is not, even with
 * identical operations, because its future cash flows may never arrive. Default
 * risk widens the rate rather than being applied as a separate haircut, so it
 * compounds through the valuation the way real credit risk does.
 * @param {Object} corporation - Corporation to assess.
 * @param {Object} context - Appraisal context.
 * @returns {number} Annual discount rate as a fraction.
 * @example
 * const rate = discountRateFor(corporation, { settings, tick });
 */
function discountRateFor(corporation, context = {}) {
  const config = appraisalConfig(context.settings || {});
  const { probability } = defaultProbability(corporation, context);
  return config.baseDiscountRate + (probability * config.distressSpread);
}

/**
 * Appraise a corporation.
 *
 * Owned worlds are valued on the cash they can generate, discounted at a rate
 * that widens with the corporation's own default risk. Cash, inventory and
 * ships are added at reference prices, and debt is subtracted, so the result is
 * what an owner's stake is actually worth.
 *
 * Note this can and should disagree with `Corporation.calculateTotalValue()`.
 * That is book value, the credits spent; this is worth, the cash expected. A
 * developed world earning steadily should appraise above what it cost, and an
 * idle one below.
 * @param {Object} corporation - Corporation to appraise.
 * @param {Object} context - Appraisal context.
 * @param {Object} context.universe - Universe holding the stellar objects.
 * @param {Object} context.settings - Resolved game settings.
 * @param {number} [context.tick=0] - Current absolute game tick.
 * @param {Object} [context.goodsPrices] - Reference prices; defaults to base values.
 * @param {Object} [context.shipValues] - Map of ship id to value.
 * @param {Object} [context.costBasis] - Inventory positions, when goods are held
 *   through the economy's cost basis rather than the corporation's own field.
 * @returns {Object} Appraisal breakdown including the final value.
 * @example
 * const { value } = appraiseCorporation(corporation, { universe, settings, tick });
 */
function appraiseCorporation(corporation, context = {}) {
  const settings = context.settings || {};
  const prices = context.goodsPrices || referenceGoodsPrices(settings);
  const discountRate = discountRateFor(corporation, { ...context, settings });

  const universe = context.universe;
  const stellarObjects = Array.isArray(universe?.stellarObjects) ? universe.stellarObjects : [];
  const ownedIds = Array.isArray(corporation.stellarObjects) ? corporation.stellarObjects : [];

  let propertyValue = 0;
  ownedIds.forEach(objectId => {
    const stellarObject = stellarObjects.find(candidate => candidate.id === objectId);
    if (!stellarObject) {
      return;
    }
    propertyValue += appraiseStellarObject(stellarObject, {
      settings,
      goodsPrices: prices,
      discountRate
    }).value;
  });

  // Goods reach a corporation through production and restocking, which record
  // them in the economy's cost basis rather than on `corporation.goods`. Reading
  // only the latter made a company that had converted cash into stock look as
  // though it had simply lost the money.
  let inventoryValue = 0;
  const positions = context.costBasis
    ? context.costBasis.holderPositions(corporationHolder(corporation))
    : (corporation.goods || {});

  Object.entries(positions).forEach(([goodName, position]) => {
    const quantity = typeof position === 'object'
      ? (Number(position.quantity) || 0)
      : (Number(position) || 0);
    inventoryValue += (Number(prices[goodName]) || 0) * quantity;
  });

  const shipValues = context.shipValues || {};
  const fleetValue = (Array.isArray(corporation.ships) ? corporation.ships : [])
    .reduce((sum, shipId) => sum + (Number(shipValues[shipId]) || 0), 0);

  const cash = Number(corporation.getTotalCashReserves?.() ?? corporation.cashReserves ?? 0) || 0;
  const debt = Number(corporation.getOutstandingDebt?.() ?? 0) || 0;

  const assets = propertyValue + inventoryValue + fleetValue + cash;

  return {
    value: Math.round(assets - debt),
    assets: Math.round(assets),
    propertyValue: Math.round(propertyValue),
    inventoryValue: Math.round(inventoryValue),
    fleetValue: Math.round(fleetValue),
    cash: Math.round(cash),
    debt: Math.round(debt),
    discountRate
  };
}

module.exports = {
  appraisalConfig,
  referenceGoodsPrices,
  categoryPrice,
  estimateDailyCashFlow,
  appraiseStellarObject,
  liquidValue,
  defaultProbability,
  discountRateFor,
  appraiseCorporation
};

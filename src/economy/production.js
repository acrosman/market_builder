const { loadContent } = require('../contentCache');
const { ENTRY_KINDS } = require('./ledger');
const { ACCOUNTS, corporationHolder, marketHolder } = require('./accounts');

/**
 * Goods production, operating costs, and population consumption.
 *
 * Nothing in the game produced anything before this: `stellarObject.onTick` had
 * a placeholder, markets never restocked after generation, and the only way to
 * gain credits was arbitrage against a static inventory. With no revenue, a
 * fundamentals-driven exchange would have valued every company at zero forever.
 *
 * Scope, and what is deliberately left out. Only raw extraction is modelled,
 * because that is what the content data supports: Farm and Mine carry `farming`
 * and `mining` ratings, but every building's `manufactorGoods` is an empty
 * array, so there are no manufacturing recipes to drive intermediate or
 * finished goods. Adding those is content authoring, not engine work.
 *
 * Production also requires somewhere to put the output, which today means a
 * market. Asteroids have the `buildings` capability but not `market`, so an ice
 * asteroid with a mine produces nothing until objects get storage of their own.
 */

/**
 * Building rating fields that yield raw goods, mapped to the good category.
 *
 * Recycling is mapped to chemicals so there is a domestic source of the input
 * that Farms and treatment plants consume. Without it, chemicals would only
 * ever come from the stock laid down at world generation and every farm in the
 * universe would grind to a halt once that was used up.
 */
const EXTRACTION_RATINGS = {
  farming: 'food',
  mining: 'metal',
  recycling: 'chemicals'
};

/** Defaults for the production settings block. */
const DEFAULT_PRODUCTION = {
  units_per_point_per_day: 1,
  staff_wage_per_day: 1,
  energy_cost_per_unit_per_day: 2,
  food_consumed_per_billion_people_per_day: 2
};

/**
 * Read the production configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Production configuration.
 * @example
 * const config = productionConfig(game.getSettings());
 */
function productionConfig(settings = {}) {
  const configured = settings.production || {};

  // Zero is a legal value for the cost settings, so fall back only when the
  // configured value is absent or unusable rather than when it is falsy.
  const read = (key) => {
    const value = Number(configured[key]);
    return Number.isFinite(value) ? value : DEFAULT_PRODUCTION[key];
  };

  return {
    unitsPerPointPerDay: read('units_per_point_per_day'),
    staffWagePerDay: read('staff_wage_per_day'),
    energyCostPerUnitPerDay: read('energy_cost_per_unit_per_day'),
    foodPerBillionPerDay: read('food_consumed_per_billion_people_per_day')
  };
}

/**
 * List the raw goods in a category, in a stable order.
 * @param {Object} goodsData - Parsed goods.json.
 * @param {string} category - Good category such as 'food' or 'metal'.
 * @returns {Array<string>} Sorted raw good names.
 * @example
 * rawGoodsInCategory(goods, 'food'); // => ['cotton', 'water', 'wheat', ...]
 */
function rawGoodsInCategory(goodsData, category) {
  return Object.keys(goodsData)
    .filter(name => goodsData[name].category === category && goodsData[name].type === 'raw')
    .sort();
}

/**
 * Resolve an operating-cost key to concrete good names.
 *
 * The content data is ambiguous here: `operationCosts.goods` uses keys like
 * "chemicals", which is both a good and a category, and "food", which is only a
 * category. A key naming a real good resolves to that good; otherwise it is
 * treated as a category and drawn from its raw goods.
 * @param {Object} goodsData - Parsed goods.json.
 * @param {string} key - Operating cost key.
 * @returns {Array<string>} Candidate good names, in stable order.
 * @example
 * resolveInputGoods(goods, 'food'); // => ['cotton', 'water', 'wheat', 'wood', 'yeast']
 */
function resolveInputGoods(goodsData, key) {
  if (goodsData[key]) {
    return [key];
  }
  return rawGoodsInCategory(goodsData, key);
}

/**
 * Determine who operates a stellar object's production.
 *
 * An owning corporation operates and books the results. An independent object
 * is operated by its own local economy.
 * @param {Object} stellarObject - The object producing.
 * @param {Array<Object>} corporations - All corporations in the game.
 * @returns {Object} Holder reference for the operator.
 * @example
 * const operator = operatorHolder(object, game.getCorporations());
 */
function operatorHolder(stellarObject, corporations) {
  const owner = (corporations || []).find(
    corporation => corporation.name && corporation.name === stellarObject.owner
  );
  return owner ? corporationHolder(owner) : marketHolder(stellarObject);
}

/**
 * Take goods out of a market inventory, up to what is present.
 * @param {Object} inventory - Market inventory keyed by good name.
 * @param {Array<string>} candidates - Goods that may satisfy the requirement.
 * @param {number} required - Units required in total.
 * @returns {Object|null} `{ taken: {good: units}, total }`, or null if short.
 * @example
 * const drawn = drawFromInventory(inventory, ['wheat', 'water'], 50);
 */
function drawFromInventory(inventory, candidates, required) {
  const available = candidates.reduce(
    (sum, name) => sum + (Number(inventory[name]) || 0),
    0
  );
  if (available < required) {
    return null;
  }

  const taken = {};
  let remaining = required;

  candidates.forEach(name => {
    if (remaining <= 0) {
      return;
    }
    const units = Math.min(remaining, Number(inventory[name]) || 0);
    if (units > 0) {
      taken[name] = units;
      remaining -= units;
    }
  });

  return { taken, total: required - remaining };
}

/**
 * Run one production cycle for a single stellar object.
 *
 * A cycle covers whole days. Production is daily rather than hourly because a
 * building's hourly output is a fraction of a unit, and goods are integers:
 * rounding every tick would floor almost all output to zero.
 *
 * Output enters inventory at what it cost to make -- wages, energy, and the
 * goods consumed -- so the operator has a real cost basis and selling it shows
 * a real margin. Without that, every producer would look infinitely profitable.
 *
 * A building that cannot obtain its inputs simply does not run that cycle.
 * @param {Object} params - Cycle parameters.
 * @param {Object} params.economy - EconomyState to record into.
 * @param {Object} params.stellarObject - Object to run production for.
 * @param {Array<Object>} params.corporations - All corporations, to find the owner.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.days - Whole days elapsed.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} Summary as `{ produced, consumed, creditsSpent }`.
 * @example
 * runProduction({ economy, stellarObject, corporations, settings, days: 1, tick: 24 });
 */
function runProduction({ economy, stellarObject, corporations, settings, days, tick }) {
  const summary = { produced: {}, consumed: {}, creditsSpent: 0 };

  const inventory = stellarObject.marketState?.inventory;
  if (!inventory || days <= 0) {
    return summary;
  }

  const dataDir = settings.data_directory || 'data/default/en-us';
  const goodsData = loadContent('goods', dataDir);
  const buildingsData = loadContent('buildings', dataDir);
  const config = productionConfig(settings);

  const operator = operatorHolder(stellarObject, corporations);
  const locals = marketHolder(stellarObject);

  Object.entries(stellarObject.buildings || {}).forEach(([buildingType, built]) => {
    const count = Number(built?.count) || 0;
    const definition = buildingsData[buildingType];
    if (count <= 0 || !definition) {
      return;
    }

    Object.entries(EXTRACTION_RATINGS).forEach(([ratingField, category]) => {
      const rating = Number(definition[ratingField]) || 0;
      if (rating <= 0) {
        return;
      }

      const modifier = Number(stellarObject.productivityModifiers?.[category]) || 0;
      const outputUnits = Math.floor(
        rating * modifier * config.unitsPerPointPerDay * count * days
      );
      if (outputUnits <= 0) {
        return;
      }

      const outputs = rawGoodsInCategory(goodsData, category);
      if (outputs.length === 0) {
        return;
      }

      const costs = definition.operationCosts || {};
      const fullCreditCost = ((Number(costs.staff) || 0) * config.staffWagePerDay
        + (Number(costs.energy) || 0) * config.energyCostPerUnitPerDay)
        * count * days;

      // Scale the run to whatever inputs can actually be obtained rather than
      // refusing to run at all. All-or-nothing meant a farm short of chemicals
      // produced nothing whatever, which killed the economy on worlds that do
      // not make their own inputs instead of merely making them poorer.
      const requirements = Object.entries(costs.goods || {})
        .map(([key, perDay]) => ({
          candidates: resolveInputGoods(goodsData, key),
          required: Math.ceil((Number(perDay) || 0) * count * days)
        }))
        .filter(requirement => requirement.required > 0);

      let inputRatio = 1;
      requirements.forEach(({ candidates, required }) => {
        const available = candidates.reduce(
          (sum, name) => sum + (Number(inventory[name]) || 0),
          0
        );
        inputRatio = Math.min(inputRatio, available / required);
      });

      if (inputRatio <= 0) {
        return;
      }

      const scaledOutput = Math.floor(outputUnits * inputRatio);
      if (scaledOutput <= 0) {
        return;
      }

      const draws = [];
      requirements.forEach(({ candidates, required }) => {
        const scaled = Math.floor(required * inputRatio);
        if (scaled <= 0) {
          return;
        }
        const drawn = drawFromInventory(inventory, candidates, scaled);
        if (drawn) {
          draws.push(drawn);
        }
      });

      // A part-run costs proportionally less in wages and energy
      const creditCost = Math.round(fullCreditCost * inputRatio);

      const costBasis = economy.getCostBasis();
      const ledger = economy.getLedger();
      let inputCost = 0;

      draws.forEach(({ taken }) => {
        Object.entries(taken).forEach(([goodName, units]) => {
          inventory[goodName] -= units;
          const { cost } = costBasis.consume(operator, goodName, units);
          inputCost += cost;
          summary.consumed[goodName] = (summary.consumed[goodName] || 0) + units;
        });
      });

      // Consumed inputs need no ledger entry: their cost moves from the input
      // goods' basis into the output goods' basis, so the operator's total
      // inventory value is unchanged by the conversion itself.
      const entries = [];

      if (creditCost > 0) {
        // Wages and energy are paid to the local economy, so the credits move
        // rather than vanishing, and a developed world enriches its own market
        entries.push({
          tick,
          amount: creditCost,
          debit: { holder: operator, account: ACCOUNTS.INVENTORY },
          credit: { holder: operator, account: ACCOUNTS.CASH },
          kind: ENTRY_KINDS.PRODUCTION_OUTPUT,
          refs: { stellarObjectId: stellarObject.id, buildingType }
        });
        entries.push({
          tick,
          amount: creditCost,
          debit: { holder: locals, account: ACCOUNTS.CASH },
          credit: { holder: locals, account: ACCOUNTS.REVENUE },
          kind: ENTRY_KINDS.PRODUCTION_OUTPUT,
          refs: { stellarObjectId: stellarObject.id, buildingType }
        });
      }

      if (entries.length > 0) {
        ledger.postMany(entries);
      }

      // Split output evenly across the category's raw goods, with any remainder
      // going to the first, so the result is deterministic and nothing is lost.
      const perGood = Math.floor(scaledOutput / outputs.length);
      const unitRemainder = scaledOutput - (perGood * outputs.length);
      const totalCost = inputCost + creditCost;

      const allocation = outputs
        .map((goodName, index) => ({
          goodName,
          units: index === 0 ? perGood + unitRemainder : perGood
        }))
        .filter(entry => entry.units > 0);

      // Distribute cost so the shares sum to exactly totalCost. Rounding each
      // share independently leaves the cost basis and the ledger's INVENTORY
      // balance disagreeing by a credit or two per run, which compounds into a
      // real divergence over thousands of production cycles.
      let costRemaining = totalCost;
      allocation.forEach((entry, index) => {
        const share = index === allocation.length - 1
          ? costRemaining
          : Math.round((totalCost * entry.units) / scaledOutput);

        const applied = Math.max(0, Math.min(share, costRemaining));
        costRemaining -= applied;

        inventory[entry.goodName] = (Number(inventory[entry.goodName]) || 0) + entry.units;
        costBasis.acquire(operator, entry.goodName, entry.units, applied);
        summary.produced[entry.goodName] =
          (summary.produced[entry.goodName] || 0) + entry.units;
      });

      summary.creditsSpent += creditCost;
    });
  });

  return summary;
}

/**
 * Consume food for a stellar object's population.
 *
 * This is the demand side, and the reason prices can mean-revert rather than
 * drifting down forever as production piles up. It also puts the long-unused
 * `food_per_person` setting to work.
 *
 * Population is measured in billions on some worlds, so consumption is scaled
 * per thousand people. Unmet demand is not modelled as starvation yet: the
 * shortfall is simply not eaten, and the resulting low stock raises the local
 * price, which is the signal that draws a trader there.
 * @param {Object} params - Consumption parameters.
 * @param {Object} params.economy - EconomyState to record into.
 * @param {Object} params.stellarObject - Object whose population eats.
 * @param {Array<Object>} params.corporations - All corporations, to find the owner.
 * @param {Object} params.settings - Resolved game settings.
 * @param {number} params.days - Whole days elapsed.
 * @param {number} params.tick - Current absolute game tick.
 * @returns {Object} Summary as `{ consumed, shortfall }`.
 * @example
 * consumeFood({ economy, stellarObject, corporations, settings, days: 1, tick: 24 });
 */
function consumeFood({ economy, stellarObject, corporations, settings, days, tick }) {
  const summary = { consumed: {}, shortfall: 0 };

  const inventory = stellarObject.marketState?.inventory;
  const population = Number(stellarObject.population?.current) || 0;
  if (!inventory || days <= 0 || population <= 0) {
    return summary;
  }

  const dataDir = settings.data_directory || 'data/default/en-us';
  const goodsData = loadContent('goods', dataDir);
  const config = productionConfig(settings);

  const perPerson = Number(settings.food_per_person) || 1;
  // Scaled per billion, not per person. A traded unit is a shipment, and a
  // world of tens of billions feeds nearly all of itself locally. What reaches
  // the market is the surplus or the shortfall, not the whole food supply.
  const required = Math.floor(
    (population / 1e9) * config.foodPerBillionPerDay * perPerson * days
  );
  if (required <= 0) {
    return summary;
  }

  // Eat the cheapest goods first. The food category also holds cotton and wood,
  // which are not really edible, and ordering by value naturally reaches for
  // water and wheat before them without hardcoding a list of staples.
  const foodGoods = rawGoodsInCategory(goodsData, 'food')
    .sort((a, b) => (Number(goodsData[a].value) || 0) - (Number(goodsData[b].value) || 0));
  const available = foodGoods.reduce(
    (sum, name) => sum + (Number(inventory[name]) || 0),
    0
  );
  const eaten = Math.min(required, available);
  summary.shortfall = required - eaten;

  if (eaten <= 0) {
    return summary;
  }

  const holder = operatorHolder(stellarObject, corporations);
  const costBasis = economy.getCostBasis();
  let remaining = eaten;
  let cost = 0;

  foodGoods.forEach(goodName => {
    if (remaining <= 0) {
      return;
    }
    const units = Math.min(remaining, Number(inventory[goodName]) || 0);
    if (units <= 0) {
      return;
    }
    inventory[goodName] -= units;
    remaining -= units;
    cost += costBasis.consume(holder, goodName, units).cost;
    summary.consumed[goodName] = units;
  });

  if (cost > 0) {
    // Food eaten leaves the books as an operating cost rather than a sale
    economy.getLedger().post({
      tick,
      amount: cost,
      debit: { holder, account: ACCOUNTS.OPERATING_EXPENSE },
      credit: { holder, account: ACCOUNTS.INVENTORY },
      kind: ENTRY_KINDS.PRODUCTION_OUTPUT,
      refs: { stellarObjectId: stellarObject.id, reason: 'population_consumption' }
    });
  }

  return summary;
}

module.exports = {
  EXTRACTION_RATINGS,
  DEFAULT_PRODUCTION,
  productionConfig,
  rawGoodsInCategory,
  resolveInputGoods,
  operatorHolder,
  drawFromInventory,
  runProduction,
  consumeFood
};

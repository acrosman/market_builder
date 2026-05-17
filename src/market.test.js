const fs = require('fs');
const path = require('path');
const { Market } = require('./market');
const { Player } = require('./player');

describe('Market Class', () => {
  /**
   * Helper function to create test market with stellar object
   */
  function createTestMarketSetup() {
    const { Universe, System } = require('./universe');
    const universe = new Universe();
    const system1 = new System(1, 'Test System');
    universe.systems.push(system1);

    // Create a stellar object with market capability
    const { StellarObject } = require('./stellarObject');
    const dataDir = 'data/default/en-us';
    const stellarObjectsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
    );

    const planetData = stellarObjectsData.Planet;
    const stellarObject = new StellarObject(
      1,
      'Planet',
      'Earth-like',
      1,
      planetData,
      'Test Planet',
      dataDir
    );

    universe.stellarObjects.push(stellarObject);

    const settings = {
      starting_credits: 10000,
      initial_ship: 'Cargo Hauler',
      data_directory: dataDir
    };

    const market = new Market(universe, settings);
    const player = new Player('Test Captain', settings);
    player.location = 1;
    player.landedOn = 1;

    // Initialize markets
    market.initializeMarkets();

    // Override market inventory to control exact amounts for testing
    stellarObject.marketState.inventory = {
      wheat: 100,
      water: 50,
      bread: 20
    };
    stellarObject.marketState.prices = {
      wheat: 10,
      water: 8,
      bread: 40
    };

    return { market, player, stellarObject, universe, settings };
  }

  describe('initializeMarkets', () => {
    test('initializes markets for stellar objects with market capability', () => {
      const setup = createTestMarketSetup();
      const stellarObject = setup.stellarObject;

      expect(stellarObject.marketState).toBeDefined();
      expect(stellarObject.marketState.inventory).toBeDefined();
      expect(stellarObject.marketState.prices).toBeDefined();
    });
  });

  describe('buyGood', () => {
    test('successfully buys goods when all conditions are met', () => {
      const { market, player, stellarObject } = createTestMarketSetup();

      const result = market.buyGood(player, 1, 'wheat', 10);

      expect(result.success).toBe(true);
      expect(player.cargo.wheat).toBe(10);
      expect(stellarObject.marketState.inventory.wheat).toBe(90);
    });

    test('fails when stellar object not found', () => {
      const { market, player } = createTestMarketSetup();

      const result = market.buyGood(player, 999, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('fails when no market available', () => {
      const { Universe, System } = require('./universe');
      const universe = new Universe();
      const system1 = new System(1, 'Test System');
      universe.systems.push(system1);

      const { StellarObject } = require('./stellarObject');
      const dataDir = 'data/default/en-us';
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
      );

      // Create asteroid without market capability
      const asteroidData = stellarObjectsData.Asteroid;
      const asteroid = new StellarObject(
        2,
        'Asteroid',
        'Ice',
        1,
        asteroidData,
        'Test Asteroid',
        dataDir
      );
      asteroid.marketState = null; // No market

      universe.stellarObjects.push(asteroid);

      const settings = {
        starting_credits: 10000,
        initial_ship: 'Cargo Hauler',
        data_directory: dataDir
      };

      const market = new Market(universe, settings);
      const player = new Player('Test Captain', settings);

      const result = market.buyGood(player, 2, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No market available at this location');
    });

    test('fails when insufficient goods available', () => {
      const { market, player } = createTestMarketSetup();

      const result = market.buyGood(player, 1, 'wheat', 200);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Only');
    });

    test('fails when insufficient credits', () => {
      const { market, player } = createTestMarketSetup();
      player.credits = 10; // Not enough for purchase

      const result = market.buyGood(player, 1, 'wheat', 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient credits');
    });

    test('fails when insufficient cargo space', () => {
      const { market, player } = createTestMarketSetup();
      // Fill cargo to near capacity
      player.cargo.wheat = 1000;

      const result = market.buyGood(player, 1, 'water', 50);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient cargo space');
    });

    test('fails when good is unknown', () => {
      const { market, player } = createTestMarketSetup();

      const result = market.buyGood(player, 1, 'unknown_item', 10);

      expect(result.success).toBe(false);
      // Unknown goods show as 0 available inventory
      expect(result.message).toContain('Only 0 units available');
    });
  });

  describe('sellGood', () => {
    test('successfully sells goods when all conditions are met', () => {
      const { market, player, stellarObject } = createTestMarketSetup();
      player.cargo.wheat = 20;
      const initialCredits = player.credits;

      const result = market.sellGood(player, 1, 'wheat', 10);

      expect(result.success).toBe(true);
      expect(player.cargo.wheat).toBe(10);
      expect(player.credits).toBeGreaterThan(initialCredits);
      expect(stellarObject.marketState.inventory.wheat).toBe(110);
    });

    test('removes cargo entry when selling all units', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.wheat = 10;

      const result = market.sellGood(player, 1, 'wheat', 10);

      expect(result.success).toBe(true);
      expect(player.cargo.wheat).toBeUndefined();
    });

    test('fails when stellar object not found', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.wheat = 10;

      const result = market.sellGood(player, 999, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('fails when no market available', () => {
      const { Universe, System } = require('./universe');
      const universe = new Universe();
      const system1 = new System(1, 'Test System');
      universe.systems.push(system1);

      const { StellarObject } = require('./stellarObject');
      const dataDir = 'data/default/en-us';
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', dataDir, 'stellarObjects.json'), 'utf-8')
      );

      const asteroidData = stellarObjectsData.Asteroid;
      const asteroid = new StellarObject(
        2,
        'Asteroid',
        'Ice',
        1,
        asteroidData,
        'Test Asteroid',
        dataDir
      );
      asteroid.marketState = null;

      universe.stellarObjects.push(asteroid);

      const settings = {
        starting_credits: 10000,
        initial_ship: 'Cargo Hauler',
        data_directory: dataDir
      };

      const market = new Market(universe, settings);
      const player = new Player('Test Captain', settings);
      player.cargo.wheat = 10;

      const result = market.sellGood(player, 2, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No market available at this location');
    });

    test('fails when player does not have enough goods', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.wheat = 5;

      const result = market.sellGood(player, 1, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('You only have');
    });

    test('fails when player has no goods at all', () => {
      const { market, player } = createTestMarketSetup();

      const result = market.sellGood(player, 1, 'wheat', 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('You only have 0 units');
    });
  });

  describe('calculateCargoUsed', () => {
    test('calculates cargo for goods in metric tons', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.wheat = 10; // Wheat is measured in metric tons

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBeGreaterThan(0);
    });

    test('calculates cargo for goods in kilograms', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.water = 10; // Water might be in kilograms

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBeGreaterThan(0);
    });

    test('calculates cargo for passengers (10 per ton)', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.passengers = 100; // 100 passengers = 10 tons

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBe(10);
    });

    test('calculates total cargo for mixed goods and passengers', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.wheat = 10;
      player.cargo.passengers = 50; // 5 tons

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBeGreaterThan(5);
    });

    test('returns 0 for empty cargo', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo = {};

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBe(0);
    });

    test('handles unknown goods gracefully', () => {
      const { market, player } = createTestMarketSetup();
      player.cargo.unknown_good = 10;

      const cargoUsed = market.calculateCargoUsed(player);

      // Should not crash, might be 0 if good not found
      expect(typeof cargoUsed).toBe('number');
    });
  });

  describe('calculateMarketPrice', () => {
    test('calculates prices based on supply and demand', () => {
      const { market, stellarObject } = createTestMarketSetup();

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
      expect(typeof price).toBe('number');
    });

    test('sell prices are lower than buy prices', () => {
      const { market, stellarObject } = createTestMarketSetup();

      const buyPrice = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');
      const sellPrice = market.calculateMarketPrice(stellarObject, 'wheat', 'sell');

      expect(sellPrice).toBeLessThan(buyPrice);
    });

    test('returns 0 for unknown goods', () => {
      const { market, stellarObject } = createTestMarketSetup();

      const price = market.calculateMarketPrice(stellarObject, 'unknown_good', 'buy');

      expect(price).toBe(0);
    });

    test('prices general category goods with fixed ideal stock (line 141)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.marketState.inventory = { furniture: 10 };

      // furniture is general/finished → idealStock = 25, stockRatio = 0.4 < 0.5
      const price = market.calculateMarketPrice(stellarObject, 'furniture', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('prices military category goods with fixed ideal stock', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.marketState.inventory = { smallFighters: 5 };

      const price = market.calculateMarketPrice(stellarObject, 'smallFighters', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('intermediate goods use productivityModifier * 20 as ideal stock (lines 146-147)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.marketState.inventory = { flour: 50 };

      // flour is food/intermediate → idealStock = 7 * 20 = 140
      const price = market.calculateMarketPrice(stellarObject, 'flour', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('finished goods use productivityModifier * 10 as ideal stock (lines 148-149)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.marketState.inventory = { bread: 30 };

      // bread is food/finished → idealStock = 7 * 10 = 70
      const price = market.calculateMarketPrice(stellarObject, 'bread', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies below-ideal supply factor when stockRatio is 0.5-1.0 (lines 165-167)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // wheat food/raw, modifier=7, idealStock=350; ratio=200/350≈0.571 → stockRatio<1.0 branch
      stellarObject.marketState.inventory = { wheat: 200 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies above-ideal supply factor when stockRatio is 1.0-2.0 (lines 168-170)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // ratio=500/350≈1.43 → stockRatio<2.0 branch
      stellarObject.marketState.inventory = { wheat: 500 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies oversupply factor when stockRatio >= 2.0 (lines 171-174)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // ratio=800/350≈2.29 → oversupply branch
      stellarObject.marketState.inventory = { wheat: 800 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('returns elevated price when no local production but stock exists (lines 175-177)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // Set food modifier to 0 → idealStock = 0 * 50 = 0, but stock > 0
      stellarObject.productivityModifiers = { food: 0 };
      stellarObject.marketState.inventory = { wheat: 5 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('returns 0 when no local production and no stock (lines 178-180)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // Set food modifier to 0 → idealStock = 0, and no wheat in inventory
      stellarObject.productivityModifiers = { food: 0 };
      stellarObject.marketState.inventory = {};

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBe(0);
    });

    test('applies excellent production factor when modifier >= 8 (line 188)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.productivityModifiers = { food: 9 };
      // idealStock = 9 * 50 = 450; stockRatio = 100/450 ≈ 0.22 < 0.25
      stellarObject.marketState.inventory = { wheat: 100 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies moderate production factor when modifier is 4-5 (lines 191-192)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.productivityModifiers = { food: 5 };
      // idealStock = 5 * 50 = 250; stock = 100, ratio = 0.4 < 0.5
      stellarObject.marketState.inventory = { wheat: 100 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies limited production factor when modifier is 2-3 (lines 193-194)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.productivityModifiers = { food: 3 };
      stellarObject.marketState.inventory = { wheat: 100 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies very limited production factor when modifier is 1 (lines 195-196)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.productivityModifiers = { food: 1 };
      stellarObject.marketState.inventory = { wheat: 100 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('applies no-production factor when modifier is 0 but stock exists (lines 197-198)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      stellarObject.productivityModifiers = { food: 0 };
      // idealStock = 0, currentStock > 0 → supplyFactor branch already sets price > 0
      stellarObject.marketState.inventory = { wheat: 5 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'buy');

      expect(price).toBeGreaterThan(0);
    });

    test('sell: applies better ratio when market needs goods (stockRatio 0.5-1.0) (lines 217-219)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // ratio = 200/350 ≈ 0.571 → 0.5 <= ratio < 1.0 sell branch
      stellarObject.marketState.inventory = { wheat: 200 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'sell');

      expect(price).toBeGreaterThan(0);
    });

    test('sell: applies reduced ratio when market is somewhat oversupplied (stockRatio 1.0-2.0) (lines 220-222)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // ratio = 500/350 ≈ 1.43 → 1.0 <= ratio < 2.0 sell branch
      stellarObject.marketState.inventory = { wheat: 500 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'sell');

      expect(price).toBeGreaterThan(0);
    });

    test('sell: applies minimum ratio when market is very oversupplied (stockRatio >= 2.0) (lines 223-225)', () => {
      const { market, stellarObject } = createTestMarketSetup();
      // ratio = 800/350 ≈ 2.29 → oversupply sell branch
      stellarObject.marketState.inventory = { wheat: 800 };

      const price = market.calculateMarketPrice(stellarObject, 'wheat', 'sell');

      expect(price).toBeGreaterThan(0);
    });
  });

  describe('initializeMarkets (additional)', () => {
    test('skips stellar objects that have no market capability (line 40)', () => {
      const { market, universe } = createTestMarketSetup();
      // Add a non-market object directly (marketState = null)
      universe.stellarObjects.push({ id: 99, marketState: null, productivityModifiers: {} });

      expect(() => market.initializeMarkets()).not.toThrow();
    });
  });

  describe('buyGood (additional)', () => {
    test('fails when good exists in inventory but not in goods data (line 274)', () => {
      const { market, player, stellarObject } = createTestMarketSetup();
      // Put a fake good in inventory so availability check passes
      stellarObject.marketState.inventory['fake_good'] = 100;

      const result = market.buyGood(player, 1, 'fake_good', 5);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown good');
    });

    test('correctly calculates cargo for kilograms-unit goods (lines 282-283)', () => {
      const { market, player, stellarObject } = createTestMarketSetup();
      // yeast: kilograms, 10kg per unit
      stellarObject.marketState.inventory = { yeast: 100 };

      const result = market.buyGood(player, 1, 'yeast', 5);

      expect(result.success).toBe(true);
      expect(player.cargo.yeast).toBe(5);
    });
  });

  describe('calculateCargoUsed (additional)', () => {
    test('correctly calculates cargo for kilograms-unit goods (lines 366-367)', () => {
      const { market, player } = createTestMarketSetup();
      // yeast: kilograms, 10kg per unit; 5 units = 50kg = 0.05 metric tons
      player.cargo = { yeast: 5 };

      const cargoUsed = market.calculateCargoUsed(player);

      expect(cargoUsed).toBeCloseTo(0.05, 5);
    });
  });
});

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
  });
});

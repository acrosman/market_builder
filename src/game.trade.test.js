const { Game, Player, NPC } = require('./game');
const { Universe, System } = require('./universe');
const fs = require('fs');
const path = require('path');

/**
 * Helper function to create test game with market-enabled stellar object
 */
function createTestGameWithMarket() {
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

  // Initialize market with some goods
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

  universe.stellarObjects.push(stellarObject);

  const settings = {
    starting_credits: 10000,
    initial_ship: 'Cargo Hauler',
    data_directory: dataDir
  };

  const game = new Game(universe, settings);
  const playerData = {
    name: 'Test Captain',
    corporationName: 'Test Corp'
  };
  game.initializeGame(playerData);

  // Land on the planet to enable trading
  game.player.landedOn = 1;
  game.player.location = 1;

  return { game, stellarObject, settings };
}

describe('Game Trading System', () => {
  describe('buyGood', () => {
    test('should successfully buy goods when all conditions are met', () => {
      const { game, stellarObject } = createTestGameWithMarket();
      const initialCredits = game.player.credits;
      const initialInventory = stellarObject.marketState.inventory.wheat;

      const result = game.buyGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Bought 10 units of wheat');
      expect(game.player.credits).toBe(initialCredits - 100);
      expect(game.player.cargo.wheat).toBe(10);
      expect(stellarObject.marketState.inventory.wheat).toBe(initialInventory - 10);
    });

    test('should fail when stellar object not found', () => {
      const { game } = createTestGameWithMarket();

      const result = game.buyGood(999, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('should fail when no market available', () => {
      const { game, universe } = createTestGameWithMarket();

      // Create object without market
      const { StellarObject } = require('./stellarObject');
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data/default/en-us/stellarObjects.json'), 'utf-8')
      );
      const asteroidData = stellarObjectsData.Asteroid;
      const asteroid = new StellarObject(
        2,
        'Asteroid',
        'Ice',
        1,
        asteroidData,
        'Test Asteroid',
        'data/default/en-us'
      );
      game.universe.stellarObjects.push(asteroid);

      const result = game.buyGood(2, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No market available at this location');
    });

    test('should fail when insufficient goods available', () => {
      const { game } = createTestGameWithMarket();

      const result = game.buyGood(1, 'wheat', 200, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Only');
      expect(result.message).toContain('units available');
    });

    test('should fail when insufficient credits', () => {
      const { game } = createTestGameWithMarket();
      game.player.credits = 50;

      const result = game.buyGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient credits');
    });

    test('should fail when insufficient cargo space', () => {
      const { game } = createTestGameWithMarket();

      // Fill cargo to near capacity (Cargo Hauler has 1000 ton capacity)
      game.player.cargo.wheat = 990; // wheat is 1 ton per unit

      const result = game.buyGood(1, 'wheat', 20, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient cargo space');
    });

    test('should fail when good is unknown', () => {
      const { game, stellarObject } = createTestGameWithMarket();
      stellarObject.marketState.inventory.unknownGood = 100;

      const result = game.buyGood(1, 'unknownGood', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown good');
    });
  });

  describe('sellGood', () => {
    test('should successfully sell goods when all conditions are met', () => {
      const { game, stellarObject } = createTestGameWithMarket();
      game.player.cargo.wheat = 20;
      const initialCredits = game.player.credits;
      const initialInventory = stellarObject.marketState.inventory.wheat;

      const result = game.sellGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Sold 10 units of wheat');
      expect(game.player.credits).toBe(initialCredits + 100);
      expect(game.player.cargo.wheat).toBe(10);
      expect(stellarObject.marketState.inventory.wheat).toBe(initialInventory + 10);
    });

    test('should remove cargo entry when selling all units', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 10;

      const result = game.sellGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(true);
      expect(game.player.cargo.wheat).toBeUndefined();
    });

    test('should fail when stellar object not found', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 10;

      const result = game.sellGood(999, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('should fail when no market available', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 10;

      // Create object without market
      const { StellarObject } = require('./stellarObject');
      const stellarObjectsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data/default/en-us/stellarObjects.json'), 'utf-8')
      );
      const asteroidData = stellarObjectsData.Asteroid;
      const asteroid = new StellarObject(
        2,
        'Asteroid',
        'Ice',
        1,
        asteroidData,
        'Test Asteroid',
        'data/default/en-us'
      );
      game.universe.stellarObjects.push(asteroid);

      const result = game.sellGood(2, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No market available at this location');
    });

    test('should fail when player does not have enough goods', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 5;

      const result = game.sellGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('You only have 5 units');
    });

    test('should fail when player has no goods at all', () => {
      const { game } = createTestGameWithMarket();

      const result = game.sellGood(1, 'wheat', 10, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('You only have 0 units');
    });
  });

  describe('loadPassengers', () => {
    test('should successfully load passengers when conditions are met', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 75% of limit
      stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.75);
      const initialPopulation = stellarObject.population.current;

      const result = game.loadPassengers(1, 100);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Loaded 100 passengers');
      expect(game.player.cargo.passengers).toBe(100);
      expect(stellarObject.population.current).toBe(initialPopulation - 100);
    });

    test('should fail when stellar object not found', () => {
      const { game } = createTestGameWithMarket();

      const result = game.loadPassengers(999, 100);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Stellar object not found');
    });

    test('should fail when population is below 25%', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 20% of limit
      stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.20);

      const result = game.loadPassengers(1, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Population is too low');
    });

    test('should fail when requesting more passengers than available', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 50% of limit
      stellarObject.population.current = Math.floor(stellarObject.population.limit * 0.50);

      // Calculate available passengers: at 50%, willing = ((50-25)/75)*50 = 16.67%
      const willingPercent = ((50 - 25) / 75) * 50;
      const availablePassengers = Math.floor((stellarObject.population.current * willingPercent) / 100);

      const result = game.loadPassengers(1, availablePassengers + 1000);

      expect(result.success).toBe(false);
      expect(result.message).toContain('passengers available');
    });

    test('should fail when insufficient cargo space', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 100% of limit
      stellarObject.population.current = stellarObject.population.limit;

      // Fill cargo to near capacity (Cargo Hauler has 1000 ton capacity)
      game.player.cargo.wheat = 995; // wheat is 1 ton per unit, leaves 5 tons = 50 passengers

      const result = game.loadPassengers(1, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient cargo space');
    });

    test('should calculate passenger availability correctly at 100% population', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 100% of limit
      stellarObject.population.current = stellarObject.population.limit;

      // At 100%, willing = ((100-25)/75)*50 = 50%
      const expectedAvailable = Math.floor(stellarObject.population.current * 0.5);

      // Make sure we have enough cargo space (passengers need 1 ton per 10 people)
      // Limit to what cargo can hold
      const cargoSpace = 1000; // Cargo Hauler capacity
      const maxPassengersBySpace = cargoSpace * 10;
      const passengersToLoad = Math.min(expectedAvailable, maxPassengersBySpace);

      const result = game.loadPassengers(1, passengersToLoad);

      expect(result.success).toBe(true);
    });

    test('should accumulate passengers in cargo', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Set population to 100% of limit
      stellarObject.population.current = stellarObject.population.limit;

      game.player.cargo.passengers = 50;

      const result = game.loadPassengers(1, 100);

      expect(result.success).toBe(true);
      expect(game.player.cargo.passengers).toBe(150);
    });
  });

  describe('calculateCargoUsed', () => {
    test('should calculate cargo for goods in metric tons', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 10; // 1 ton per unit = 10 tons

      const cargoUsed = game.calculateCargoUsed();

      expect(cargoUsed).toBe(10);
    });

    test('should calculate cargo for goods in kilograms', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.bread = 10; // 500kg per unit = 5 tons total

      const cargoUsed = game.calculateCargoUsed();

      expect(cargoUsed).toBe(5);
    });

    test('should calculate cargo for passengers (10 per ton)', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.passengers = 100; // 100 people = 10 tons

      const cargoUsed = game.calculateCargoUsed();

      expect(cargoUsed).toBe(10);
    });

    test('should calculate total cargo for mixed goods and passengers', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.wheat = 10; // 10 tons
      game.player.cargo.bread = 10; // 5 tons
      game.player.cargo.passengers = 50; // 5 tons

      const cargoUsed = game.calculateCargoUsed();

      expect(cargoUsed).toBe(20);
    });

    test('should return 0 for empty cargo', () => {
      const { game } = createTestGameWithMarket();

      const cargoUsed = game.calculateCargoUsed();

      expect(cargoUsed).toBe(0);
    });

    test('should handle unknown goods gracefully', () => {
      const { game } = createTestGameWithMarket();
      game.player.cargo.unknownGood = 10;

      const cargoUsed = game.calculateCargoUsed();

      // Should not throw error, just ignore unknown good
      expect(cargoUsed).toBe(0);
    });
  });

  describe('Trading integration scenarios', () => {
    test('should maintain inventory consistency across multiple trades', () => {
      const { game, stellarObject } = createTestGameWithMarket();
      const initialWheatInventory = stellarObject.marketState.inventory.wheat;
      const initialCredits = game.player.credits;

      // Buy 10 wheat
      game.buyGood(1, 'wheat', 10, 10);
      expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 10);
      expect(game.player.cargo.wheat).toBe(10);

      // Sell 5 wheat
      game.sellGood(1, 'wheat', 5, 10);
      expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 5);
      expect(game.player.cargo.wheat).toBe(5);

      // Buy 3 more wheat
      game.buyGood(1, 'wheat', 3, 10);
      expect(stellarObject.marketState.inventory.wheat).toBe(initialWheatInventory - 8);
      expect(game.player.cargo.wheat).toBe(8);
    });

    test('should respect cargo capacity across goods and passengers', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Ensure market has enough wheat
      stellarObject.marketState.inventory.wheat = 2000;

      // Cargo Hauler has 1000 ton capacity
      // Buy 900 tons of wheat
      game.buyGood(1, 'wheat', 900, 10);
      expect(game.player.cargo.wheat).toBe(900);

      // Try to buy 200 more tons (should fail)
      const result1 = game.buyGood(1, 'wheat', 200, 10);
      expect(result1.success).toBe(false);

      // Load passengers that fit (100 tons / 10 = 1000 passengers)
      stellarObject.population.current = stellarObject.population.limit; // Ensure passengers available
      const result2 = game.loadPassengers(1, 1000);
      expect(result2.success).toBe(true);
      expect(game.player.cargo.passengers).toBe(1000);

      // Try to buy more wheat (should fail - no space)
      const result3 = game.buyGood(1, 'wheat', 10, 10);
      expect(result3.success).toBe(false);
    });

    test('should handle edge case of exactly full cargo', () => {
      const { game, stellarObject } = createTestGameWithMarket();

      // Ensure market has enough wheat
      stellarObject.marketState.inventory.wheat = 2000;

      // Buy exactly 1000 tons
      game.buyGood(1, 'wheat', 1000, 10);
      expect(game.player.cargo.wheat).toBe(1000);

      const cargoUsed = game.calculateCargoUsed();
      expect(cargoUsed).toBe(1000);

      // Try to buy 1 more unit (should fail)
      const result = game.buyGood(1, 'water', 1, 5);
      expect(result.success).toBe(false);
    });
  });
});

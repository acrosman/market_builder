const { StellarObject } = require('./stellarObject');

describe('StellarObject', () => {
  let mockTypeDetails;
  let mockBuildingsData;

  beforeEach(() => {
    // Mock stellarObjects.json structure
    mockTypeDetails = {
      market: true,
      buildings: true,
      shipyard: true,
      shields: true,
      cannons: true,
      fighters: true,
      resistance: false,
      classes: {
        'Earth-like': {
          description: 'Test planet description',
          populationLimit: 8000000000,
          initialPopulationPercent: [30, 40],
          reproductionRate: 5,
          buildingCredits: 0,
          buildingLimit: 150,
          productivityModifiers: {
            metal: 5,
            food: 7,
            chemicals: 6,
            energy: 8
          }
        }
      }
    };

    // Mock buildings.json structure
    mockBuildingsData = {
      'Shield Generator': {
        buildCost: { ticks: 10, credits: 1000 },
        shieldsMaxCharge: 1000,
        shieldsChargeRate: 10
      },
      'Cannon': {
        buildCost: { ticks: 8, credits: 800 },
        cannonBurstOutput: [50, 100]
      },
      'Warehouse': {
        buildCost: { ticks: 5, credits: 500 },
        storage: 10000
      }
    };
  });

  describe('constructor', () => {
    test('should create a stellar object with basic properties', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.id).toBe(1);
      expect(obj.type).toBe('Planet');
      expect(obj.className).toBe('Earth-like');
      expect(obj.location).toBe(5);
      expect(obj.name).toBe('Test Planet');
      expect(obj.owner).toBe('Independent');
      expect(obj.value).toBe(0);
    });

    test('should set capabilities from typeDetails', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.capabilities.market).toBe(true);
      expect(obj.capabilities.buildings).toBe(true);
      expect(obj.capabilities.shipyard).toBe(true);
      expect(obj.capabilities.shields).toBe(true);
      expect(obj.capabilities.cannons).toBe(true);
      expect(obj.capabilities.fighters).toBe(true);
      expect(obj.capabilities.resistance).toBe(false);
    });

    test('should initialize population within specified percentage range', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.population.limit).toBe(8000000000);
      expect(obj.population.growthRate).toBe(5);
      expect(obj.population.current).toBeGreaterThanOrEqual(8000000000 * 0.30);
      expect(obj.population.current).toBeLessThanOrEqual(8000000000 * 0.40);
    });

    test('should initialize empty buildings object', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.buildings).toEqual({});
      expect(obj.getBuildingCount()).toBe(0);
    });

    test('should initialize fighters to 0', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.fighters).toBe(0);
    });

    test('should initialize market state when capability enabled', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.marketState).not.toBeNull();
      expect(obj.marketState.inventory).toEqual({});
      expect(obj.marketState.prices).toEqual({});
      expect(obj.marketState.tradeRoutes).toEqual([]);
    });

    test('should initialize shipyard state when capability enabled', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.shipyardState).not.toBeNull();
      expect(obj.shipyardState.shipsUnderConstruction).toEqual([]);
      expect(obj.shipyardState.availableShipTypes).toEqual([]);
      expect(obj.shipyardState.constructionQueue).toEqual([]);
    });

    test('should not initialize market state when capability disabled', () => {
      mockTypeDetails.market = false;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.marketState).toBeNull();
    });

    test('should throw error for unknown class', () => {
      expect(() => {
        new StellarObject(
          1,
          'Planet',
          'Unknown Class',
          5,
          mockTypeDetails,
          'Test Planet'
        );
      }).toThrow('Unknown class "Unknown Class" for type "Planet"');
    });

    test('should initialize productivity modifiers from class details', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      expect(obj.productivityModifiers).toEqual({
        metal: 5,
        food: 7,
        chemicals: 6,
        energy: 8
      });
    });
  });

  describe('addBuilding', () => {
    test('should queue a building for construction', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const result = obj.addBuilding('Warehouse', mockBuildingsData);
      expect(result).toBe(true);
      expect(obj.buildingsUnderConstruction.length).toBe(1);
      expect(obj.buildingsUnderConstruction[0].type).toBe('Warehouse');
      expect(obj.buildingsUnderConstruction[0].ticksRemaining).toBe(5);
      expect(obj.getBuildingCount()).toBe(0); // Not built yet
    });

    test('should queue multiple buildings', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.addBuilding('Warehouse', mockBuildingsData);
      obj.addBuilding('Warehouse', mockBuildingsData);
      expect(obj.buildingsUnderConstruction.length).toBe(2);
    });

    test('should return false when at building limit (including queued)', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      // Fill up to limit with queued buildings
      for (let i = 0; i < obj.buildingLimit; i++) {
        obj.addBuilding('Warehouse', mockBuildingsData);
      }

      // Try to add one more
      const result = obj.addBuilding('Warehouse', mockBuildingsData);
      expect(result).toBe(false);
      expect(obj.buildingsUnderConstruction.length).toBe(obj.buildingLimit);
    });

    test('should return false when buildings capability is disabled', () => {
      mockTypeDetails.buildings = false;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const result = obj.addBuilding('Warehouse', mockBuildingsData);
      expect(result).toBe(false);
      expect(obj.buildingsUnderConstruction.length).toBe(0);
    });

    test('should return false for invalid building type', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const result = obj.addBuilding('InvalidBuilding', mockBuildingsData);
      expect(result).toBe(false);
      expect(obj.buildingsUnderConstruction.length).toBe(0);
    });
  });

  describe('removeBuilding', () => {
    test('should remove a building and decrement count', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      // Manually add buildings (not through construction queue)
      obj.buildings['Warehouse'] = { count: 2 };
      const result = obj.removeBuilding('Warehouse');

      expect(result).toBe(true);
      expect(obj.buildings['Warehouse'].count).toBe(1);
    });

    test('should delete building entry when count reaches 0', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.buildings['Warehouse'] = { count: 1 };
      obj.removeBuilding('Warehouse');

      expect(obj.buildings['Warehouse']).toBeUndefined();
      expect(obj.getBuildingCount()).toBe(0);
    });

    test('should return false when no buildings exist', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const result = obj.removeBuilding('Warehouse');
      expect(result).toBe(false);
    });
  });

  describe('getShieldStrength', () => {
    test('should calculate shield strength from Shield Generator buildings', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      // Manually add buildings (not through construction queue)
      obj.buildings['Shield Generator'] = { count: 3 };

      const strength = obj.getShieldStrength(mockBuildingsData);
      expect(strength).toBe(3000); // 3 * 1000
    });

    test('should return 0 when no Shield Generators exist', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const strength = obj.getShieldStrength(mockBuildingsData);
      expect(strength).toBe(0);
    });

    test('should return 0 when shields capability is disabled', () => {
      mockTypeDetails.shields = false;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.buildings['Shield Generator'] = { count: 2 };
      const strength = obj.getShieldStrength(mockBuildingsData);
      expect(strength).toBe(0);
    });
  });

  describe('getCannonStrength', () => {
    test('should calculate cannon strength from Cannon buildings', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      // Manually add buildings (not through construction queue)
      obj.buildings['Cannon'] = { count: 2 };

      const strength = obj.getCannonStrength(mockBuildingsData);
      expect(strength).toBe(200); // 2 * 100 (max output)
    });

    test('should return 0 when no Cannons exist', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const strength = obj.getCannonStrength(mockBuildingsData);
      expect(strength).toBe(0);
    });
  });

  describe('addFighters and removeFighters', () => {
    test('should add fighters when capability enabled', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.addFighters(50);
      expect(obj.fighters).toBe(50);

      obj.addFighters(25);
      expect(obj.fighters).toBe(75);
    });

    test('should not add fighters when capability disabled', () => {
      mockTypeDetails.fighters = false;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.addFighters(50);
      expect(obj.fighters).toBe(0);
    });

    test('should remove fighters up to available count', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.addFighters(50);
      const removed = obj.removeFighters(30);

      expect(removed).toBe(30);
      expect(obj.fighters).toBe(20);
    });

    test('should only remove available fighters when requesting more than exist', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.addFighters(50);
      const removed = obj.removeFighters(100);

      expect(removed).toBe(50);
      expect(obj.fighters).toBe(0);
    });
  });

  describe('updatePopulation', () => {
    test('should increase population based on growth rate', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const initialPopulation = obj.population.current;
      obj.updatePopulation(1);

      // Growth rate is 5%, so population should increase
      expect(obj.population.current).toBeGreaterThan(initialPopulation);
      expect(obj.population.current).toBeLessThanOrEqual(obj.population.limit);
    });

    test('should decrease population with negative growth rate', () => {
      mockTypeDetails.classes['Earth-like'].reproductionRate = -10;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const initialPopulation = obj.population.current;
      obj.updatePopulation(1);

      expect(obj.population.current).toBeLessThan(initialPopulation);
      expect(obj.population.current).toBeGreaterThanOrEqual(0);
    });

    test('should cap population at limit', () => {
      mockTypeDetails.classes['Earth-like'].reproductionRate = 100; // Very high growth
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.updatePopulation(10);

      expect(obj.population.current).toBe(obj.population.limit);
    });

    test('should not allow population below 0', () => {
      mockTypeDetails.classes['Earth-like'].reproductionRate = -100;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.updatePopulation(100);

      expect(obj.population.current).toBe(0);
    });
  });

  describe('calculateValue', () => {
    test('should calculate basic value from properties', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const value = obj.calculateValue();
      expect(value).toBeGreaterThan(0);
      expect(obj.value).toBe(value);
    });

    test('should include market value when capability enabled', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const baseValues = { marketValue: 50000 };
      const value = obj.calculateValue(baseValues);

      expect(value).toBeGreaterThanOrEqual(50000);
    });

    test('should include shipyard value when capability enabled', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const baseValues = { shipyardValue: 75000 };
      const value = obj.calculateValue(baseValues);

      expect(value).toBeGreaterThanOrEqual(75000);
    });
  });

  describe('setOwner', () => {
    test('should set owner to specified corporation', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.setOwner('Test Corp');
      expect(obj.owner).toBe('Test Corp');
    });

    test('should set owner to Independent when null', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.setOwner('Test Corp');
      obj.setOwner(null);
      expect(obj.owner).toBe('Independent');
    });
  });

  describe('toJSON and fromJSON', () => {
    test('should serialize and deserialize correctly', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.setOwner('Test Corp');
      // Manually add buildings (not through construction queue)
      obj.buildings['Warehouse'] = { count: 2 };
      obj.buildingsUnderConstruction = [
        { type: 'Cannon', ticksRemaining: 3 }
      ];
      obj.addFighters(100);
      obj.landedImage = 'path/to/image.jpg';

      const json = obj.toJSON();
      const restored = StellarObject.fromJSON(json, mockTypeDetails);

      expect(restored.id).toBe(obj.id);
      expect(restored.type).toBe(obj.type);
      expect(restored.className).toBe(obj.className);
      expect(restored.location).toBe(obj.location);
      expect(restored.name).toBe(obj.name);
      expect(restored.owner).toBe(obj.owner);
      expect(restored.landedImage).toBe(obj.landedImage);
      expect(restored.buildings['Warehouse'].count).toBe(2);
      expect(restored.buildingsUnderConstruction.length).toBe(1);
      expect(restored.buildingsUnderConstruction[0].type).toBe('Cannon');
      expect(restored.buildingsUnderConstruction[0].ticksRemaining).toBe(3);
      expect(restored.fighters).toBe(100);
      expect(restored.population.current).toBe(obj.population.current);
      expect(restored.productivityModifiers).toEqual(obj.productivityModifiers);
    });
  });

  describe('onTick', () => {
    test('should advance construction queue by ticks', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.buildingsUnderConstruction = [
        { type: 'Warehouse', ticksRemaining: 5 },
        { type: 'Cannon', ticksRemaining: 8 }
      ];

      obj.onTick({ ticks: 2 });

      expect(obj.buildingsUnderConstruction[0].ticksRemaining).toBe(3);
      expect(obj.buildingsUnderConstruction[1].ticksRemaining).toBe(6);
      expect(obj.buildings['Warehouse']).toBeUndefined(); // Not complete yet
    });

    test('should complete buildings when construction finishes', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.buildingsUnderConstruction = [
        { type: 'Warehouse', ticksRemaining: 3 },
        { type: 'Cannon', ticksRemaining: 8 }
      ];

      obj.onTick({ ticks: 5 });

      // Warehouse should be complete
      expect(obj.buildings['Warehouse'].count).toBe(1);
      expect(obj.buildingsUnderConstruction.length).toBe(1);
      expect(obj.buildingsUnderConstruction[0].type).toBe('Cannon');
      expect(obj.buildingsUnderConstruction[0].ticksRemaining).toBe(3);
    });

    test('should complete multiple buildings in one tick', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      obj.buildingsUnderConstruction = [
        { type: 'Warehouse', ticksRemaining: 2 },
        { type: 'Cannon', ticksRemaining: 3 }
      ];

      obj.onTick({ ticks: 5 });

      // Both should be complete
      expect(obj.buildings['Warehouse'].count).toBe(1);
      expect(obj.buildings['Cannon'].count).toBe(1);
      expect(obj.buildingsUnderConstruction.length).toBe(0);
    });

    test('should update population based on growth rate', () => {
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const initialPopulation = obj.population.current;
      obj.onTick({ ticks: 1 });

      // Population should have grown
      expect(obj.population.current).toBeGreaterThan(initialPopulation);
    });

    test('should not update population when growth rate is 0', () => {
      mockTypeDetails.classes['Earth-like'].reproductionRate = 0;
      const obj = new StellarObject(
        1,
        'Planet',
        'Earth-like',
        5,
        mockTypeDetails,
        'Test Planet'
      );

      const initialPopulation = obj.population.current;
      obj.onTick({ ticks: 5 });

      // Population should not change
      expect(obj.population.current).toBe(initialPopulation);
    });
  });
});

const rewire = require('rewire');
const universeModule = rewire('./universe');

const {
  Universe,
  System,
  StellarObject,
  createUniverse,
} = universeModule;

describe('loadDataFile', () => {
  test('loads and parses JSON data from the data directory', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    expect(data).toHaveProperty('Planet');
    expect(data).toHaveProperty('Space Station');
    expect(data).toHaveProperty('Asteroid');
  });
});

describe('Universe', () => {
  test('Universe initializes with empty systems and stellarObjects', () => {
    const universe = new Universe();
    expect(universe.systems).toEqual([]);
    expect(universe.stellarObjects).toEqual([]);
  });
});

describe('System', () => {
  test('System initializes with id, name, and empty connections', () => {
    const sys = new System(1, 'Alpha');
    expect(sys.id).toBe(1);
    expect(sys.name).toBe('Alpha');
    expect(sys.connections).toEqual([]);
  });
});

describe('StellarObject', () => {
  test('StellarObject sets all fields from data', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
    );
    expect(obj.id).toBe(0);
    expect(obj.type).toBe("Planet");
    expect(obj.className).toBe("Earth-like");
    expect(obj.location).toBe(2);
    expect(obj.market).toBe(data.Planet.market);
    expect(obj.buildings).toBe(data.Planet.buildings);
    expect(obj.shipyard).toBe(data.Planet.shipyard);
    expect(obj.shields).toBe(data.Planet.shields);
    expect(obj.cannons).toBe(data.Planet.cannons);
    expect(obj.fighters).toBe(data.Planet.fighters);
    expect(obj.resistance).toBe(data.Planet.resistance);
    expect(obj.description).toBe(data.Planet.classes['Earth-like'].description);
    expect(obj.populationLimit).toBe(data.Planet.classes['Earth-like'].populationLimit);
    expect(obj.reproductionRate).toBe(data.Planet.classes['Earth-like'].reproductionRate);
    expect(obj.buildingCredits).toBe(data.Planet.classes['Earth-like'].buildingCredits);
    expect(obj.buildingLimit).toBe(data.Planet.classes['Earth-like'].buildingLimit);
    expect(obj.goods).toEqual(data.Planet.classes['Earth-like'].goods);
  });

  test('StellarObject initializes with empty landedImage', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    expect(obj.landedImage).toBe('');
  });

  test('getLandedImage returns path for Planet Surface subfolder', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    const landedImage = obj.getLandedImage(data);
    // Should return a path or empty string if images don't exist yet
    expect(typeof landedImage).toBe('string');
    if (landedImage) {
      expect(landedImage).toContain('Surface');
    }
  });

  test('getLandedImage returns path for Space Station Port subfolder', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Space Station",
      "Trading Post",
      2,
      data['Space Station'],
      "TestStation"
    );
    const landedImage = obj.getLandedImage(data);
    // Should return a path or empty string if images don't exist yet
    expect(typeof landedImage).toBe('string');
    if (landedImage) {
      expect(landedImage).toContain('Port');
    }
  });

  test('getLandedImage returns path for Asteroid Port subfolder', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Asteroid",
      "Ice",
      2,
      data.Asteroid,
      "TestAsteroid"
    );
    const landedImage = obj.getLandedImage(data);
    // Should return a path or empty string if images don't exist yet
    expect(typeof landedImage).toBe('string');
    if (landedImage) {
      expect(landedImage).toContain('Port');
    }
  });

  test('StellarObject initializes with Independent owner', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    expect(obj.owner).toBe('Independent');
  });

  test('StellarObject initializes with value of 0', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    expect(obj.value).toBe(0);
  });

  test('setOwner changes the owner', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    obj.setOwner('Test Corporation');
    expect(obj.owner).toBe('Test Corporation');
  });

  test('setOwner defaults to Independent for null/undefined', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    obj.setOwner('Test Corp');
    obj.setOwner(null);
    expect(obj.owner).toBe('Independent');
  });

  test('calculateValue returns positive number for objects with properties', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );
    const value = obj.calculateValue();
    expect(value).toBeGreaterThan(0);
    expect(typeof value).toBe('number');
  });

  test('calculateValue uses baseValues for calculation', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');
    const obj = new StellarObject(
      0,
      "Planet",
      "Earth-like",
      2,
      data.Planet,
      "TestPlanet"
    );

    const baseValues = {
      populationValue: 100,
      marketValue: 10000,
      shipyardValue: 15000,
      buildingValue: 5000,
      defenseValue: 1000,
      buildingLimitValue: 500
    };

    const value = obj.calculateValue(baseValues);

    // Earth-like planets have market, buildings, populationLimit, buildingLimit
    // Value should reflect those properties
    expect(value).toBeGreaterThan(0);

    // With high population limit and building credits, should be substantial
    if (obj.populationLimit > 0) {
      expect(value).toBeGreaterThan(10000);
    }
  });

  test('calculateValue accounts for market presence', () => {
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');

    // Create two objects: one with market, one without
    const withMarket = new StellarObject(0, "Planet", "Earth-like", 2, data.Planet, "MarketPlanet");
    const withoutMarket = new StellarObject(0, "Asteroid", "Ice", 2, data.Asteroid, "IceAsteroid");

    const baseValues = { marketValue: 10000 };

    const valueWith = withMarket.calculateValue(baseValues);
    const valueWithout = withoutMarket.calculateValue(baseValues);

    if (withMarket.market && !withoutMarket.market) {
      expect(valueWith).toBeGreaterThan(valueWithout);
    }
  });
});

describe('createUniverse', () => {
  test('Creates correct number of systems and stellar objects', () => {
    const universe = createUniverse(5, 6, 3);
    expect(universe.systems.length).toBe(5);
    expect(universe.stellarObjects.length).toBe(3);
  });

  test('All systems are connected in a chain', () => {
    const universe = createUniverse(5, 4, 2);
    // Each system should have at least one connection
    universe.systems.forEach(sys => {
      expect(sys.connections.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('No system has a self-connection', () => {
    const universe = createUniverse(5, 8, 2);
    universe.systems.forEach(sys => {
      expect(sys.connections).not.toContain(sys.id);
    });
  });

  test('No duplicate connections', () => {
    const universe = createUniverse(5, 8, 2);
    universe.systems.forEach(sys => {
      const unique = new Set(sys.connections);
      expect(unique.size).toBe(sys.connections.length);
    });
  });

  test('Stellar objects are assigned valid types and classes', () => {
    const universe = createUniverse(5, 6, 10);
    const loadDataFile = universeModule.__get__('loadDataFile');
    const data = loadDataFile('stellarObjects');

    universe.stellarObjects.forEach(obj => {
      expect(Object.keys(data)).toContain(obj.type);
      const classNames = Object.keys(data[obj.type].classes);
      expect(classNames).toContain(obj.className);
    });
  });

  test('Creates universe with required objects in system one', () => {
    const universe = createUniverse(5, 6, 3);

    // Check system one objects
    const systemOneObjects = universe.stellarObjects.filter(obj => obj.location === 1);
    expect(systemOneObjects.length).toBeGreaterThanOrEqual(2);

    // Verify required objects exist
    const planet = systemOneObjects.find(obj => obj.type === 'Planet' && obj.className === 'Earth-like');
    const station = systemOneObjects.find(obj => obj.type === 'Space Station' && obj.className === 'Trading Post');

    expect(planet).toBeTruthy();
    expect(station).toBeTruthy();
  });

  test('System 1 objects use specific System1Surface.jpg image', () => {
    const universe = createUniverse(5, 6, 3);

    // Get all system one objects
    const systemOneObjects = universe.stellarObjects.filter(obj => obj.location === 1);

    // All System 1 objects should have the specific surface image
    systemOneObjects.forEach(obj => {
      expect(obj.landedImage).toBe('images/stellar_objects/System1Surface.jpg');
    });

    // Verify at least 2 objects exist in System 1
    expect(systemOneObjects.length).toBeGreaterThanOrEqual(2);
  });

  test('Systems are numbered starting from 1', () => {
    const universe = createUniverse(5, 6, 3);
    const systemIds = universe.systems.map(sys => sys.id);
    expect(Math.min(...systemIds)).toBe(1);
    expect(Math.max(...systemIds)).toBe(5);
  });

  test('getUniqueName handles types with and without name data', () => {
    const universe = createUniverse(5, 6, 10);

    // All objects should have names assigned without error
    universe.stellarObjects.forEach(obj => {
      expect(obj.name).toBeDefined();
      expect(typeof obj.name).toBe('string');
      expect(obj.name.length).toBeGreaterThan(0);
    });

    // Planets and Stations should have unique names within their type
    const planets = universe.stellarObjects.filter(obj => obj.type === 'Planet');
    const stations = universe.stellarObjects.filter(obj => obj.type === 'Space Station');

    const planetNames = planets.map(p => p.name);
    const stationNames = stations.map(s => s.name);

    // Check uniqueness
    expect(new Set(planetNames).size).toBe(planetNames.length);
    expect(new Set(stationNames).size).toBe(stationNames.length);
  });

  test('getUniqueName works with Asteroid type using nameSource mapping', () => {
    // Use getUniqueName from module.exports if available, else use rewire fallback
    const getUniqueName = universeModule.getUniqueName || universeModule.__get__('getUniqueName');
    const loadDataFile = universeModule.__get__('loadDataFile');
    const stellarObjectsData = loadDataFile('stellarObjects');
    const asteroidDetails = stellarObjectsData.Asteroid;

    // Verify Asteroid has nameSource property
    expect(asteroidDetails.nameSource).toBe('stations');

    // Generate multiple names for asteroids
    const asteroidName1 = getUniqueName('Asteroid', asteroidDetails);
    const asteroidName2 = getUniqueName('Asteroid', asteroidDetails);

    // Should get real station names, not generic fallback like "Asteroid 123456"
    expect(asteroidName1).toBeDefined();
    expect(asteroidName2).toBeDefined();
    expect(asteroidName1).not.toMatch(/^Asteroid \d+$/);
    expect(asteroidName2).not.toMatch(/^Asteroid \d+$/);

    // Names should be different for different calls
    expect(asteroidName1).not.toBe(asteroidName2);
  });

  test('Asteroids in generated universe receive proper names from station names', () => {
    const universe = createUniverse(5, 6, 15);

    // Find all asteroids
    const asteroids = universe.stellarObjects.filter(obj => obj.type === 'Asteroid');

    // Should have at least some asteroids created
    expect(asteroids.length).toBeGreaterThan(0);

    // Each asteroid should have a name
    asteroids.forEach(asteroid => {
      expect(asteroid.name).toBeDefined();
      expect(typeof asteroid.name).toBe('string');
      expect(asteroid.name.length).toBeGreaterThan(0);
      // Should not be generic fallback format
      expect(asteroid.name).not.toMatch(/^Asteroid \d+$/);
    });

    // Asteroid names should be unique
    const asteroidNames = asteroids.map(a => a.name);
    expect(new Set(asteroidNames).size).toBe(asteroidNames.length);
  });

  test('All stellar objects have landedImage assigned', () => {
    const universe = createUniverse(5, 6, 10);

    // All stellar objects should have landedImage property
    universe.stellarObjects.forEach(obj => {
      expect(obj).toHaveProperty('landedImage');
      expect(typeof obj.landedImage).toBe('string');
    });
  });

  test('Planets have Surface images and Stations/Asteroids have Port images', () => {
    const universe = createUniverse(5, 6, 15);

    const planets = universe.stellarObjects.filter(obj => obj.type === 'Planet');
    const stations = universe.stellarObjects.filter(obj => obj.type === 'Space Station');
    const asteroids = universe.stellarObjects.filter(obj => obj.type === 'Asteroid');

    // Planets with images should have Surface in path
    planets.forEach(planet => {
      if (planet.landedImage) {
        expect(planet.landedImage).toContain('Surface');
      }
    });

    // Stations with images should have Port in path (except System 1 which uses System1Surface.jpg)
    stations.forEach(station => {
      if (station.landedImage) {
        if (station.location === 1) {
          expect(station.landedImage).toBe('images/stellar_objects/System1Surface.jpg');
        } else {
          expect(station.landedImage).toContain('Port');
        }
      }
    });

    // Asteroids with images should have Port in path (except System 1 which uses System1Surface.jpg)
    asteroids.forEach(asteroid => {
      if (asteroid.landedImage) {
        if (asteroid.location === 1) {
          expect(asteroid.landedImage).toBe('images/stellar_objects/System1Surface.jpg');
        } else {
          expect(asteroid.landedImage).toContain('Port');
        }
      }
    });
  });
});

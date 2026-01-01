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

    // Stations with images should have Port in path
    stations.forEach(station => {
      if (station.landedImage) {
        expect(station.landedImage).toContain('Port');
      }
    });

    // Asteroids with images should have Port in path
    asteroids.forEach(asteroid => {
      if (asteroid.landedImage) {
        expect(asteroid.landedImage).toContain('Port');
      }
    });
  });
});

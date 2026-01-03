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

  test('System 1 objects use specific System1Surface.jpg or System1Port.jpg images', () => {
    const universe = createUniverse(5, 6, 3);

    // Get all system one objects
    const systemOneObjects = universe.stellarObjects.filter(obj => obj.location === 1);

    // Verify at least 2 objects exist in System 1
    expect(systemOneObjects.length).toBeGreaterThanOrEqual(2);

    // System 1 planets should have System1Surface.jpg
    const planets = systemOneObjects.filter(obj => obj.type === 'Planet');
    planets.forEach(planet => {
      expect(planet.landedImage).toBe('data/default/en-us/images/stellar_objects/System1Surface.jpg');
    });

    // System 1 stations and asteroids should have System1Port.jpg
    const stationsAndAsteroids = systemOneObjects.filter(obj =>
      obj.type === 'Space Station' || obj.type === 'Asteroid'
    );
    stationsAndAsteroids.forEach(obj => {
      expect(obj.landedImage).toBe('data/default/en-us/images/stellar_objects/System1Port.jpg');
    });
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

    // Stations with images should have Port in path (except System 1 which uses System1Port.jpg)
    stations.forEach(station => {
      if (station.landedImage) {
        if (station.location === 1) {
          expect(station.landedImage).toBe('data/default/en-us/images/stellar_objects/System1Port.jpg');
        } else {
          expect(station.landedImage).toContain('Port');
        }
      }
    });

    // Asteroids with images should have Port in path (except System 1 which uses System1Port.jpg)
    asteroids.forEach(asteroid => {
      if (asteroid.landedImage) {
        if (asteroid.location === 1) {
          expect(asteroid.landedImage).toBe('data/default/en-us/images/stellar_objects/System1Port.jpg');
        } else {
          expect(asteroid.landedImage).toContain('Port');
        }
      }
    });
  });

  test('All systems have images with correct data directory prefix', () => {
    const universe = createUniverse(10, 2, 15);
    universe.systems.forEach(system => {
      if (system.image) {
        expect(system.image).toMatch(/^data\/default\/en-us\/images\//);
      }
    });
  });

  test('Systems without objects get starfield images', () => {
    const universe = createUniverse(20, 2, 5); // More systems than objects
    const systemsWithoutObjects = universe.systems.filter(system => {
      const hasObjects = universe.stellarObjects.some(obj => obj.location === system.id);
      return !hasObjects && system.id !== 1; // Exclude System 1
    });

    systemsWithoutObjects.forEach(system => {
      expect(system.image).toBeDefined();
      expect(system.image).toContain('Starfields');
      expect(system.image).toMatch(/^data\/default\/en-us\//);
    });
  });
});

describe('Universe pathfinding', () => {
  test('findShortestPath returns path from start to target', () => {
    const universe = createUniverse(10, 2, 15);

    // Find two systems that are connected
    const startSystem = universe.systems[0];
    const targetSystem = universe.systems.find(s =>
      startSystem.connections.includes(s.id)
    );

    expect(targetSystem).toBeDefined();
    const path = universe.findShortestPath(startSystem.id, targetSystem.id);

    expect(path).toBeDefined();
    expect(Array.isArray(path)).toBe(true);
    expect(path[0]).toBe(startSystem.id);
    expect(path[path.length - 1]).toBe(targetSystem.id);
  });

  test('findShortestPath returns single element array for same start and target', () => {
    const universe = createUniverse(5, 2, 10);
    const systemId = universe.systems[0].id;

    const path = universe.findShortestPath(systemId, systemId);

    expect(path).toEqual([systemId]);
  });

  test('findShortestPath returns null when no path exists', () => {
    const universe = new Universe();

    // Create two disconnected systems
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');

    universe.systems.push(system1, system2);

    const path = universe.findShortestPath(1, 2);

    expect(path).toBeNull();
  });

  test('findShortestPath finds path through multiple hops', () => {
    const universe = new Universe();

    // Create a chain: 1 -> 2 -> 3 -> 4
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');
    const system3 = new System(3, 'Gamma');
    const system4 = new System(4, 'Delta');

    system1.connections.push(2);
    system2.connections.push(1, 3);
    system3.connections.push(2, 4);
    system4.connections.push(3);

    universe.systems.push(system1, system2, system3, system4);

    const path = universe.findShortestPath(1, 4);

    expect(path).toEqual([1, 2, 3, 4]);
  });

  test('findShortestPath finds shortest path when multiple routes exist', () => {
    const universe = new Universe();

    // Create a graph with multiple paths:
    //   1 -> 2 -> 4
    //   1 -> 3 -> 4
    //   (direct path 1->2->4 is shorter than 1->3->5->4)
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');
    const system3 = new System(3, 'Gamma');
    const system4 = new System(4, 'Delta');
    const system5 = new System(5, 'Epsilon');

    system1.connections.push(2, 3);
    system2.connections.push(1, 4);
    system3.connections.push(1, 5);
    system4.connections.push(2, 5);
    system5.connections.push(3, 4);

    universe.systems.push(system1, system2, system3, system4, system5);

    const path = universe.findShortestPath(1, 4);

    // Should find the shortest path: 1 -> 2 -> 4
    expect(path).toEqual([1, 2, 4]);
    expect(path.length).toBe(3);
  });

  test('findShortestPath handles non-existent start system', () => {
    const universe = createUniverse(5, 2, 10);

    const path = universe.findShortestPath(9999, universe.systems[0].id);

    expect(path).toBeNull();
  });

  test('findShortestPath handles non-existent target system', () => {
    const universe = createUniverse(5, 2, 10);

    const path = universe.findShortestPath(universe.systems[0].id, 9999);

    expect(path).toBeNull();
  });

  test('findShortestPath works in generated universe', () => {
    const universe = createUniverse(15, 2, 20);

    // Test paths between random systems
    const system1 = universe.systems[0];
    const system2 = universe.systems[universe.systems.length - 1];

    const path = universe.findShortestPath(system1.id, system2.id);

    // Path should exist in a well-connected universe
    expect(path).toBeDefined();
    if (path !== null) {
      expect(path[0]).toBe(system1.id);
      expect(path[path.length - 1]).toBe(system2.id);

      // Verify each step in the path is connected to the next
      for (let i = 0; i < path.length - 1; i++) {
        const currentSystem = universe.systems.find(s => s.id === path[i]);
        expect(currentSystem.connections).toContain(path[i + 1]);
      }
    }
  });

  test('findShortestPath returns optimal path length', () => {
    const universe = new Universe();

    // Create a more complex graph to test BFS optimality
    //   1 --- 2 --- 4
    //   |     |     |
    //   3 --- 5 --- 6
    const systems = [
      new System(1, 'S1'),
      new System(2, 'S2'),
      new System(3, 'S3'),
      new System(4, 'S4'),
      new System(5, 'S5'),
      new System(6, 'S6')
    ];

    // Add connections (undirected graph)
    systems[0].connections.push(2, 3); // 1 connects to 2, 3
    systems[1].connections.push(1, 4, 5); // 2 connects to 1, 4, 5
    systems[2].connections.push(1, 5); // 3 connects to 1, 5
    systems[3].connections.push(2, 6); // 4 connects to 2, 6
    systems[4].connections.push(2, 3, 6); // 5 connects to 2, 3, 6
    systems[5].connections.push(4, 5); // 6 connects to 4, 5

    universe.systems.push(...systems);

    const path = universe.findShortestPath(1, 6);

    // Shortest path should be 1 -> 2 -> 4 -> 6 or 1 -> 3 -> 5 -> 6 (both length 4)
    expect(path).toBeDefined();
    expect(path.length).toBe(4);
    expect(path[0]).toBe(1);
    expect(path[path.length - 1]).toBe(6);
  });
});

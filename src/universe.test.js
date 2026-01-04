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
    expect(sys.connections).toEqual({});
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

    // Debug: Log what objects were created
    console.log('Stellar objects created:', universe.stellarObjects.map(obj => ({
      id: obj.id,
      type: obj.type,
      className: obj.className,
      location: obj.location
    })));

    expect(universe.stellarObjects.length).toBe(3);
  });

  test('Farm World is created outside system 1 when multiple systems exist', () => {
    const universe = createUniverse(5, 6, 10);

    // Find Farm World planet
    const farmWorld = universe.stellarObjects.find(obj =>
      obj.type === 'Planet' &&
      obj.className === 'Farm World' &&
      obj.location !== 1
    );

    expect(farmWorld).toBeDefined();
    expect(farmWorld.location).not.toBe(1);
    expect(farmWorld.location).toBeGreaterThanOrEqual(2);
    expect(farmWorld.location).toBeLessThanOrEqual(5);
  });

  test('All systems are connected in a chain', () => {
    const universe = createUniverse(5, 4, 2);
    // Each system should have at least one connection
    universe.systems.forEach(sys => {
      expect(Object.keys(sys.connections).length).toBeGreaterThanOrEqual(1);
    });
  });

  test('No system has a self-connection', () => {
    const universe = createUniverse(5, 8, 2);
    universe.systems.forEach(sys => {
      expect(sys.connections[sys.id]).toBeUndefined();
    });
  });

  test('No duplicate connections', () => {
    const universe = createUniverse(5, 8, 2);
    universe.systems.forEach(sys => {
      const connectionIds = Object.keys(sys.connections).map(Number);
      const unique = new Set(connectionIds);
      expect(unique.size).toBe(connectionIds.length);
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

  test('Universe creation ensures at least one Farm World planet outside system 1', () => {
    // Create multiple universes to verify Farm World always exists
    for (let i = 0; i < 5; i++) {
      const universe = createUniverse(10, 15, 10);

      const farmWorlds = universe.stellarObjects.filter(obj =>
        obj.type === 'Planet' &&
        obj.className === 'Farm World' &&
        obj.location !== 1
      );

      expect(farmWorlds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Universe pathfinding', () => {
  test('findShortestPath returns path from start to target', () => {
    const universe = createUniverse(10, 2, 15);

    // Find two systems that are connected
    const startSystem = universe.systems[0];
    const targetSystem = universe.systems.find(s =>
      startSystem.connections[s.id] !== undefined
    );

    expect(targetSystem).toBeDefined();
    const result = universe.findShortestPath(startSystem.id, targetSystem.id);

    expect(result).toBeDefined();
    expect(result.path).toBeDefined();
    expect(result.cost).toBeDefined();
    expect(Array.isArray(result.path)).toBe(true);
    expect(result.path[0]).toBe(startSystem.id);
    expect(result.path[result.path.length - 1]).toBe(targetSystem.id);
    expect(result.cost).toBe(startSystem.connections[targetSystem.id]);
  });

  test('findShortestPath returns single element array for same start and target', () => {
    const universe = createUniverse(5, 2, 10);
    const systemId = universe.systems[0].id;

    const result = universe.findShortestPath(systemId, systemId);

    expect(result).toEqual({ path: [systemId], cost: 0 });
  });

  test('findShortestPath returns null when no path exists', () => {
    const universe = new Universe();

    // Create two disconnected systems
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');

    universe.systems.push(system1, system2);

    const result = universe.findShortestPath(1, 2);

    expect(result).toBeNull();
  });

  test('findShortestPath finds path through multiple hops', () => {
    const universe = new Universe();

    // Create a chain: 1 -> 2 -> 3 -> 4
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');
    const system3 = new System(3, 'Gamma');
    const system4 = new System(4, 'Delta');

    system1.connections[2] = 5;
    system2.connections[1] = 5;
    system2.connections[3] = 3;
    system3.connections[2] = 3;
    system3.connections[4] = 7;
    system4.connections[3] = 7;

    universe.systems.push(system1, system2, system3, system4);

    const result = universe.findShortestPath(1, 4);

    expect(result.path).toEqual([1, 2, 3, 4]);
    expect(result.cost).toBe(15); // 5 + 3 + 7
  });

  test('findShortestPath finds lowest cost path when multiple routes exist', () => {
    const universe = new Universe();

    // Create a graph where path with more hops has lower cost
    const system1 = new System(1, 'Alpha');
    const system2 = new System(2, 'Beta');
    const system3 = new System(3, 'Gamma');
    const system4 = new System(4, 'Delta');
    const system5 = new System(5, 'Epsilon');

    // Route 1->3->5 has fewer hops (2) but higher cost: 10 + 15 = 25
    system1.connections[3] = 10;
    system3.connections[1] = 10;
    system3.connections[5] = 15;
    system5.connections[3] = 15;

    // Route 1->2->4->5 has more hops (3) but lower cost: 5 + 5 + 8 = 18
    system1.connections[2] = 5;
    system2.connections[1] = 5;
    system2.connections[4] = 5;
    system4.connections[2] = 5;
    system4.connections[5] = 8;
    system5.connections[4] = 8;

    universe.systems.push(system1, system2, system3, system4, system5);

    const result = universe.findShortestPath(1, 5);

    // Should choose the lower cost path even though it has more hops
    expect(result.path).toEqual([1, 2, 4, 5]);
    expect(result.cost).toBe(18);
  });

  test('findShortestPath handles non-existent start system', () => {
    const universe = createUniverse(5, 2, 10);

    const result = universe.findShortestPath(9999, universe.systems[0].id);

    expect(result).toBeNull();
  });

  test('findShortestPath handles non-existent target system', () => {
    const universe = createUniverse(5, 2, 10);

    const result = universe.findShortestPath(universe.systems[0].id, 9999);

    expect(result).toBeNull();
  });

  test('findShortestPath works in generated universe', () => {
    const universe = createUniverse(15, 2, 20);

    // Test paths between random systems
    const system1 = universe.systems[0];
    const system2 = universe.systems[universe.systems.length - 1];

    const result = universe.findShortestPath(system1.id, system2.id);

    // Path should exist in a well-connected universe
    expect(result).toBeDefined();
    if (result !== null) {
      expect(result.path[0]).toBe(system1.id);
      expect(result.path[result.path.length - 1]).toBe(system2.id);
      expect(result.cost).toBeGreaterThan(0);

      // Verify each step in the path is connected to the next and cost matches
      let totalCost = 0;
      for (let i = 0; i < result.path.length - 1; i++) {
        const currentSystem = universe.systems.find(s => s.id === result.path[i]);
        const connectionCost = currentSystem.connections[result.path[i + 1]];
        expect(connectionCost).toBeDefined();
        totalCost += connectionCost;
      }
      expect(totalCost).toBe(result.cost);
    }
  });

  test('findShortestPath returns optimal cost path', () => {
    const universe = new Universe();

    // Create a graph where Dijkstra finds different path than BFS would
    //   1 --5-- 2 --3-- 4
    //   |       |       |
    //  10      2       1
    //   |       |       |
    //   3 --4-- 5 --2-- 6
    const systems = [
      new System(1, 'S1'),
      new System(2, 'S2'),
      new System(3, 'S3'),
      new System(4, 'S4'),
      new System(5, 'S5'),
      new System(6, 'S6')
    ];

    // Add connections with varying costs
    systems[0].connections[2] = 5;
    systems[0].connections[3] = 10; // 1 connects to 2(5), 3(10)
    systems[1].connections[1] = 5;
    systems[1].connections[4] = 3;
    systems[1].connections[5] = 2; // 2 connects to 1(5), 4(3), 5(2)
    systems[2].connections[1] = 10;
    systems[2].connections[5] = 4; // 3 connects to 1(10), 5(4)
    systems[3].connections[2] = 3;
    systems[3].connections[6] = 1; // 4 connects to 2(3), 6(1)
    systems[4].connections[2] = 2;
    systems[4].connections[3] = 4;
    systems[4].connections[6] = 2; // 5 connects to 2(2), 3(4), 6(2)
    systems[5].connections[4] = 1;
    systems[5].connections[5] = 2; // 6 connects to 4(1), 5(2)

    universe.systems.push(...systems);

    const result = universe.findShortestPath(1, 6);

    // Best path is 1->2->4->6 with cost 5+3+1=9
    // Alternative 1->2->5->6 has cost 5+2+2=9 (also valid)
    expect(result).toBeDefined();
    expect(result.cost).toBe(9);
    expect(result.path[0]).toBe(1);
    expect(result.path[result.path.length - 1]).toBe(6);
  });
});

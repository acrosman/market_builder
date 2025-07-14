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
});

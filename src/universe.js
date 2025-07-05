const fs = require('fs');
const path = require('path');

/**
 * Generic loader for JSON data files in the ../data directory.
 * @param {string} fileName - The name of the JSON file to load (without extension).
 * @returns {Object} The parsed JSON data.
 */
function loadDataFile(fileName) {
  const dataFile = path.join(__dirname, '../data', `${fileName}.json`);
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

/**
 * Represents a Universe in Universe Market Builder.
 */
class Universe {
  constructor() {
    this.systems = [];
    this.stellarObjects = [];
  }

  /**
   * Returns an object mapping each system id to a count of each type of stellar object it contains.
   * Example return:
   * {
   *   0: { Planet: 2, Astroid: 1 },
   *   1: { Planet: 1 },
   *   ...
   * }
   */
  getStellarObjectTypeCountsBySystem() {
    const counts = {};
    this.systems.forEach(system => {
      counts[system.id] = {};
    });
    this.stellarObjects.forEach(obj => {
      const sysId = obj.location;
      const type = obj.type;
      if (!counts[sysId]) counts[sysId] = {};
      if (!counts[sysId][type]) counts[sysId][type] = 0;
      counts[sysId][type]++;
    });
    return counts;
  }

  /**
   * Returns an object mapping each stellar object type to the total count in the universe.
   * Example return:
   * { Planet: 10, Astroid: 5 }
   */
  getStellarObjectTypeTotals() {
    const totals = {};
    this.stellarObjects.forEach(obj => {
      if (!totals[obj.type]) totals[obj.type] = 0;
      totals[obj.type]++;
    });
    return totals;
  }
}

/**
 * Represents a star system in the universe.
 */
class System {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.connections = []; // List of connected system ids
  }
}

/**
 * Represents a stellar object (e.g., planet, station, asteroid) in the universe.
 */
class StellarObject {
  constructor(id, type, className, location, details) {
    this.id = id;
    this.type = type; // e.g. "Planet", "Space Station", "Astroid"
    this.className = className; // e.g. "Earth-like", "Trading Post"
    this.location = location; // system id where the object is located

    // General properties from the data file
    this.market = details.market;
    this.buildings = details.buildings;
    this.shipyard = details.shipyard;
    this.shields = details.shields;
    this.cannons = details.cannons;
    this.fighters = details.fighters;
    this.resistance = details.resistance;

    // Class-specific properties
    const classDetails = details.classes[className];
    this.description = classDetails.description || "";
    this.populationLimit = classDetails.populationLimit || 0;
    this.reproductionRate = classDetails.reproductionRate || 0;
    this.buildingCredits = classDetails.buildingCredits || 0;
    this.buildingLimit = classDetails.buildingLimit || 0;

    // Generalized goods: copy all goods fields
    this.goods = { ...classDetails.goods };
  }
}

/**
 * Creates a new Universe instance.
 * @param {number} systemCount - Number of star systems in the universe.
 * @param {number} connectionCount - Number of connections between systems.
 * @param {number} objectsCount - Number of objects (e.g., planets, stations).
 * @returns {Universe} The created Universe instance.
 */
function createUniverse(systemCount, connectionCount, objectsCount) {
  const universe = new Universe();

  // Load stellar object definitions from JSON
  const stellarObjectsData = loadDataFile('stellarObjects');

  // Create systems
  for (let i = 0; i < systemCount; i++) {
    universe.systems.push(new System(i, `System ${i + 1}`));
  }

  // Shuffle systems to ensure all are connected in a chain
  const shuffled = universe.systems.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Connect each system to the next in the shuffled list
  for (let i = 0; i < shuffled.length - 1; i++) {
    const sysA = shuffled[i];
    const sysB = shuffled[i + 1];
    if (!sysA.connections.includes(sysB.id)) sysA.connections.push(sysB.id);
    if (!sysB.connections.includes(sysA.id)) sysB.connections.push(sysA.id);
  }

  let remainingConnections = connectionCount - (systemCount - 1);

  // Sort systems by id for consistent random selection
  universe.systems.sort((a, b) => a.id - b.id);

  // Add remaining random connections
  while (remainingConnections > 0) {
    const first = universe.systems[Math.floor(Math.random() * universe.systems.length)];
    const second = universe.systems[Math.floor(Math.random() * universe.systems.length)];
    if (first.id === second.id) continue;
    if (first.connections.includes(second.id)) continue;
    first.connections.push(second.id);
    second.connections.push(first.id);
    remainingConnections--;
  }

  // Create stellar objects and assign to random systems
  const stellarTypes = Object.keys(stellarObjectsData);
  for (let i = 0; i < objectsCount; i++) {
    // Randomly select a type and class
    const type = stellarTypes[Math.floor(Math.random() * stellarTypes.length)];
    const typeDetails = stellarObjectsData[type];
    const classNames = Object.keys(typeDetails.classes);
    const className = classNames[Math.floor(Math.random() * classNames.length)];
    const location = Math.floor(Math.random() * systemCount);

    const obj = new StellarObject(i, type, className, location, typeDetails);
    universe.stellarObjects.push(obj);
    // Optionally, add to the system's own list if you add that property
    // universe.systems[location].stellarObjects = universe.systems[location].stellarObjects || [];
    // universe.systems[location].stellarObjects.push(obj);
  }

  return universe;
}

module.exports = {
  Universe,
  System,
  StellarObject,
  createUniverse,
}

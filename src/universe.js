const fs = require('fs');
const path = require('path');

/**
 * Get list of image files from a directory
 * @param {string} imageDir - Directory path relative to app/
 * @returns {string[]} Array of image paths
 */
function getImagesFromDirectory(imageDir) {
  try {
    const fullPath = path.join(__dirname, '../app', imageDir);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Image directory not found: ${imageDir}`);
      return [];
    }
    const files = fs.readdirSync(fullPath);
    return files
      .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
      .map(file => path.join(imageDir, file).replace(/\\/g, '/'));
  } catch (error) {
    console.error(`Error reading image directory ${imageDir}:`, error);
    return [];
  }
}

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
   *   1: { Planet: 2, Asteroid: 1 },
   *   2: { Planet: 1 },
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
   * { Planet: 10, Asteroid: 5 }
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
    this.image = ''; // Will be set during universe creation
  }
}

/**
 * Represents a stellar object (e.g., planet, station, asteroid) in the universe.
 */
class StellarObject {
  constructor(id, type, className, location, details, name) {
    this.id = id;
    this.type = type; // e.g. "Planet", "Space Station", "Asteroid"
    this.className = className; // e.g. "Earth-like", "Trading Post"
    this.location = location; // system id where the object is located
    this.name = name; // e.g. "Aurora", "Apex Station"
    this.landedImage = ''; // Image for when player has landed/docked (surface or port)
    this.owner = 'Independent'; // Name of owning corporation or "Independent"
    this.value = 0; // Current calculated value of the stellar object

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

  /**
   * Gets an image for this type of object.
   * @param {object} stellarObjectsData - The stellar objects data from stellarObjects.json
   * @returns string, path to image.
   */
  getRandomImage(stellarObjectsData) {
    const typeData = stellarObjectsData[this.type];
    if (!typeData || !typeData.classes) {
      console.warn(`No type data found for: ${this.type}`);
      return '';
    }

    const classData = typeData.classes[this.className];
    if (!classData || !classData.imagePath) {
      console.warn(`No image path found for type: ${this.type}, class: ${this.className}`);
      return '';
    }

    const imageDir = classData.imagePath;
    const imageList = getImagesFromDirectory(imageDir);
    if (imageList.length === 0) {
      console.warn(`No images found in directory: ${imageDir}`);
      return '';
    }

    const randomIndex = Math.floor(Math.random() * imageList.length);
    return imageList[randomIndex];
  }

  /**
   * Gets a landed/docked image for this type of object (surface or port).
   * @param {object} stellarObjectsData - The stellar objects data from stellarObjects.json
   * @returns string, path to landed/port image.
   */
  getLandedImage(stellarObjectsData) {
    const typeData = stellarObjectsData[this.type];
    if (!typeData || !typeData.classes) {
      console.warn(`No type data found for: ${this.type}`);
      return '';
    }

    const classData = typeData.classes[this.className];
    if (!classData || !classData.imagePath) {
      console.warn(`No image path found for type: ${this.type}, class: ${this.className}`);
      return '';
    }

    // Determine subfolder based on type: planets use "Surface", stations and asteroids use "Port"
    const subfolder = this.type === 'Planet' ? 'Surface' : 'Port';
    const imageDir = path.join(classData.imagePath, subfolder).replace(/\\/g, '/');

    const imageList = getImagesFromDirectory(imageDir);
    if (imageList.length === 0) {
      console.warn(`No landed images found in directory: ${imageDir}`);
      return '';
    }

    const randomIndex = Math.floor(Math.random() * imageList.length);
    return imageList[randomIndex];
  }

  /**
   * Calculates the value of this stellar object based on its properties
   * @param {Object} baseValues - Object containing base values for different property types
   * @returns {number} The calculated value
   */
  calculateValue(baseValues = {}) {
    let value = 0;

    // Base value from building credits
    value += this.buildingCredits || 0;

    // Add value from population capacity
    const populationValue = baseValues.populationValue || 100;
    value += (this.populationLimit || 0) * populationValue;

    // Add value from market capability
    if (this.market) {
      value += baseValues.marketValue || 10000;
    }

    // Add value from shipyard capability
    if (this.shipyard) {
      value += baseValues.shipyardValue || 15000;
    }

    // Add value from buildings
    if (this.buildings) {
      value += baseValues.buildingValue || 5000;
    }

    // Add value from defenses
    const defenseValue = baseValues.defenseValue || 1000;
    value += (this.shields || 0) * defenseValue;
    value += (this.cannons || 0) * defenseValue;
    value += (this.fighters || 0) * defenseValue * 0.5;

    // Add value from building limit
    const buildingLimitValue = baseValues.buildingLimitValue || 500;
    value += (this.buildingLimit || 0) * buildingLimitValue;

    return Math.round(value);
  }

  /**
   * Sets the owner of this stellar object
   * @param {string} ownerName - The name of the owning corporation or "Independent"
   */
  setOwner(ownerName) {
    this.owner = ownerName || 'Independent';
  }
}

/**
 * Creates a new Universe instance.
 * @param {number} systemCount - Number of star systems in the universe.
 * @param {number} connectionCount - Number of connections between systems.
 * @param {number} objectsCount - Number of objects (e.g., planets, stations).
 * @returns {Universe} The created Universe instance.
 */
// Create a set of used names to avoid duplicates (module scope for test access)
const usedPlanetNames = new Set();
const usedStationNames = new Set();

/**
 * Get a random unique name for a stellar object
 * @param {string} type - The type of object (Planet, Space Station, Asteroid)
 * @param {object} typeDetails - The stellar object type details from stellarObjects.json
 * @returns {string} A unique name for the object
 */
function getUniqueName(type, typeDetails) {
  // These must be loaded each call to ensure fresh data for tests
  const planetNamesData = loadDataFile('planet_names');
  const stationNamesData = loadDataFile('station_names');
  let nameList, usedNames;
  // Determine which name source to use
  const nameSource = typeDetails?.nameSource;

  if (nameSource === 'planets') {
    nameList = planetNamesData?.names;
    usedNames = usedPlanetNames;
  } else if (nameSource === 'stations') {
    nameList = stationNamesData?.names;
    usedNames = usedStationNames;
  } else {
    // For types without name data, generate a generic name
    return `${type} ${Math.floor(Math.random() * 1000000)}`;
  }

  // If name data is missing, fall back to generic name
  if (!nameList || !Array.isArray(nameList) || nameList.length === 0) {
    return `${type} ${Math.floor(Math.random() * 1000000)}`;
  }

  // Get a random name that hasn't been used yet
  let name;
  let attempts = 0;
  do {
    name = nameList[Math.floor(Math.random() * nameList.length)];
    attempts++;
  } while (usedNames.has(name) && attempts < 100);

  usedNames.add(name);
  return name;
}

function createUniverse(systemCount, connectionCount, objectsCount) {
  const universe = new Universe();
  const settings = loadDataFile('game_settings');
  const stellarObjectsData = loadDataFile('stellarObjects');
  const planetNamesData = loadDataFile('planet_names');
  const stationNamesData = loadDataFile('station_names');

  // Create systems starting from 1
  for (let i = 1; i <= systemCount; i++) {
    universe.systems.push(new System(i, `System ${i}`));
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


  // Add required objects to system one (home system)
  let objectId = 0;
  if (settings.starting_system && settings.starting_system.required_objects) {
    settings.starting_system.required_objects.forEach(required => {
      const typeDetails = stellarObjectsData[required.type];
      const name = getUniqueName(required.type, typeDetails);
      const obj = new StellarObject(
        objectId++,
        required.type,
        required.class,
        1,
        typeDetails,
        name
      );
      // System 1 objects use specific images based on type
      if (obj.type === 'Planet') {
        obj.landedImage = 'images/stellar_objects/System1Surface.jpg';
      } else if (obj.type === 'Space Station' || obj.type === 'Asteroid') {
        obj.landedImage = 'images/stellar_objects/System1Port.jpg';
      }
      universe.stellarObjects.push(obj);
    });
  }

  // Create remaining stellar objects and assign to random systems (avoiding system 1)
  const stellarTypes = Object.keys(stellarObjectsData);
  const remainingObjects = objectsCount - objectId;

  for (let i = 0; i < remainingObjects; i++) {
    // Randomly select a type and class
    const type = stellarTypes[Math.floor(Math.random() * stellarTypes.length)];
    const typeDetails = stellarObjectsData[type];
    const classNames = Object.keys(typeDetails.classes);
    const className = classNames[Math.floor(Math.random() * classNames.length)];

    // Assign to random system (but not system 1)
    const location = Math.floor(Math.random() * (systemCount - 1)) + 2;

    const name = getUniqueName(type, typeDetails);
    const obj = new StellarObject(objectId++, type, className, location, typeDetails, name);

    // Assign landed/port image
    obj.landedImage = obj.getLandedImage(stellarObjectsData);

    universe.stellarObjects.push(obj);

    // Add an image for the system.
    const imagePath = obj.getRandomImage(stellarObjectsData);
    universe.systems.find(s => s.id === location).image = imagePath;

  }

  // Set system 1 image
  const system1 = universe.systems.find(s => s.id === 1);
  if (system1) {
    system1.image = 'images/stellar_objects/System1.jpg';
  }

  // Get starfield images for systems without objects
  const starfieldImages = getImagesFromDirectory('images/stellar_objects/Starfields');

  universe.systems.forEach(system => {
    if (system.id === 1) return; // Skip system 1, already set

    const hasObjects = universe.stellarObjects.some(obj => obj.location === system.id);
    if (!hasObjects && starfieldImages.length > 0) {
      const randomIndex = Math.floor(Math.random() * starfieldImages.length);
      system.image = starfieldImages[randomIndex];
    }
  });

  return universe;
}

module.exports = {
  Universe,
  System,
  StellarObject,
  createUniverse,
  getUniqueName
}
